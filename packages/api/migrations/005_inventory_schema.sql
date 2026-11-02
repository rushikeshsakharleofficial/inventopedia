-- M4: inventory foundation. Apply after 001–004 as database owner.
-- No stock mutation API is exposed by this migration.
BEGIN;
CREATE SCHEMA inventory;
REVOKE ALL ON SCHEMA inventory FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA inventory TO authenticated, service_role;

CREATE TABLE inventory.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES control.projects(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  parent_id UUID,
  path TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, id),
  FOREIGN KEY (project_id, parent_id) REFERENCES inventory.categories(project_id, id) ON DELETE RESTRICT
);

CREATE TABLE inventory.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES control.projects(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  description TEXT CHECK (char_length(description) <= 2000),
  current_version_id UUID,
  current_version_published BOOLEAN GENERATED ALWAYS AS (true) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, id)
);

CREATE TABLE inventory.template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES control.projects(id) ON DELETE RESTRICT,
  template_id UUID NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  schema JSONB NOT NULL CHECK (jsonb_typeof(schema) = 'object'),
  published_at TIMESTAMPTZ,
  published BOOLEAN GENERATED ALWAYS AS (published_at IS NOT NULL) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, id),
  UNIQUE (project_id, template_id, version),
  UNIQUE (project_id, id, published),
  UNIQUE (project_id, template_id, id, published),
  FOREIGN KEY (project_id, template_id) REFERENCES inventory.templates(project_id, id) ON DELETE RESTRICT
);

ALTER TABLE inventory.templates ADD CONSTRAINT templates_current_published_version
  FOREIGN KEY (project_id, id, current_version_id, current_version_published)
  REFERENCES inventory.template_versions(project_id, template_id, id, published) ON DELETE RESTRICT;

CREATE TABLE inventory.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES control.projects(id) ON DELETE RESTRICT,
  template_version_id UUID NOT NULL,
  version_published BOOLEAN GENERATED ALWAYS AS (true) STORED,
  category_id UUID,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  sku TEXT,
  attributes JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(attributes) = 'object'),
  quantity NUMERIC NOT NULL DEFAULT 0 CHECK (quantity NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, id),
  FOREIGN KEY (project_id, template_version_id, version_published)
    REFERENCES inventory.template_versions(project_id, id, published) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, category_id) REFERENCES inventory.categories(project_id, id) ON DELETE RESTRICT
);

CREATE TABLE inventory.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES control.projects(id) ON DELETE RESTRICT,
  item_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('receive', 'ship', 'adjust', 'transfer', 'return')),
  quantity NUMERIC NOT NULL CHECK (quantity NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  reason TEXT,
  reference_id TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, reference_id),
  FOREIGN KEY (project_id, item_id) REFERENCES inventory.items(project_id, id) ON DELETE RESTRICT
);

CREATE INDEX categories_parent_idx ON inventory.categories(project_id, parent_id);
CREATE INDEX categories_path_idx ON inventory.categories(project_id, path text_pattern_ops);
CREATE INDEX templates_current_version_idx ON inventory.templates(project_id, current_version_id);
CREATE INDEX items_version_idx ON inventory.items(project_id, template_version_id);
CREATE INDEX items_category_idx ON inventory.items(project_id, category_id);
CREATE INDEX items_attributes_idx ON inventory.items USING gin(attributes);
CREATE INDEX movements_item_idx ON inventory.stock_movements(project_id, item_id, created_at);
CREATE INDEX movements_actor_idx ON inventory.stock_movements(created_by);

