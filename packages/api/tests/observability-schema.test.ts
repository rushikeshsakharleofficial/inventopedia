import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: PGlite;
const owner = '10000000-0000-4000-8000-000000000001';
const viewer = '10000000-0000-4000-8000-000000000002';
const outsider = '10000000-0000-4000-8000-000000000003';
const org = '20000000-0000-4000-8000-000000000001';
const project = '30000000-0000-4000-8000-000000000001';
const item = '70000000-0000-4000-8000-000000000001';
const attachment = '80000000-0000-4000-8000-000000000001';
const path = `${project}/${item}/${attachment}`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon,service_role;
    CREATE SCHEMA storage;
    CREATE FUNCTION storage.allow_only_operation(operation TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE AS
      $$ SELECT current_setting('test.storage.operation',true)=operation $$;
    CREATE FUNCTION storage.allow_any_operation(operations TEXT[]) RETURNS BOOLEAN LANGUAGE sql STABLE AS
      $$ SELECT current_setting('test.storage.operation',true)=ANY(operations) $$;
    CREATE TABLE storage.buckets(id TEXT PRIMARY KEY,name TEXT,public BOOLEAN, file_size_limit BIGINT, allowed_mime_types TEXT[]);
    CREATE TABLE storage.objects(id UUID DEFAULT gen_random_uuid(),bucket_id TEXT,name TEXT);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO authenticated;
    GRANT SELECT,INSERT,DELETE ON storage.objects TO authenticated;`);
  for (const migration of ['001_control_schema','002_projects','003_tenant_security','004_project_management',
    '005_inventory_schema','006_template_builder','007_stock_transactions','008_project_observability','009_attachments','010_stock_authorization','011_inventory_audit_hardening']) {
    await db.exec(readFileSync(new URL(`../migrations/${migration}.sql`, import.meta.url), 'utf8'));
  }
  await db.exec(`INSERT INTO auth.users VALUES('${owner}'),('${viewer}'),('${outsider}');
    INSERT INTO control.organisations(id,name,slug) VALUES('${org}','Org','test-org');
    INSERT INTO control.org_members(org_id,user_id,role) VALUES('${org}','${owner}','owner'),('${org}','${viewer}','member');
    INSERT INTO control.projects(id,org_id,name,created_by) VALUES('${project}','${org}','Project','${owner}');
    INSERT INTO control.project_members(project_id,user_id,role) VALUES('${project}','${viewer}','viewer');
    INSERT INTO inventory.templates(id,project_id,name) VALUES('50000000-0000-4000-8000-000000000001','${project}','Template');
    INSERT INTO inventory.template_versions(id,project_id,template_id,version,schema)
      VALUES('60000000-0000-4000-8000-000000000001','${project}','50000000-0000-4000-8000-000000000001',1,'{"fields":[{"key":"serial","label":"Serial","type":"text","required":false}]}');`);
  // Publish through the same validated lifecycle used by the API.
  await db.exec(`UPDATE inventory.template_versions SET published_at = now() WHERE project_id='${project}';
    INSERT INTO inventory.items(id,project_id,template_version_id,name)
      VALUES('${item}','${project}','60000000-0000-4000-8000-000000000001','Item');`);
}, 30000);
afterAll(async () => { if (db && !db.closed) await db.close(); });

async function asUser(user: string, sql: string, operation = 'object.get_authenticated') {
  await db.exec('BEGIN');
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user]);
    await db.query("SELECT set_config('test.storage.operation',$1,true)", [operation]);
    await db.exec('SET LOCAL ROLE authenticated');
    const result = await db.query(sql);
    await db.exec('COMMIT');
    return result.rows;
  } catch (error) { await db.exec('ROLLBACK'); throw error; }
}

describe('M9 database boundaries', () => {
  it('authorizes stock RPC directly, binds actor and rolls back insufficient stock', async () => {
    const rpc = (type: string, quantity: number, actor = 'NULL') =>
      `SELECT inventory.record_stock_movement('${project}','${item}','${type}',${quantity},NULL,'audit-${type}-${quantity}',${actor})`;
    await expect(asUser(viewer, rpc('receive', 5))).rejects.toThrow(/forbidden/);
    await expect(asUser(outsider, rpc('receive', 5))).rejects.toThrow(/Project not found/);
    await expect(asUser(owner, rpc('receive', 5, `'${viewer}'`))).rejects.toThrow(/Actor mismatch/);
    await expect(asUser(owner, `SELECT inventory.record_stock_movement_internal('${project}','${item}','receive',5)`))
      .rejects.toThrow(/permission denied/);
    const before = await asUser(owner, `SELECT quantity FROM inventory.items WHERE id='${item}'`);
    await expect(asUser(owner, rpc('ship', 999))).rejects.toThrow(/Insufficient stock/);
    expect(await asUser(owner, `SELECT quantity FROM inventory.items WHERE id='${item}'`)).toEqual(before);
    await asUser(owner, rpc('receive', 5));
    await asUser(owner, rpc('ship', 5));
    expect(await asUser(owner, `SELECT quantity FROM inventory.items WHERE id='${item}'`)).toEqual(before);
  });
  it('returns caller-scoped aggregates, including zero-stock items', async () => {
    expect(await asUser(viewer, `SELECT public.project_dashboard('${project}') AS data`)).toEqual([
      { data: { items: 1, categories: 0, templates: 1, movements: 2, outOfStockItems: 1 } },
    ]);
    expect(await asUser(outsider, `SELECT public.project_dashboard('${project}') AS data`)).toEqual([{ data: null }]);
  });
  it('records mutations atomically and permits only administrators to read audit', async () => {
    await asUser(owner, `UPDATE inventory.items SET name='Renamed' WHERE id='${item}'`);
    expect((await asUser(owner, `SELECT * FROM inventory.audit_events WHERE entity_id='${item}' AND action='update'`))[0])
      .toMatchObject({ actor_id: owner, project_id: project, entity_type: 'items' });
    expect(await asUser(viewer, 'SELECT * FROM inventory.audit_events')).toEqual([]);
    expect(await asUser(outsider, 'SELECT * FROM inventory.audit_events')).toEqual([]);
    await expect(asUser(owner, `DELETE FROM inventory.audit_events`)).rejects.toThrow(/permission denied/);
    await expect(asUser(owner, `INSERT INTO inventory.audit_events(project_id,action,entity_type,entity_id) VALUES('${project}','insert','items','${item}')`))
      .rejects.toThrow(/permission denied/);
  });
  it('denies viewer reservations and binds upload paths to retained metadata', async () => {
    const insert = `INSERT INTO inventory.attachments(id,project_id,item_id,filename) VALUES('${attachment}','${project}','${item}','photo.png')`;
    await expect(asUser(viewer, insert)).rejects.toThrow(/row-level security/);
    await asUser(owner, insert);
    await expect(asUser(viewer, `INSERT INTO storage.objects(bucket_id,name) VALUES('inventory-attachments','${path}')`))
      .rejects.toThrow(/row-level security/);
    await expect(asUser(owner, `INSERT INTO storage.objects(bucket_id,name) VALUES('inventory-attachments','unreserved')`))
      .rejects.toThrow(/row-level security/);
    await expect(asUser(owner, `INSERT INTO storage.objects(bucket_id,name) VALUES('inventory-attachments','${path}')`, 'object.sign_upload_url'))
      .rejects.toThrow(/row-level security/);
    await asUser(owner, `INSERT INTO storage.objects(bucket_id,name) VALUES('inventory-attachments','${path}')`, 'object.upload');
    expect(await asUser(viewer, 'SELECT name FROM storage.objects')).toEqual([{ name: path }]);
    expect(await asUser(outsider, 'SELECT name FROM storage.objects')).toEqual([]);
  });
  it('tombstones deny further uploads and reads while permitting cleanup retries', async () => {
    await asUser(owner, `UPDATE inventory.attachments SET deleted=true WHERE id='${attachment}'`);
    expect(await asUser(viewer, 'SELECT name FROM storage.objects')).toEqual([]);
    expect(await asUser(owner, 'SELECT name FROM storage.objects', 'object.sign')).toEqual([]);
    expect(await asUser(owner, 'SELECT name FROM storage.objects', 'object.get_authenticated')).toEqual([]);
    await expect(asUser(owner, `UPDATE inventory.attachments SET deleted=false WHERE id='${attachment}'`))
      .rejects.toThrow(/row-level security/);
    await expect(asUser(owner, `INSERT INTO storage.objects(bucket_id,name) VALUES('inventory-attachments','${path}')`))
      .rejects.toThrow(/row-level security/);
    await asUser(owner, `DELETE FROM storage.objects WHERE name='${path}'`, 'object.delete_many');
    await asUser(owner, `DELETE FROM storage.objects WHERE name='${path}'`, 'object.delete_many');
    expect(await asUser(owner, 'SELECT name FROM storage.objects')).toEqual([]);
  });
  it('enforces published field types for direct authenticated item writes', async () => {
    await expect(asUser(owner, `UPDATE inventory.items SET attributes='{"serial":42}' WHERE id='${item}'`))
      .rejects.toMatchObject({ code: '23514' });
    await expect(asUser(owner, `UPDATE inventory.items SET attributes='{"unknown":"x"}' WHERE id='${item}'`))
      .rejects.toMatchObject({ code: '23514' });
    await asUser(owner, `UPDATE inventory.items SET attributes='{"serial":"ABC"}' WHERE id='${item}'`);
    expect(await asUser(owner, `SELECT attributes FROM inventory.items WHERE id='${item}'`))
      .toEqual([{ attributes: { serial: 'ABC' } }]);
  });
  it('requires protected publication RPC, not direct published_at updates', async () => {
    await expect(asUser(owner, `UPDATE inventory.template_versions SET published_at=now() WHERE project_id='${project}'`))
      .rejects.toMatchObject({ code: '42501' });
    expect(await asUser(owner, `SELECT has_function_privilege('anon', 'inventory.record_stock_transfer(uuid,uuid,uuid,numeric,text,text,uuid)', 'EXECUTE') AS allowed`))
      .toEqual([{ allowed: false }]);
  });
  it('atomically transfers stock to a second item without changing total quantity', async () => {
    const destination = '70000000-0000-4000-8000-000000000002';
    await asUser(owner, `INSERT INTO inventory.items(id,project_id,template_version_id,name)
      VALUES('${destination}','${project}','60000000-0000-4000-8000-000000000001','Destination')`);
    await asUser(owner, `SELECT inventory.record_stock_movement('${project}','${item}','receive',10,NULL,'audit-transfer-seed')`);
    await expect(asUser(owner, `SELECT inventory.record_stock_movement('${project}','${item}','transfer',1,NULL,'bad-transfer')`))
      .rejects.toMatchObject({ code: '22023' });
    await expect(asUser(viewer, `SELECT inventory.record_stock_transfer('${project}','${item}','${destination}',2,NULL,'viewer-transfer')`))
      .rejects.toMatchObject({ code: '42501' });
    await asUser(owner, `SELECT inventory.record_stock_transfer('${project}','${item}','${destination}',3,NULL,'transfer-001')`);
    expect(await asUser(owner, `SELECT id,quantity FROM inventory.items WHERE id IN ('${item}','${destination}') ORDER BY id`))
      .toEqual([{ id: item, quantity: 7 }, { id: destination, quantity: 3 }]);
    await expect(asUser(owner, `SELECT inventory.record_stock_transfer('${project}','${item}','${destination}',3,NULL,'transfer-001')`))
      .rejects.toMatchObject({ code: '23505' });
    expect(await asUser(owner, `SELECT quantity FROM inventory.items WHERE id='${item}'`))
      .toEqual([{ quantity: 7 }]);
    await asUser(owner, `SELECT inventory.record_stock_movement('${project}','${item}','adjust',-2,NULL,'adjust-down')`);
    expect(await asUser(owner, `SELECT quantity FROM inventory.items WHERE id='${item}'`))
      .toEqual([{ quantity: 5 }]);
  });

});
