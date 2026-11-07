-- M9: project audit history and caller-scoped dashboard aggregates.
BEGIN;
CREATE TABLE inventory.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES control.projects(id) ON DELETE RESTRICT,
  actor_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_project_idx ON inventory.audit_events(project_id, id);
ALTER TABLE inventory.audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inventory.audit_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON inventory.audit_events TO authenticated;
CREATE POLICY audit_events_read ON inventory.audit_events FOR SELECT TO authenticated
  USING (private.project_role(project_id) IN ('owner', 'admin'));

CREATE FUNCTION private.audit_inventory_change() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE event_row RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN event_row := OLD; ELSE event_row := NEW; END IF;
  INSERT INTO inventory.audit_events(project_id, actor_id, action, entity_type, entity_id)
    VALUES(event_row.project_id, auth.uid(), lower(TG_OP), TG_TABLE_NAME, event_row.id);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.audit_inventory_change() FROM PUBLIC, anon, authenticated, service_role;
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['categories','templates','template_versions','items','stock_movements'] LOOP
    EXECUTE format('CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON inventory.%I FOR EACH ROW EXECUTE FUNCTION private.audit_inventory_change()', table_name);
  END LOOP;
END;
$$;

CREATE FUNCTION public.project_dashboard(p_project_id UUID) RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'items', (SELECT count(*) FROM inventory.items WHERE project_id = p_project_id),
    'categories', (SELECT count(*) FROM inventory.categories WHERE project_id = p_project_id),
    'templates', (SELECT count(*) FROM inventory.templates WHERE project_id = p_project_id),
    'movements', (SELECT count(*) FROM inventory.stock_movements WHERE project_id = p_project_id),
    'outOfStockItems', (SELECT count(*) FROM inventory.items WHERE project_id = p_project_id AND quantity <= 0)
  ) WHERE private.project_role(p_project_id) IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.project_dashboard(UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.project_dashboard(UUID) TO authenticated;
COMMIT;
