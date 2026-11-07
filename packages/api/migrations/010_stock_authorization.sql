-- M10 regression hardening: exposed stock RPC must authorize direct Data API calls.
BEGIN;
ALTER FUNCTION inventory.record_stock_movement(UUID,UUID,TEXT,NUMERIC,TEXT,TEXT,UUID)
  RENAME TO record_stock_movement_internal;
REVOKE ALL ON FUNCTION inventory.record_stock_movement_internal(UUID,UUID,TEXT,NUMERIC,TEXT,TEXT,UUID)
  FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION inventory.record_stock_movement(
  p_project_id UUID, p_item_id UUID, p_type TEXT, p_quantity NUMERIC,
  p_reason TEXT DEFAULT NULL, p_reference_id TEXT DEFAULT NULL, p_created_by UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor UUID := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  IF p_created_by IS NOT NULL AND p_created_by <> actor THEN
    RAISE EXCEPTION 'Actor mismatch' USING ERRCODE='42501';
  END IF;
  -- Serialize membership revocation with authorization and the stock transaction.
  PERFORM 1 FROM control.org_members m JOIN control.projects p ON p.org_id=m.org_id
    WHERE p.id=p_project_id AND m.user_id=actor FOR SHARE OF m;
  PERFORM 1 FROM control.project_members WHERE project_id=p_project_id AND user_id=actor FOR SHARE;
  IF private.project_role(p_project_id) IS NULL THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE='P0002';
  END IF;
  IF private.project_role(p_project_id) NOT IN ('owner','admin','editor') THEN
    RAISE EXCEPTION 'Stock write forbidden' USING ERRCODE='42501';
  END IF;
  IF p_type IS NULL OR p_project_id IS NULL OR p_item_id IS NULL
     OR char_length(p_reason)>1000 OR char_length(p_reference_id)>200 THEN
    RAISE EXCEPTION 'Invalid movement parameters' USING ERRCODE='22023';
  END IF;
  RETURN inventory.record_stock_movement_internal(p_project_id,p_item_id,p_type,p_quantity,p_reason,p_reference_id,actor);
END;
$$;
REVOKE ALL ON FUNCTION inventory.record_stock_movement(UUID,UUID,TEXT,NUMERIC,TEXT,TEXT,UUID)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION inventory.record_stock_movement(UUID,UUID,TEXT,NUMERIC,TEXT,TEXT,UUID) TO authenticated;
COMMIT;