-- Identity protections also apply to trusted service-role UPDATEs.
CREATE FUNCTION private.inventory_identity_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    RAISE EXCEPTION 'Inventory identity is immutable' USING ERRCODE = '55000';
  END IF;
  IF TG_TABLE_NAME = 'template_versions' THEN
    IF NEW.template_id IS DISTINCT FROM OLD.template_id OR NEW.version IS DISTINCT FROM OLD.version THEN
      RAISE EXCEPTION 'Version identity is immutable' USING ERRCODE = '55000';
    END IF;
  ELSIF TG_TABLE_NAME = 'items' THEN
    IF NEW.template_version_id IS DISTINCT FROM OLD.template_version_id THEN
      RAISE EXCEPTION 'Item version is immutable' USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION private.inventory_category_path()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_parent_path TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM 1 FROM control.projects WHERE id = OLD.project_id FOR UPDATE;
    RETURN OLD;
  END IF;
  -- Every hierarchy mutation takes the same project lock. Volatile trigger
  -- statements see committed preceding moves under READ COMMITTED isolation.
  PERFORM 1 FROM control.projects WHERE id = NEW.project_id FOR UPDATE;
  IF NEW.parent_id IS NULL THEN
    NEW.path := '/' || NEW.id::text || '/';
  ELSE
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'Category cycle' USING ERRCODE = '23514';
    END IF;
    SELECT path INTO v_parent_path FROM inventory.categories
      WHERE project_id = NEW.project_id AND id = NEW.parent_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent category not in project' USING ERRCODE = '23503';
    END IF;
    IF position('/' || NEW.id::text || '/' IN v_parent_path) > 0 THEN
      RAISE EXCEPTION 'Category cycle' USING ERRCODE = '23514';
    END IF;
    NEW.path := v_parent_path || NEW.id::text || '/';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION private.inventory_category_descendants()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Re-derive each child from its now-updated parent; its own AFTER trigger
  -- propagates to grandchildren. Tenant clients cannot set the path column.
  UPDATE inventory.categories SET parent_id = parent_id
    WHERE project_id = NEW.project_id AND parent_id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE FUNCTION private.inventory_published_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'Published version is immutable' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION private.inventory_movement_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Stock movement is immutable' USING ERRCODE = '55000';
END;
$$;

CREATE FUNCTION private.inventory_initial_quantity()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.quantity <> 0 THEN
    RAISE EXCEPTION 'Initial item quantity must be zero' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER a_identity BEFORE UPDATE ON inventory.categories FOR EACH ROW EXECUTE FUNCTION private.inventory_identity_guard();
CREATE TRIGGER b_path BEFORE INSERT OR UPDATE OR DELETE ON inventory.categories FOR EACH ROW EXECUTE FUNCTION private.inventory_category_path();
CREATE TRIGGER category_descendants AFTER UPDATE ON inventory.categories FOR EACH ROW
  WHEN (OLD.path IS DISTINCT FROM NEW.path) EXECUTE FUNCTION private.inventory_category_descendants();
CREATE TRIGGER z_updated_at BEFORE UPDATE ON inventory.categories FOR EACH ROW EXECUTE FUNCTION control.set_updated_at();
CREATE TRIGGER a_identity BEFORE UPDATE ON inventory.templates FOR EACH ROW EXECUTE FUNCTION private.inventory_identity_guard();
CREATE TRIGGER z_updated_at BEFORE UPDATE ON inventory.templates FOR EACH ROW EXECUTE FUNCTION control.set_updated_at();
CREATE TRIGGER a_identity BEFORE UPDATE ON inventory.template_versions FOR EACH ROW EXECUTE FUNCTION private.inventory_identity_guard();
CREATE TRIGGER b_published BEFORE UPDATE OR DELETE ON inventory.template_versions FOR EACH ROW EXECUTE FUNCTION private.inventory_published_guard();
CREATE TRIGGER a_identity BEFORE UPDATE ON inventory.items FOR EACH ROW EXECUTE FUNCTION private.inventory_identity_guard();
CREATE TRIGGER initial_quantity BEFORE INSERT ON inventory.items FOR EACH ROW EXECUTE FUNCTION private.inventory_initial_quantity();
CREATE TRIGGER z_updated_at BEFORE UPDATE ON inventory.items FOR EACH ROW EXECUTE FUNCTION control.set_updated_at();
CREATE TRIGGER movement_immutable BEFORE UPDATE OR DELETE ON inventory.stock_movements FOR EACH ROW EXECUTE FUNCTION private.inventory_movement_guard();

REVOKE ALL ON FUNCTION private.inventory_identity_guard(), private.inventory_category_path(),
  private.inventory_category_descendants(), private.inventory_published_guard(),
  private.inventory_movement_guard(), private.inventory_initial_quantity()
  FROM PUBLIC, anon, authenticated, service_role;

