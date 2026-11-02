import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const project = id(20), sibling = id(21), template = id(30), other = id(31);
const schema = { fields: [{ key: 'serial', label: 'Serial', type: 'text', required: false }] };
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;`);
  for (const name of ['001_control_schema', '002_projects', '003_tenant_security', '004_project_management', '005_inventory_schema', '006_template_builder']) {
    await db.exec(readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8'));
  }
  await db.exec(`INSERT INTO auth.users SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,8)n;
    INSERT INTO control.organisations(id,name,slug) VALUES('${id(10)}','Org','org');
    INSERT INTO control.org_members(org_id,user_id,role) VALUES
    ('${id(10)}','${id(1)}','owner'),('${id(10)}','${id(2)}','admin'),
    ('${id(10)}','${id(3)}','member'),('${id(10)}','${id(4)}','member'),
    ('${id(10)}','${id(5)}','member'),('${id(10)}','${id(6)}','member'),('${id(10)}','${id(7)}','member');
    INSERT INTO control.projects(id,org_id,name,created_by) VALUES
    ('${project}','${id(10)}','Project','${id(1)}'),('${sibling}','${id(10)}','Sibling','${id(1)}');
    INSERT INTO control.project_members(project_id,user_id,role) VALUES
    ('${project}','${id(3)}','owner'),('${project}','${id(4)}','admin'),
    ('${project}','${id(5)}','editor'),('${project}','${id(6)}','viewer');`);
}, 30000);
afterAll(async () => { if (db && !db.closed) await db.close(); });
beforeEach(async () => {
  await db.exec('BEGIN');
  await db.query('INSERT INTO inventory.templates(id,project_id,name) VALUES($1,$2,$3),($4,$5,$3)', [template, project, 'Template', other, sibling]);
});
afterEach(async () => { await db.exec('ROLLBACK'); });
async function asUser<T = { id: string; version: number; published_at: string | null }>(user: number, sql: string, params: unknown[] = []) {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [id(user)]);
  await db.exec('SET LOCAL ROLE authenticated');
  return db.query<T>(sql, params);
}
async function draft(user = 1, value: unknown = schema) {
  return (await asUser(user, 'SELECT * FROM inventory.create_template_version($1,$2,$3)', [project, template, value])).rows[0];
}
async function publish(versionId: string, user = 1, templateId = template) {
  return asUser(user, 'SELECT * FROM inventory.publish_template_version($1,$2,$3)', [project, templateId, versionId]);
}
it.each([1, 2, 3, 4])('allocates drafts and publishes for owner/admin %i', async (user) => {
  const first = await draft(user), second = await draft(user);
  expect([first.version, second.version]).toEqual([1, 2]);
  const result = await publish(first.id, user);
  expect(result.rows[0].published_at).not.toBeNull();
  expect((await asUser<{ current_version_id: string }>(user, 'SELECT current_version_id FROM inventory.templates WHERE id=$1', [template])).rows[0].current_version_id).toBe(first.id);
});
it.each([5, 6, 7, 8])('denies draft creation for unauthorized actor %i', async (user) => {
  await expect(draft(user)).rejects.toMatchObject({ code: '42501' });
});
it.each([5, 6, 7, 8])('denies publication for unauthorized actor %i', async (user) => {
  const version = await draft();
  await expect(publish(version.id, user)).rejects.toMatchObject({ code: '42501' });
});
it('hides a sibling template from an explicit project admin', async () => {
  await expect(asUser(4, 'SELECT * FROM inventory.create_template_version($1,$2,$3)', [project, other, schema])).rejects.toMatchObject({ code: 'T0001' });
});
it('rejects a version request whose parent belongs to another project', async () => {
  const version = await draft();
  await expect(publish(version.id, 1, other)).rejects.toMatchObject({ code: 'T0001' });
});
it('rejects a version belonging to another existing template in the same project', async () => {
  await db.query('INSERT INTO inventory.templates(id,project_id,name) VALUES($1,$2,$3)', [id(32), project, 'Second']);
  const version = await draft();
  await expect(publish(version.id, 1, id(32))).rejects.toMatchObject({ code: 'T0002' });
});
it('uses publication order rather than version number for the current pointer', async () => {
  const first = await draft(), second = await draft();
  await publish(second.id);
  await publish(first.id);
  const current = await asUser<{ current_version_id: string }>(1, 'SELECT current_version_id FROM inventory.templates WHERE id=$1', [template]);
  expect(current.rows[0].current_version_id).toBe(first.id);
});
it('rejects version integer exhaustion without overflow', async () => {
  await asUser(1, 'INSERT INTO inventory.template_versions(project_id,template_id,version,schema) VALUES($1,$2,2147483647,$3)', [project, template, schema]);
  await expect(draft()).rejects.toMatchObject({ code: 'T0005' });
});
it('rejects missing versions without publishing', async () => {
  await expect(publish(id(99))).rejects.toMatchObject({ code: 'T0002' });
});
it('cannot edit, delete or republish published versions', async () => {
  const version = await draft();
  await publish(version.id);
  await db.exec('SAVEPOINT retry');
  await expect(publish(version.id)).rejects.toMatchObject({ code: 'T0003' });
  await db.exec('ROLLBACK TO SAVEPOINT retry');
  await expect(asUser(1, 'UPDATE inventory.template_versions SET schema=$1 WHERE id=$2', [{ fields: [] }, version.id])).rejects.toMatchObject({ code: '55000' });
  await db.exec('ROLLBACK TO SAVEPOINT retry');
  await expect(asUser(1, 'DELETE FROM inventory.template_versions WHERE id=$1', [version.id])).rejects.toMatchObject({ code: '55000' });
});
it('allows replacing/deleting drafts and reusing the highest deleted number', async () => {
  const first = await draft(), second = await draft();
  await asUser(1, 'UPDATE inventory.template_versions SET schema=$1 WHERE id=$2', [{ fields: [] }, first.id]);
  await asUser(1, 'DELETE FROM inventory.template_versions WHERE id=$1', [second.id]);
  expect((await draft()).version).toBe(2);
});
it.each([{}, { fields: [{ key: 'x', label: 'X', type: 'select', options: [] }] },
  { fields: [{ key: 'constructor', label: 'X', type: 'text' }] },
  { fields: [{ key: 'x', label: 'X', type: 'text', extra: true }] },
  { fields: [{ key: 'x', label: 'X', type: 'select', options: ['a', ' a '] }] },
  { fields: [{ key: 'x', label: 'X', type: 'text' }, { key: 'x', label: 'Y', type: 'number' }] },
])('blocks malformed direct SQL publication %j', async (value) => {
  await asUser(1, 'INSERT INTO inventory.template_versions(project_id,template_id,version,schema) VALUES($1,$2,1,$3)', [project, template, value]);
  await expect(asUser(1, 'UPDATE inventory.template_versions SET published_at=now() WHERE template_id=$1', [template])).rejects.toMatchObject({ code: 'T0004' });
});
it('blocks malformed schema inserted already published', async () => {
  await expect(asUser(1, 'INSERT INTO inventory.template_versions(project_id,template_id,version,schema,published_at) VALUES($1,$2,1,$3,now())', [project, template, {}])).rejects.toMatchObject({ code: 'T0004' });
});
it('accepts all field types at direct publication boundary', async () => {
  const fields = ['text', 'number', 'boolean', 'date', 'select'].map((type) => ({ key: type, label: type, type, ...(type === 'select' ? { options: ['A', 'B'] } : {}) }));
  const version = await draft(1, { fields });
  expect((await publish(version.id)).rows[0].published_at).not.toBeNull();
});
it('rolls publication back if updating the current pointer fails', async () => {
  const version = await draft();
  await db.exec('RESET ROLE');
  await db.exec(`CREATE FUNCTION private.fail_template_pointer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fail'; END $$;
    CREATE TRIGGER test_pointer BEFORE UPDATE ON inventory.templates FOR EACH ROW EXECUTE FUNCTION private.fail_template_pointer(); SAVEPOINT publication;`);
  await expect(publish(version.id)).rejects.toThrow('fail');
  await db.exec('ROLLBACK TO SAVEPOINT publication');
  expect((await asUser(1, 'SELECT * FROM inventory.template_versions WHERE id=$1', [version.id])).rows[0].published_at).toBeNull();
});
it('revoked org membership denies RPCs even with a project role', async () => {
  await db.query('DELETE FROM control.org_members WHERE user_id=$1', [id(4)]);
  await expect(draft(4)).rejects.toMatchObject({ code: '42501' });
});
it('restricts RPC execution to authenticated, using invoker security', async () => {
  const rows = (await db.query<{ prosecdef: boolean; anon: boolean; authenticated: boolean }>(`SELECT prosecdef,
    has_function_privilege('anon',p.oid,'execute') AS anon,
    has_function_privilege('authenticated',p.oid,'execute') AS authenticated
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='inventory' AND p.proname IN ('create_template_version','publish_template_version')`)).rows;
  expect(rows).toHaveLength(2);
  expect(rows.every((r) => !r.prosecdef && !r.anon && r.authenticated)).toBe(true);
});
