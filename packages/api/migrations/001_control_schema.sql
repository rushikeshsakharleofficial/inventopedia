-- Migration 001: Control Schema
-- Creates the control-plane tables for multi-tenant organisation management.
-- Depends on: Supabase Auth (auth.users)

-- ============================================================================
-- SCHEMA
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS control;

-- ============================================================================
-- ORGANISATIONS — tenant boundary
-- ============================================================================
CREATE TABLE control.organisations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  slug        TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_organisations_slug ON control.organisations (slug);

-- ============================================================================
-- ORG MEMBERS — user-to-org membership with role
-- ============================================================================
CREATE TABLE control.org_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES control.organisations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX idx_org_members_user ON control.org_members (user_id);
CREATE INDEX idx_org_members_org  ON control.org_members (org_id);

-- ============================================================================
-- SUBSCRIPTIONS — org-level subscription tier and limits
-- ============================================================================
CREATE TABLE control.subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL UNIQUE REFERENCES control.organisations(id) ON DELETE CASCADE,
  tier            TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'starter', 'business', 'enterprise')),
  max_projects    INTEGER NOT NULL DEFAULT 2, -- overridable for enterprise
  -- Additional quota columns can be added here
  starts_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at         TIMESTAMPTZ, -- NULL = no expiry
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- AUDIT LOGS — immutable record of significant actions
-- ============================================================================
CREATE TABLE control.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES control.organisations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  action      TEXT NOT NULL,                   -- e.g. 'org.create', 'project.delete'
  entity_type TEXT,                            -- e.g. 'organisation', 'project', 'item'
  entity_id   UUID,                            -- ID of affected entity
  metadata    JSONB DEFAULT '{}',              -- additional context
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_org     ON control.audit_logs (org_id, created_at DESC);
CREATE INDEX idx_audit_logs_user    ON control.audit_logs (user_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity  ON control.audit_logs (entity_type, entity_id);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION control.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organisations_updated_at
  BEFORE UPDATE ON control.organisations
  FOR EACH ROW EXECUTE FUNCTION control.set_updated_at();

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON control.subscriptions
  FOR EACH ROW EXECUTE FUNCTION control.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Organisations: users can only see orgs they belong to
ALTER TABLE control.organisations ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_select_member ON control.organisations
  FOR SELECT USING (
    id IN (SELECT org_id FROM control.org_members WHERE user_id = auth.uid())
  );

CREATE POLICY org_update_admin ON control.organisations
  FOR UPDATE USING (
    id IN (
      SELECT org_id FROM control.org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY org_delete_owner ON control.organisations
  FOR DELETE USING (
    id IN (
      SELECT org_id FROM control.org_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Org Members: users can see members of orgs they belong to
ALTER TABLE control.org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_members_select ON control.org_members
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM control.org_members WHERE user_id = auth.uid())
  );

CREATE POLICY org_members_insert_admin ON control.org_members
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM control.org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY org_members_update_admin ON control.org_members
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM control.org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY org_members_delete_admin ON control.org_members
  FOR DELETE USING (
    org_id IN (
      SELECT org_id FROM control.org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Subscriptions: viewable by org members, updatable by owner
ALTER TABLE control.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_select ON control.subscriptions
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM control.org_members WHERE user_id = auth.uid())
  );

CREATE POLICY subscriptions_update_owner ON control.subscriptions
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM control.org_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Audit Logs: viewable by org admins/owners, never updatable/deletable via API
ALTER TABLE control.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_select_admin ON control.audit_logs
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM control.org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- INSERT policy: any org member can generate audit entries (via service role in practice)
CREATE POLICY audit_logs_insert ON control.audit_logs
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM control.org_members WHERE user_id = auth.uid())
  );

-- No UPDATE or DELETE policies on audit_logs — they are immutable

-- ============================================================================
-- HELPER FUNCTION: Create org with owner membership + free subscription
-- ============================================================================
CREATE OR REPLACE FUNCTION control.create_organisation(
  p_name TEXT,
  p_slug TEXT,
  p_user_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Create the organisation
  INSERT INTO control.organisations (name, slug)
  VALUES (p_name, p_slug)
  RETURNING id INTO v_org_id;

  -- Add the creator as owner
  INSERT INTO control.org_members (org_id, user_id, role)
  VALUES (v_org_id, p_user_id, 'owner');

  -- Create free subscription
  INSERT INTO control.subscriptions (org_id, tier, max_projects)
  VALUES (v_org_id, 'free', 2);

  -- Audit log
  INSERT INTO control.audit_logs (org_id, user_id, action, entity_type, entity_id)
  VALUES (v_org_id, p_user_id, 'org.create', 'organisation', v_org_id);

  RETURN v_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
