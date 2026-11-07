-- Private Storage integration. Supabase storage schema must already exist.
BEGIN;
CREATE TABLE inventory.attachments (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES control.projects(id) ON DELETE RESTRICT,
  item_id UUID NOT NULL,
  filename TEXT NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 255 AND filename !~ '[/\\]'),
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id,item_id) REFERENCES inventory.items(project_id,id) ON DELETE RESTRICT
);
CREATE INDEX attachments_item_idx ON inventory.attachments(project_id,item_id,id);
ALTER TABLE inventory.attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inventory.attachments FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON inventory.attachments TO authenticated;
GRANT INSERT(id,project_id,item_id,filename) ON inventory.attachments TO authenticated;
GRANT UPDATE(deleted) ON inventory.attachments TO authenticated;
CREATE POLICY attachments_read ON inventory.attachments FOR SELECT TO authenticated
  USING (private.project_role(project_id) IS NOT NULL AND
    (NOT deleted OR private.project_role(project_id) IN ('owner','admin','editor')));
CREATE POLICY attachments_insert ON inventory.attachments FOR INSERT TO authenticated
  WITH CHECK (private.project_role(project_id) IN ('owner','admin','editor') AND created_by = auth.uid() AND NOT deleted);
CREATE POLICY attachments_delete ON inventory.attachments FOR UPDATE TO authenticated
  USING (private.project_role(project_id) IN ('owner','admin','editor'))
  WITH CHECK (private.project_role(project_id) IN ('owner','admin','editor') AND deleted);
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON inventory.attachments
  FOR EACH ROW EXECUTE FUNCTION private.audit_inventory_change();

INSERT INTO storage.buckets(id,name,public) VALUES ('inventory-attachments','inventory-attachments',false);
-- Match complete generated paths; never cast untrusted object names to UUID.
CREATE FUNCTION private.attachment_object_access(object_name TEXT, operation TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM inventory.attachments a
    WHERE object_name = a.project_id::text || '/' || a.item_id::text || '/' || a.id::text
    AND CASE operation
      WHEN 'read' THEN NOT a.deleted AND private.project_role(a.project_id) IS NOT NULL
      WHEN 'upload' THEN NOT a.deleted AND private.project_role(a.project_id) IN ('owner','admin','editor')
      WHEN 'delete' THEN a.deleted AND private.project_role(a.project_id) IN ('owner','admin','editor')
      ELSE false END);
$$;
REVOKE ALL ON FUNCTION private.attachment_object_access(TEXT,TEXT) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION private.attachment_object_access(TEXT,TEXT) TO authenticated;
CREATE POLICY inventory_attachment_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'inventory-attachments' AND
    (private.attachment_object_access(name,'read') OR
      (storage.allow_any_operation(ARRAY['object.delete','object.delete_many'])
        AND private.attachment_object_access(name,'delete'))));
CREATE POLICY inventory_attachment_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inventory-attachments' AND storage.allow_only_operation('object.upload')
    AND private.attachment_object_access(name,'upload'));
CREATE POLICY inventory_attachment_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'inventory-attachments' AND private.attachment_object_access(name,'delete'));
COMMIT;