-- Explicit privileges resist broad Supabase default grants. No TRUNCATE, schema
-- CREATE, stock INSERT, quantity UPDATE or identity UPDATE for tenant clients.
REVOKE ALL ON ALL TABLES IN SCHEMA inventory FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA inventory TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA inventory TO service_role;
GRANT INSERT (project_id, name, parent_id, sort_order) ON inventory.categories TO authenticated;
GRANT UPDATE (name, parent_id, sort_order) ON inventory.categories TO authenticated;
GRANT INSERT (project_id, name, description) ON inventory.templates TO authenticated;
GRANT UPDATE (name, description, current_version_id) ON inventory.templates TO authenticated;
GRANT INSERT (project_id, template_id, version, schema, published_at) ON inventory.template_versions TO authenticated;
GRANT UPDATE (schema, published_at) ON inventory.template_versions TO authenticated;
GRANT INSERT (project_id, template_version_id, category_id, name, sku, attributes) ON inventory.items TO authenticated;
GRANT UPDATE (category_id, name, sku, attributes) ON inventory.items TO authenticated;
GRANT DELETE ON inventory.categories, inventory.templates, inventory.template_versions, inventory.items TO authenticated;

ALTER TABLE inventory.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY categories_read ON inventory.categories FOR SELECT TO authenticated USING (private.project_role(project_id) IS NOT NULL);
CREATE POLICY categories_insert ON inventory.categories FOR INSERT TO authenticated WITH CHECK (private.project_role(project_id) IN ('owner', 'admin'));
CREATE POLICY categories_update ON inventory.categories FOR UPDATE TO authenticated USING (private.project_role(project_id) IN ('owner', 'admin')) WITH CHECK (private.project_role(project_id) IN ('owner', 'admin'));
CREATE POLICY categories_delete ON inventory.categories FOR DELETE TO authenticated USING (private.project_role(project_id) IN ('owner', 'admin'));
CREATE POLICY templates_read ON inventory.templates FOR SELECT TO authenticated USING (private.project_role(project_id) IS NOT NULL);
CREATE POLICY templates_insert ON inventory.templates FOR INSERT TO authenticated WITH CHECK (private.project_role(project_id) IN ('owner', 'admin'));
CREATE POLICY templates_update ON inventory.templates FOR UPDATE TO authenticated USING (private.project_role(project_id) IN ('owner', 'admin')) WITH CHECK (private.project_role(project_id) IN ('owner', 'admin'));
CREATE POLICY templates_delete ON inventory.templates FOR DELETE TO authenticated USING (private.project_role(project_id) IN ('owner', 'admin'));
CREATE POLICY versions_read ON inventory.template_versions FOR SELECT TO authenticated USING (private.project_role(project_id) IS NOT NULL);
CREATE POLICY versions_insert ON inventory.template_versions FOR INSERT TO authenticated WITH CHECK (private.project_role(project_id) IN ('owner', 'admin'));
CREATE POLICY versions_update ON inventory.template_versions FOR UPDATE TO authenticated USING (private.project_role(project_id) IN ('owner', 'admin')) WITH CHECK (private.project_role(project_id) IN ('owner', 'admin'));
CREATE POLICY versions_delete ON inventory.template_versions FOR DELETE TO authenticated USING (private.project_role(project_id) IN ('owner', 'admin'));
CREATE POLICY items_read ON inventory.items FOR SELECT TO authenticated USING (private.project_role(project_id) IS NOT NULL);
CREATE POLICY items_insert ON inventory.items FOR INSERT TO authenticated WITH CHECK (private.project_role(project_id) IN ('owner', 'admin', 'editor'));
CREATE POLICY items_update ON inventory.items FOR UPDATE TO authenticated USING (private.project_role(project_id) IN ('owner', 'admin', 'editor')) WITH CHECK (private.project_role(project_id) IN ('owner', 'admin', 'editor'));
CREATE POLICY items_delete ON inventory.items FOR DELETE TO authenticated USING (private.project_role(project_id) IN ('owner', 'admin', 'editor'));
CREATE POLICY movements_read ON inventory.stock_movements FOR SELECT TO authenticated USING (private.project_role(project_id) IS NOT NULL);

COMMIT;
