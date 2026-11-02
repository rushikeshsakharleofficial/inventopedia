-- M6: caller-scoped, transactional template version lifecycle.
BEGIN;

CREATE FUNCTION private.template_trim(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT btrim(value, E' \t\n\r\f\013' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
$$;

CREATE FUNCTION private.valid_template_schema(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE field jsonb; option jsonb; field_key text; option_text text;
  keys text[] := '{}'; choices text[];
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF value - 'fields' <> '{}'::jsonb OR jsonb_typeof(value->'fields') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  FOR field IN SELECT jsonb_array_elements(value->'fields') LOOP
    IF jsonb_typeof(field) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF field - ARRAY['key','label','type','required','options'] <> '{}'::jsonb
      OR jsonb_typeof(field->'key') IS DISTINCT FROM 'string'
      OR jsonb_typeof(field->'label') IS DISTINCT FROM 'string'
      OR jsonb_typeof(field->'type') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    field_key := field->>'key';
    IF field_key !~ '^[a-z][a-z0-9_]{0,63}$' OR field_key IN ('__proto__','prototype','constructor')
      OR field_key = ANY(keys) THEN RETURN false; END IF;
    keys := array_append(keys,field_key);
    IF char_length(private.template_trim(field->>'label')) NOT BETWEEN 1 AND 200 THEN RETURN false; END IF;
    IF field ? 'required' AND jsonb_typeof(field->'required') IS DISTINCT FROM 'boolean' THEN RETURN false; END IF;
    IF field->>'type' NOT IN ('text','number','boolean','date','select') THEN RETURN false; END IF;
    IF field->>'type' = 'select' THEN
      IF jsonb_typeof(field->'options') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
      IF jsonb_array_length(field->'options') = 0 THEN RETURN false; END IF;
      choices := '{}';
      FOR option IN SELECT jsonb_array_elements(field->'options') LOOP
        IF jsonb_typeof(option) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
        option_text := private.template_trim(option #>> '{}');
        IF char_length(option_text) NOT BETWEEN 1 AND 200 OR option_text = ANY(choices) THEN RETURN false; END IF;
        choices := array_append(choices,option_text);
      END LOOP;
    ELSIF field ? 'options' THEN RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE FUNCTION private.template_publication_schema_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.published_at IS NOT NULL AND NOT private.valid_template_schema(NEW.schema) THEN
    RAISE EXCEPTION 'Invalid template schema' USING ERRCODE = 'T0004';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER c_template_schema BEFORE INSERT OR UPDATE ON inventory.template_versions
FOR EACH ROW EXECUTE FUNCTION private.template_publication_schema_guard();

CREATE FUNCTION inventory.create_template_version(p_project_id uuid,p_template_id uuid,p_schema jsonb)
RETURNS inventory.template_versions LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE next_version bigint; result inventory.template_versions;
BEGIN
  IF coalesce(private.project_role(p_project_id),'') NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'Insufficient project role' USING ERRCODE = '42501';
  END IF;
  PERFORM id FROM inventory.templates WHERE project_id=p_project_id AND id=p_template_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found' USING ERRCODE = 'T0001'; END IF;
  IF NOT private.valid_template_schema(p_schema) THEN
    RAISE EXCEPTION 'Invalid template schema' USING ERRCODE = 'T0004';
  END IF;
  SELECT coalesce(max(version)::bigint,0)+1 INTO next_version FROM inventory.template_versions
    WHERE project_id=p_project_id AND template_id=p_template_id;
  IF next_version > 2147483647 THEN RAISE EXCEPTION 'Version limit reached' USING ERRCODE = 'T0005'; END IF;
  INSERT INTO inventory.template_versions(project_id,template_id,version,schema)
    VALUES(p_project_id,p_template_id,next_version::integer,p_schema) RETURNING * INTO result;
  RETURN result;
END;
$$;

CREATE FUNCTION inventory.publish_template_version(p_project_id uuid,p_template_id uuid,p_version_id uuid)
RETURNS inventory.template_versions LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result inventory.template_versions;
BEGIN
  IF coalesce(private.project_role(p_project_id),'') NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'Insufficient project role' USING ERRCODE = '42501';
  END IF;
  PERFORM id FROM inventory.templates WHERE project_id=p_project_id AND id=p_template_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found' USING ERRCODE = 'T0001'; END IF;
  SELECT * INTO result FROM inventory.template_versions
    WHERE project_id=p_project_id AND template_id=p_template_id AND id=p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Version not found' USING ERRCODE = 'T0002'; END IF;
  IF result.published_at IS NOT NULL THEN RAISE EXCEPTION 'Version already published' USING ERRCODE = 'T0003'; END IF;
  UPDATE inventory.template_versions SET published_at=clock_timestamp()
    WHERE project_id=p_project_id AND template_id=p_template_id AND id=p_version_id RETURNING * INTO result;
  UPDATE inventory.templates SET current_version_id=p_version_id WHERE project_id=p_project_id AND id=p_template_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found' USING ERRCODE = 'T0001'; END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION private.template_trim(text), private.valid_template_schema(jsonb),
  private.template_publication_schema_guard(), inventory.create_template_version(uuid,uuid,jsonb),
  inventory.publish_template_version(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
-- Invoker functions/trigger call these pure helpers; private stays unexposed.
GRANT EXECUTE ON FUNCTION private.template_trim(text), private.valid_template_schema(jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION inventory.create_template_version(uuid,uuid,jsonb),
  inventory.publish_template_version(uuid,uuid,uuid) TO authenticated;

COMMIT;
