-- M2: tenant security. Apply after 001 and 002, as the database owner.
-- Do NOT expose the private schema in PostgREST / Supabase API settings.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- These caller-bound helpers bypass membership RLS to avoid recursive policies.
-- Never accept a caller-supplied user ID for the actor.
CREATE OR REPLACE FUNCTION private.org_role(p_org_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT m.role FROM control.org_members m
  WHERE m.org_id = p_org_id AND m.user_id = (SELECT auth.uid())
$$;

CREATE OR REPLACE FUNCTION private.project_role(p_project_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN om.role IN ('owner', 'admin') THEN om.role ELSE pm.role END
  FROM control.projects p
  JOIN control.org_members om ON om.org_id = p.org_id
    AND om.user_id = (SELECT auth.uid())
  LEFT JOIN control.project_members pm ON pm.project_id = p.id
    AND pm.user_id = (SELECT auth.uid())
  WHERE p.id = p_project_id
$$;

REVOKE ALL ON FUNCTION private.org_role(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.project_role(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.org_role(UUID), private.project_role(UUID)
  TO authenticated, service_role;

-- Remove recursive membership policies. Admins may manage ordinary members;
-- only org owners can grant or modify elevated org roles.
DROP POLICY org_members_select ON control.org_members;
DROP POLICY org_members_insert_admin ON control.org_members;
DROP POLICY org_members_update_admin ON control.org_members;
DROP POLICY org_members_delete_admin ON control.org_members;

CREATE POLICY org_members_select ON control.org_members
  FOR SELECT TO authenticated USING (private.org_role(org_id) IS NOT NULL);

CREATE POLICY org_members_insert_admin ON control.org_members
  FOR INSERT TO authenticated WITH CHECK (
    private.org_role(org_id) = 'owner'
    OR (private.org_role(org_id) = 'admin' AND role = 'member')
  );

CREATE POLICY org_members_update_admin ON control.org_members
  FOR UPDATE TO authenticated USING (
    private.org_role(org_id) = 'owner'
    OR (private.org_role(org_id) = 'admin' AND role = 'member')
  ) WITH CHECK (
    private.org_role(org_id) = 'owner'
    OR (private.org_role(org_id) = 'admin' AND role = 'member')
  );

CREATE POLICY org_members_delete_admin ON control.org_members
  FOR DELETE TO authenticated USING (
    private.org_role(org_id) = 'owner'
    OR (private.org_role(org_id) = 'admin' AND role = 'member')
  );

-- Ordinary org membership does not imply access to every project.
DROP POLICY projects_select ON control.projects;
DROP POLICY projects_insert ON control.projects;
DROP POLICY projects_update ON control.projects;
DROP POLICY projects_delete ON control.projects;

CREATE POLICY projects_select ON control.projects
  FOR SELECT TO authenticated USING (private.project_role(id) IS NOT NULL);
CREATE POLICY projects_update ON control.projects
  FOR UPDATE TO authenticated
  USING (private.project_role(id) IN ('owner', 'admin'))
  WITH CHECK (private.project_role(id) IN ('owner', 'admin'));
CREATE POLICY projects_delete ON control.projects
  FOR DELETE TO authenticated USING (private.org_role(org_id) = 'owner');
-- Project insertion stays behind the service-only creation RPC.

DROP POLICY project_members_select ON control.project_members;
DROP POLICY project_members_insert ON control.project_members;
DROP POLICY project_members_update ON control.project_members;
DROP POLICY project_members_delete ON control.project_members;

CREATE POLICY project_members_select ON control.project_members
  FOR SELECT TO authenticated USING (private.project_role(project_id) IS NOT NULL);

CREATE POLICY project_members_insert ON control.project_members
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM control.projects p
      JOIN control.org_members target ON target.org_id = p.org_id
      WHERE p.id = project_id AND target.user_id = project_members.user_id
        AND (
          private.org_role(p.org_id) = 'owner'
          OR (private.project_role(p.id) IN ('owner', 'admin') AND project_members.role <> 'owner')
        )
    )
  );

CREATE POLICY project_members_update ON control.project_members
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM control.projects p WHERE p.id = project_id
      AND (private.org_role(p.org_id) = 'owner'
        OR (private.project_role(p.id) IN ('owner', 'admin') AND project_members.role <> 'owner'))
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM control.projects p
      JOIN control.org_members target ON target.org_id = p.org_id
      WHERE p.id = project_id AND target.user_id = project_members.user_id
        AND (private.org_role(p.org_id) = 'owner'
          OR (private.project_role(p.id) IN ('owner', 'admin') AND project_members.role <> 'owner'))
    )
  );

CREATE POLICY project_members_delete ON control.project_members
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM control.projects p WHERE p.id = project_id
      AND (private.org_role(p.org_id) = 'owner'
        OR (private.project_role(p.id) IN ('owner', 'admin') AND project_members.role <> 'owner'))
    )
  );

-- Quotas and audit authorship are server-controlled, even for tenant owners.
DROP POLICY subscriptions_update_owner ON control.subscriptions;
DROP POLICY audit_logs_insert ON control.audit_logs;

GRANT USAGE ON SCHEMA control TO authenticated, service_role;
REVOKE ALL ON control.organisations, control.org_members, control.subscriptions,
  control.audit_logs, control.projects, control.project_members FROM PUBLIC, anon, authenticated;
-- Remove column grants too: revoking table grants alone does not remove them.
REVOKE ALL (id, name, slug, created_at, updated_at) ON control.organisations FROM PUBLIC, anon, authenticated;
REVOKE ALL (id, org_id, user_id, role, created_at) ON control.org_members FROM PUBLIC, anon, authenticated;
REVOKE ALL (id, org_id, tier, max_projects, starts_at, ends_at, created_at, updated_at) ON control.subscriptions FROM PUBLIC, anon, authenticated;
REVOKE ALL (id, org_id, user_id, action, entity_type, entity_id, metadata, ip_address, created_at) ON control.audit_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL (id, org_id, name, description, created_by, created_at, updated_at) ON control.projects FROM PUBLIC, anon, authenticated;
REVOKE ALL (id, project_id, user_id, role, created_at) ON control.project_members FROM PUBLIC, anon, authenticated;

GRANT SELECT ON control.organisations, control.org_members, control.subscriptions,
  control.audit_logs, control.projects, control.project_members TO authenticated;
GRANT UPDATE (name, slug) ON control.organisations TO authenticated;
GRANT DELETE ON control.organisations TO authenticated;
GRANT INSERT, DELETE ON control.org_members, control.project_members TO authenticated;
GRANT UPDATE (role) ON control.org_members, control.project_members TO authenticated;
GRANT UPDATE (name, description) ON control.projects TO authenticated;
GRANT DELETE ON control.projects TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA control TO service_role;

-- Existing RPCs accept an actor ID and bypass RLS. Only trusted server code may
-- call them, after JWT + role checks. Pin name resolution as defense in depth.
ALTER FUNCTION control.create_organisation(TEXT, TEXT, UUID) SET search_path = '';
ALTER FUNCTION control.create_project(UUID, TEXT, TEXT, UUID) SET search_path = '';
REVOKE ALL ON FUNCTION control.create_organisation(TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION control.create_project(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION control.create_organisation(TEXT, TEXT, UUID),
  control.create_project(UUID, TEXT, TEXT, UUID) TO service_role;

COMMIT;
