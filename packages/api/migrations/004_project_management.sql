-- M3: fixed-tier quotas and atomic, authorized project creation.
-- Apply after 003 as the database owner. No hosted execution is implied.
BEGIN;

ALTER TABLE control.subscriptions ALTER COLUMN max_projects DROP NOT NULL;
-- Refuse inconsistent existing configurations rather than rewriting subscription data.
ALTER TABLE control.subscriptions ADD CONSTRAINT subscriptions_project_limit CHECK (
  (tier = 'free' AND max_projects IS NOT NULL AND max_projects = 2)
  OR (tier = 'starter' AND max_projects IS NOT NULL AND max_projects = 5)
  OR (tier = 'business' AND max_projects IS NOT NULL AND max_projects = 10)
  OR (tier = 'enterprise' AND (max_projects IS NULL OR max_projects >= 0))
);

CREATE OR REPLACE FUNCTION control.create_project(
  p_org_id UUID, p_name TEXT, p_description TEXT, p_user_id UUID
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_max_projects INTEGER;
  v_current_count BIGINT;
  v_project_id UUID;
BEGIN
  -- All creation for an organisation serializes on this row. The following count
  -- is a fresh statement snapshot under the Data API's READ COMMITTED isolation.
  SELECT max_projects INTO v_max_projects FROM control.subscriptions
  WHERE org_id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No subscription found for organisation' USING ERRCODE = 'P0002';
  END IF;

  -- Recheck the trusted server's actor inside the transaction. A concurrent
  -- membership revocation/demotion waits until creation commits or rolls back.
  PERFORM 1 FROM control.org_members
  WHERE org_id = p_org_id AND user_id = p_user_id AND role IN ('owner', 'admin')
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project creation requires org owner or admin' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_current_count FROM control.projects WHERE org_id = p_org_id;
  IF v_max_projects IS NOT NULL AND v_current_count >= v_max_projects THEN
    RAISE EXCEPTION 'Project quota exceeded' USING ERRCODE = 'P0003';
  END IF;

  INSERT INTO control.projects (org_id, name, description, created_by)
  VALUES (p_org_id, p_name, p_description, p_user_id) RETURNING id INTO v_project_id;
  INSERT INTO control.project_members (project_id, user_id, role)
  VALUES (v_project_id, p_user_id, 'owner');
  INSERT INTO control.audit_logs (org_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (p_org_id, p_user_id, 'project.create', 'project', v_project_id,
    jsonb_build_object('name', p_name, 'projects_used', v_current_count + 1, 'max_projects', v_max_projects));
  RETURN v_project_id;
END;
$$;

REVOKE ALL ON FUNCTION control.create_project(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION control.create_project(UUID, TEXT, TEXT, UUID) TO service_role;

COMMIT;
