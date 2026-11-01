-- Migration 002: Projects and Project Members
-- Extends the control schema with project management and project-level roles.
-- Depends on: 001_control_schema.sql

-- ============================================================================
-- PROJECTS — org-scoped, data isolation unit
-- ============================================================================
CREATE TABLE control.projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES control.organisations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
  created_by  UUID NOT NULL REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_org ON control.projects (org_id);
CREATE INDEX idx_projects_created_by ON control.projects (created_by);

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON control.projects
  FOR EACH ROW EXECUTE FUNCTION control.set_updated_at();

-- ============================================================================
-- PROJECT MEMBERS — project-level roles
-- ============================================================================
CREATE TABLE control.project_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES control.projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'viewer'
              CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX idx_project_members_user    ON control.project_members (user_id);
CREATE INDEX idx_project_members_project ON control.project_members (project_id);

-- ============================================================================
-- ROW LEVEL SECURITY — Projects
-- ============================================================================
ALTER TABLE control.projects ENABLE ROW LEVEL SECURITY;

-- Users can see projects in their organisations
CREATE POLICY projects_select ON control.projects
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM control.org_members WHERE user_id = auth.uid())
  );

-- Org admins/owners can create projects (quota checked at app layer)
CREATE POLICY projects_insert ON control.projects
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM control.org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Project owners and org owners/admins can update projects
CREATE POLICY projects_update ON control.projects
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM control.org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
    OR id IN (
      SELECT project_id FROM control.project_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Only org owners can delete projects
CREATE POLICY projects_delete ON control.projects
  FOR DELETE USING (
    org_id IN (
      SELECT org_id FROM control.org_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- ============================================================================
-- ROW LEVEL SECURITY — Project Members
-- ============================================================================
ALTER TABLE control.project_members ENABLE ROW LEVEL SECURITY;

-- Org members can see project members for projects in their org
CREATE POLICY project_members_select ON control.project_members
  FOR SELECT USING (
    project_id IN (
      SELECT p.id FROM control.projects p
      JOIN control.org_members om ON om.org_id = p.org_id
      WHERE om.user_id = auth.uid()
    )
  );

-- Only project owners and org admins/owners can manage project members
CREATE POLICY project_members_insert ON control.project_members
  FOR INSERT WITH CHECK (
    project_id IN (
      SELECT p.id FROM control.projects p
      JOIN control.org_members om ON om.org_id = p.org_id
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
    OR project_id IN (
      SELECT project_id FROM control.project_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

CREATE POLICY project_members_update ON control.project_members
  FOR UPDATE USING (
    project_id IN (
      SELECT p.id FROM control.projects p
      JOIN control.org_members om ON om.org_id = p.org_id
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
    OR project_id IN (
      SELECT project_id FROM control.project_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

CREATE POLICY project_members_delete ON control.project_members
  FOR DELETE USING (
    project_id IN (
      SELECT p.id FROM control.projects p
      JOIN control.org_members om ON om.org_id = p.org_id
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
    OR project_id IN (
      SELECT project_id FROM control.project_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- ============================================================================
-- FUNCTION: Create project with quota check (race-safe)
-- ============================================================================
CREATE OR REPLACE FUNCTION control.create_project(
  p_org_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_user_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_max_projects INTEGER;
  v_current_count INTEGER;
  v_project_id UUID;
BEGIN
  -- Lock the subscription row to prevent race conditions
  SELECT max_projects INTO v_max_projects
  FROM control.subscriptions
  WHERE org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No subscription found for organisation'
      USING ERRCODE = 'P0002';
  END IF;

  -- Count current projects
  SELECT COUNT(*) INTO v_current_count
  FROM control.projects
  WHERE org_id = p_org_id;

  -- Check quota
  IF v_max_projects IS NOT NULL AND v_current_count >= v_max_projects THEN
    RAISE EXCEPTION 'Project quota exceeded: % of % used', v_current_count, v_max_projects
      USING ERRCODE = 'P0003';
  END IF;

  -- Create project
  INSERT INTO control.projects (org_id, name, description, created_by)
  VALUES (p_org_id, p_name, p_description, p_user_id)
  RETURNING id INTO v_project_id;

  -- Add creator as project owner
  INSERT INTO control.project_members (project_id, user_id, role)
  VALUES (v_project_id, p_user_id, 'owner');

  -- Audit log
  INSERT INTO control.audit_logs (org_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (p_org_id, p_user_id, 'project.create', 'project', v_project_id,
    jsonb_build_object('name', p_name, 'projects_used', v_current_count + 1, 'max_projects', v_max_projects)
  );

  RETURN v_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

