-- Audit fixes: DB-enforced item attributes; safe transfers; signed adjustments;
-- guarded publication; bounded uploads. Apply only after 001-010 and review.
BEGIN;

-- Validate every writer, including direct PostgREST table calls and service-role.
CREATE FUNCTION private.validate_item_attributes() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_schema jsonb; v_field jsonb; v_value jsonb; v_key text; v_type text;
  v_input_key text; v_date text;
BEGIN
  IF pg_catalog.octet_length(NEW.attributes::text) > 65536 THEN
    RAISE EXCEPTION 'Item attributes exceed 64 KiB' USING ERRCODE = '23514';
  END IF;
  SELECT schema INTO v_schema FROM inventory.template_versions
    WHERE id = NEW.template_version_id AND project_id = NEW.project_id
      AND published_at IS NOT NULL;
  IF v_schema IS NULL OR NOT private.valid_template_schema(v_schema) THEN
    RAISE EXCEPTION 'Published template schema is invalid' USING ERRCODE = '23514';
  END IF;
  IF jsonb_typeof(NEW.attributes) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Attributes must be an object' USING ERRCODE = '23514';
  END IF;
  FOR v_input_key IN SELECT jsonb_object_keys(NEW.attributes) LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_schema->'fields') AS f(value)
      WHERE f.value->>'key' = v_input_key) THEN
      RAISE EXCEPTION 'Unknown item attribute: %', v_input_key USING ERRCODE = '23514';
    END IF;
  END LOOP;
  FOR v_field IN SELECT jsonb_array_elements(v_schema->'fields') LOOP
    v_key := v_field->>'key';
    v_type := v_field->>'type';
    IF NOT (NEW.attributes ? v_key) THEN
      IF coalesce((v_field->>'required')::boolean,false) THEN
        RAISE EXCEPTION 'Missing required attribute: %', v_key USING ERRCODE = '23514';
      END IF;
      CONTINUE;
    END IF;
    v_value := NEW.attributes->v_key;
    IF (v_type = 'text' AND
        (jsonb_typeof(v_value) <> 'string' OR char_length(v_value #>> '{}') > 10000))
      OR (v_type = 'number' AND jsonb_typeof(v_value) <> 'number')
      OR (v_type = 'boolean' AND jsonb_typeof(v_value) <> 'boolean')
      OR (v_type = 'date' AND jsonb_typeof(v_value) <> 'string')
      OR (v_type = 'select' AND
        (jsonb_typeof(v_value) <> 'string' OR
         NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_field->'options') AS o(option)
           WHERE o.option = v_value #>> '{}'))) THEN
      RAISE EXCEPTION 'Invalid value for attribute %', v_key USING ERRCODE = '23514';
    END IF;
    IF v_type = 'date' THEN
      v_date := v_value #>> '{}';
      IF v_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        OR to_char(to_date(v_date,'YYYY-MM-DD'),'YYYY-MM-DD') <> v_date THEN
        RAISE EXCEPTION 'Invalid date for attribute %', v_key USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER b_validate_attributes BEFORE INSERT OR UPDATE OF attributes
  ON inventory.items FOR EACH ROW EXECUTE FUNCTION private.validate_item_attributes();
REVOKE ALL ON FUNCTION private.validate_item_attributes() FROM PUBLIC,anon,authenticated,service_role;

-- Only lifecycle RPC may publish a template version. It already verifies
-- private.project_role and locks the owning template before making both writes.
ALTER FUNCTION inventory.publish_template_version(uuid,uuid,uuid) SECURITY DEFINER;
REVOKE INSERT(published_at) ON inventory.template_versions FROM authenticated;
REVOKE UPDATE(published_at) ON inventory.template_versions FROM authenticated;

-- Preserve old transfer rows but require a destination for every new transfer.
ALTER TABLE inventory.stock_movements ADD COLUMN destination_item_id uuid;
ALTER TABLE inventory.stock_movements
  ADD CONSTRAINT stock_destination_same_project
  FOREIGN KEY(project_id,destination_item_id) REFERENCES inventory.items(project_id,id)
  ON DELETE RESTRICT;
ALTER TABLE inventory.stock_movements
  ADD CONSTRAINT transfer_requires_destination CHECK (
    type <> 'transfer' OR destination_item_id IS NOT NULL
  ) NOT VALID;

-- Existing protected wrapper remains the only way to invoke this internal
-- implementation for receive, ship, return and signed adjust.
CREATE OR REPLACE FUNCTION inventory.record_stock_movement_internal(
  p_project_id uuid,p_item_id uuid,p_type text,p_quantity numeric,
  p_reason text DEFAULT NULL,p_reference_id text DEFAULT NULL,p_created_by uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_old_qty numeric; v_new_qty numeric; v_delta numeric;
  v_id uuid; v_at timestamptz; v_actor uuid := coalesce(p_created_by,auth.uid());
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  IF p_type NOT IN ('receive','ship','adjust','return') OR p_type IS NULL THEN
    RAISE EXCEPTION 'Invalid movement type; transfer requires a destination' USING ERRCODE='22023';
  END IF;
  IF p_quantity IS NULL OR p_quantity = 0
    OR p_quantity IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
    OR (p_type <> 'adjust' AND p_quantity < 0) THEN
    RAISE EXCEPTION 'Invalid movement quantity' USING ERRCODE='22023';
  END IF;
  IF p_reference_id IS NULL OR char_length(btrim(p_reference_id)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Reference ID is required' USING ERRCODE='22023';
  END IF;
  SELECT quantity INTO v_old_qty FROM inventory.items
    WHERE project_id=p_project_id AND id=p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found' USING ERRCODE='P0002'; END IF;
  v_delta := CASE WHEN p_type IN ('receive','return','adjust') THEN p_quantity ELSE -p_quantity END;
  v_new_qty := v_old_qty + v_delta;
  IF v_new_qty < 0 THEN RAISE EXCEPTION 'Insufficient stock' USING ERRCODE='P0004'; END IF;
  INSERT INTO inventory.stock_movements(project_id,item_id,type,quantity,reason,reference_id,created_by)
    VALUES(p_project_id,p_item_id,p_type,p_quantity,p_reason,p_reference_id,v_actor)
    RETURNING id,created_at INTO v_id,v_at;
  UPDATE inventory.items SET quantity=v_new_qty WHERE id=p_item_id AND project_id=p_project_id;
  RETURN jsonb_build_object('id',v_id,'project_id',p_project_id,'item_id',p_item_id,
    'type',p_type,'quantity',p_quantity,'reason',p_reason,'reference_id',p_reference_id,
    'created_by',v_actor,'created_at',v_at,'resulting_quantity',v_new_qty);
END;
$$;
REVOKE ALL ON FUNCTION inventory.record_stock_movement_internal(uuid,uuid,text,numeric,text,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION inventory.record_stock_movement(
  p_project_id uuid,p_item_id uuid,p_type text,p_quantity numeric,
  p_reason text DEFAULT NULL,p_reference_id text DEFAULT NULL,p_created_by uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  IF p_created_by IS NOT NULL AND p_created_by <> actor THEN
    RAISE EXCEPTION 'Actor mismatch' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM control.org_members m JOIN control.projects p ON p.org_id=m.org_id
    WHERE p.id=p_project_id AND m.user_id=actor FOR SHARE OF m;
  PERFORM 1 FROM control.project_members WHERE project_id=p_project_id AND user_id=actor FOR SHARE;
  IF private.project_role(p_project_id) IS NULL THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE='P0002';
  END IF;
  IF private.project_role(p_project_id) NOT IN ('owner','admin','editor') THEN
    RAISE EXCEPTION 'Stock write forbidden' USING ERRCODE='42501';
  END IF;
  IF p_type IS NULL OR p_type='transfer' OR p_project_id IS NULL OR p_item_id IS NULL
    OR char_length(p_reason)>1000 OR char_length(p_reference_id)>200 THEN
    RAISE EXCEPTION 'Invalid movement parameters' USING ERRCODE='22023';
  END IF;
  RETURN inventory.record_stock_movement_internal(
    p_project_id,p_item_id,p_type,p_quantity,p_reason,p_reference_id,actor);
END;
$$;
REVOKE ALL ON FUNCTION inventory.record_stock_movement(uuid,uuid,text,numeric,text,text,uuid)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION inventory.record_stock_movement(uuid,uuid,text,numeric,text,text,uuid)
  TO authenticated;

-- Atomic transfer between two distinct items sharing one template version.
-- Both item rows are locked by UUID order to prevent concurrent deadlocks.
CREATE FUNCTION inventory.record_stock_transfer(
  p_project_id uuid,p_source_item_id uuid,p_destination_item_id uuid,
  p_quantity numeric,p_reason text,p_reference_id text,p_created_by uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); r record; v_source_qty numeric; v_dest_qty numeric;
  v_source_template uuid; v_dest_template uuid; v_source_new numeric;
  v_dest_new numeric; v_id uuid; v_at timestamptz; v_count int := 0;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  IF p_created_by IS NOT NULL AND p_created_by <> actor THEN
    RAISE EXCEPTION 'Actor mismatch' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM control.org_members m JOIN control.projects p ON p.org_id=m.org_id
    WHERE p.id=p_project_id AND m.user_id=actor FOR SHARE OF m;
  PERFORM 1 FROM control.project_members WHERE project_id=p_project_id AND user_id=actor FOR SHARE;
  IF private.project_role(p_project_id) IS NULL THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE='P0002';
  END IF;
  IF private.project_role(p_project_id) NOT IN ('owner','admin','editor') THEN
    RAISE EXCEPTION 'Stock write forbidden' USING ERRCODE='42501';
  END IF;
  IF p_project_id IS NULL OR p_source_item_id IS NULL OR p_destination_item_id IS NULL
    OR p_source_item_id = p_destination_item_id OR p_quantity IS NULL OR p_quantity <= 0
    OR p_quantity IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
    OR p_reference_id IS NULL OR char_length(btrim(p_reference_id)) NOT BETWEEN 1 AND 200
    OR char_length(p_reason)>1000 THEN
    RAISE EXCEPTION 'Invalid transfer parameters' USING ERRCODE='22023';
  END IF;
  FOR r IN SELECT id,quantity,template_version_id FROM inventory.items
      WHERE project_id=p_project_id AND id IN (p_source_item_id,p_destination_item_id)
      ORDER BY id FOR UPDATE LOOP
    v_count := v_count+1;
    IF r.id=p_source_item_id THEN
      v_source_qty := r.quantity; v_source_template := r.template_version_id;
    ELSE
      v_dest_qty := r.quantity; v_dest_template := r.template_version_id;
    END IF;
  END LOOP;
  IF v_count <> 2 THEN RAISE EXCEPTION 'Source or destination item not found' USING ERRCODE='P0002'; END IF;
  IF v_source_template <> v_dest_template THEN
    RAISE EXCEPTION 'Transfer items must share a template version' USING ERRCODE='22023';
  END IF;
  v_source_new := v_source_qty-p_quantity;
  v_dest_new := v_dest_qty+p_quantity;
  IF v_source_new < 0 THEN RAISE EXCEPTION 'Insufficient stock' USING ERRCODE='P0004'; END IF;
  INSERT INTO inventory.stock_movements(
    project_id,item_id,destination_item_id,type,quantity,reason,reference_id,created_by)
    VALUES(p_project_id,p_source_item_id,p_destination_item_id,'transfer',p_quantity,p_reason,p_reference_id,actor)
    RETURNING id,created_at INTO v_id,v_at;
  UPDATE inventory.items SET quantity=v_source_new WHERE id=p_source_item_id AND project_id=p_project_id;
  UPDATE inventory.items SET quantity=v_dest_new WHERE id=p_destination_item_id AND project_id=p_project_id;
  RETURN jsonb_build_object('id',v_id,'project_id',p_project_id,'item_id',p_source_item_id,
    'destination_item_id',p_destination_item_id,'type','transfer','quantity',p_quantity,
    'reason',p_reason,'reference_id',p_reference_id,'created_by',actor,'created_at',v_at,
    'resulting_quantity',v_source_new,'destination_resulting_quantity',v_dest_new);
END;
$$;
REVOKE ALL ON FUNCTION inventory.record_stock_transfer(uuid,uuid,uuid,numeric,text,text,uuid)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION inventory.record_stock_transfer(uuid,uuid,uuid,numeric,text,text,uuid)
  TO authenticated;

-- Storage enforces limits even if browser validation is bypassed.
UPDATE storage.buckets SET file_size_limit=10485760,
  allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp','application/pdf','text/plain']
  WHERE id='inventory-attachments';

-- Defend against accidental broad function permissions in hosted databases.
ALTER FUNCTION control.set_updated_at() SET search_path = '';
DO $
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC,anon,authenticated;
  END IF;
END;
$;

COMMIT;
