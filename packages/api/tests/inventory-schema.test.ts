import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const id = (kind: number, n: number) => `${kind}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const u = (n: number) => id(1, n);
const org = (n: number) => id(2, n);
const p = (n: number) => id(3, n);
const cat = (n: number) => id(4, n);
const template = (n: number) => id(5, n);
const version = (n: number) => id(6, n);
const item = (n: number) => id(7, n);
const movement = (n: number) => id(8, n);
const tables = ['categories', 'templates', 'template_versions', 'items', 'stock_movements'];
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;`);
  for (const name of ['001_control_schema.sql', '002_projects.sql', '003_tenant_security.sql', '004_project_management.sql', '005_inventory_schema.sql']) {
    const file = new URL(`../migrations/${name}`, import.meta.url);
    await db.exec(readFileSync(file, 'utf8'));
  }
  await db.exec(`INSERT INTO auth.users SELECT ('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid FROM generate_series(1,8) n;
    INSERT INTO control.organisations (id,name,slug) VALUES ('${org(1)}','One','org-one'),('${org(2)}','Two','org-two');
    INSERT INTO control.org_members (org_id,user_id,role) VALUES
      ('${org(1)}','${u(1)}','owner'),('${org(1)}','${u(2)}','admin'),
      ('${org(1)}','${u(3)}','member'),('${org(1)}','${u(4)}','member'),
      ('${org(1)}','${u(5)}','member'),('${org(1)}','${u(6)}','member'),
      ('${org(1)}','${u(7)}','member'),('${org(2)}','${u(8)}','owner');
    INSERT INTO control.projects (id,org_id,name,created_by) VALUES
      ('${p(1)}','${org(1)}','One','${u(1)}'),('${p(2)}','${org(1)}','Sibling','${u(1)}'),
      ('${p(3)}','${org(2)}','Foreign','${u(8)}'),('${p(4)}','${org(1)}','Empty','${u(1)}');
    INSERT INTO control.project_members (project_id,user_id,role) VALUES
      ('${p(1)}','${u(3)}','owner'),('${p(1)}','${u(4)}','admin'),
      ('${p(1)}','${u(5)}','editor'),('${p(1)}','${u(6)}','viewer');`);
}, 30000);

afterAll(async () => { if (db && !db.closed) await db.close(); });

it('creates five inventory tables with RLS enabled', async () => {
  const result = await db.query<{ relname: string; relrowsecurity: boolean }>(
    "SELECT relname,relrowsecurity FROM pg_class JOIN pg_namespace ns ON ns.oid=relnamespace WHERE ns.nspname='inventory' AND relkind='r' ORDER BY relname");
  expect(result.rows).toEqual([...tables].sort().map((relname) => ({ relname, relrowsecurity: true })));
});

async function asUser<T>(user: number, sql: string, params: unknown[] = []) {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [u(user)]);
  await db.exec('SET LOCAL ROLE authenticated');
  return db.query<T>(sql, params);
}

describe('Inventory schema invariants', () => {
  beforeEach(async () => {
    await db.exec('BEGIN');
    for (const n of [1, 2, 3]) {
      await db.query('INSERT INTO inventory.categories (id,project_id,name) VALUES ($1,$2,$3)', [cat(n), p(n), 'Root']);
      await db.query('INSERT INTO inventory.templates (id,project_id,name) VALUES ($1,$2,$3)', [template(n), p(n), 'Template']);
      await db.query('INSERT INTO inventory.template_versions (id,project_id,template_id,version,schema,published_at) VALUES ($1,$2,$3,1,$4,now())', [version(n), p(n), template(n), {}]);
      await db.query('INSERT INTO inventory.items (id,project_id,template_version_id,category_id,name) VALUES ($1,$2,$3,$4,$5)', [item(n), p(n), version(n), cat(n), 'Item']);
      await db.query('INSERT INTO inventory.stock_movements (id,project_id,item_id,type,quantity,created_by) VALUES ($1,$2,$3,$4,1,$5)', [movement(n), p(n), item(n), 'receive', u(n === 3 ? 8 : 1)]);
    }
    await db.query('INSERT INTO inventory.categories (id,project_id,name,parent_id) VALUES ($1,$2,$3,$4)', [cat(4), p(1), 'Child', cat(1)]);
    await db.query('INSERT INTO inventory.categories (id,project_id,name,parent_id) VALUES ($1,$2,$3,$4)', [cat(5), p(1), 'Grandchild', cat(4)]);
    await db.query('INSERT INTO inventory.categories (id,project_id,name) VALUES ($1,$2,$3)', [cat(6), p(1), 'Other root']);
    await db.query('INSERT INTO inventory.template_versions (id,project_id,template_id,version,schema) VALUES ($1,$2,$3,2,$4)', [version(4), p(1), template(1), {}]);
  });
  afterEach(async () => { await db.exec('ROLLBACK'); });

  it.each([1, 2, 3, 4, 5, 6])('allows project reader %i to read all five tables', async (user) => {
    for (const table of tables) {
      expect((await asUser(user, `SELECT id FROM inventory.${table} WHERE project_id=$1`, [p(1)])).rows.length).toBeGreaterThan(0);
    }
  });

  it.each([3, 4, 5, 6, 7, 8])('isolates sibling/foreign projects for user %i', async (user) => {
    for (const table of tables) {
      const rows = (await asUser<{ project_id: string }>(user, `SELECT project_id FROM inventory.${table}`)).rows;
      const expected = user === 8 ? p(3) : user === 7 ? null : p(1);
      expect(rows.every((row) => row.project_id === expected)).toBe(true);
      if (user === 7) expect(rows).toEqual([]);
    }
  });

  it('revokes inventory access with org membership even if project membership remains', async () => {
    await db.query('DELETE FROM control.org_members WHERE user_id=$1', [u(6)]);
    for (const table of tables) expect((await asUser(6, `SELECT id FROM inventory.${table}`)).rows).toEqual([]);
  });

  it.each([1, 2, 3, 4])('allows owner/admin %i to create category/template and edit draft', async (user) => {
    expect((await asUser(user, 'INSERT INTO inventory.categories(project_id,name) VALUES($1,$2) RETURNING id', [p(1), 'New'])).rows).toHaveLength(1);
    expect((await asUser(user, 'INSERT INTO inventory.templates(project_id,name) VALUES($1,$2) RETURNING id', [p(1), 'New'])).rows).toHaveLength(1);
    expect((await asUser(user, 'UPDATE inventory.template_versions SET schema=$1 WHERE id=$2 RETURNING id', [{ fields: [] }, version(4)])).rows).toHaveLength(1);
  });

  it.each([5, 6])('denies editor/viewer %i category/template edits', async (user) => {
    for (const table of ['categories', 'templates']) {
      expect((await asUser(user, `UPDATE inventory.${table} SET name='Forbidden' WHERE project_id=$1 RETURNING id`, [p(1)])).rows).toEqual([]);
    }
  });

  it.each([1, 2, 3, 4, 5])('allows metadata writes by user %i', async (user) => {
    expect((await asUser(user, 'UPDATE inventory.items SET name=$1,attributes=$2 WHERE id=$3 RETURNING name', ['Updated', { serial: 'abc' }, item(1)])).rows).toEqual([{ name: 'Updated' }]);
  });

  it('denies viewer metadata writes and editor cross-project inserts', async () => {
    expect((await asUser(6, "UPDATE inventory.items SET name='No' RETURNING id")).rows).toEqual([]);
    await expect(asUser(5, 'INSERT INTO inventory.items(project_id,template_version_id,name) VALUES($1,$2,$3)', [p(2), version(2), 'Cross'])).rejects.toMatchObject({ code: '42501' });
  });

  it.each(['categories', 'templates', 'template_versions', 'items', 'stock_movements'])('denies anonymous reads of %s', async (table) => {
    await db.exec('SET LOCAL ROLE anon');
    await expect(db.query(`SELECT * FROM inventory.${table}`)).rejects.toMatchObject({ code: '42501' });
  });

  it('derives paths and propagates subtree moves', async () => {
    expect((await db.query('SELECT path FROM inventory.categories WHERE id=$1', [cat(5)])).rows).toEqual([{ path: `/${cat(1)}/${cat(4)}/${cat(5)}/` }]);
    await asUser(3, 'UPDATE inventory.categories SET parent_id=$1 WHERE id=$2', [cat(6), cat(4)]);
    expect((await db.query('SELECT path FROM inventory.categories WHERE id=$1', [cat(5)])).rows).toEqual([{ path: `/${cat(6)}/${cat(4)}/${cat(5)}/` }]);
  });

  it('rejects category cycles', async () => {
    await expect(asUser(1, 'UPDATE inventory.categories SET parent_id=$1 WHERE id=$2', [cat(5), cat(1)])).rejects.toMatchObject({ code: '23514' });
  });

  it('does not let clients supply materialized paths', async () => {
    await expect(asUser(1, "UPDATE inventory.categories SET path='/forged/' WHERE id=$1", [cat(1)])).rejects.toMatchObject({ code: '42501' });
  });

  it.each([2, 3])('rejects parent category in project %i', async (target) => {
    await expect(db.query('INSERT INTO inventory.categories(project_id,name,parent_id) VALUES($1,$2,$3)', [p(1), 'Cross', cat(target)])).rejects.toMatchObject({ code: '23503' });
  });

  it.each([2, 3])('rejects item version/category links into project %i', async (target) => {
    await db.exec('SAVEPOINT version_link');
    await expect(db.query('INSERT INTO inventory.items(project_id,template_version_id,name) VALUES($1,$2,$3)', [p(1), version(target), 'Cross'])).rejects.toMatchObject({ code: '23503' });
    await db.exec('ROLLBACK TO SAVEPOINT version_link');
    await expect(db.query('UPDATE inventory.items SET category_id=$1 WHERE id=$2', [cat(target), item(1)])).rejects.toMatchObject({ code: '23503' });
  });

  it('rejects draft item versions', async () => {
    await expect(db.query('INSERT INTO inventory.items(project_id,template_version_id,name) VALUES($1,$2,$3)', [p(1), version(4), 'Draft item'])).rejects.toMatchObject({ code: '23503' });
  });

  it('only permits current pointers to published versions of the same template', async () => {
    await db.query('UPDATE inventory.templates SET current_version_id=$1 WHERE id=$2', [version(1), template(1)]);
    await db.exec('SAVEPOINT draft_pointer');
    await expect(db.query('UPDATE inventory.templates SET current_version_id=$1 WHERE id=$2', [version(4), template(1)])).rejects.toMatchObject({ code: '23503' });
    await db.exec('ROLLBACK TO SAVEPOINT draft_pointer');
    await expect(db.query('UPDATE inventory.templates SET current_version_id=$1 WHERE id=$2', [version(2), template(1)])).rejects.toMatchObject({ code: '23503' });
  });

  it('publishes a draft and leaves existing items pinned to their version', async () => {
    await asUser(3, 'UPDATE inventory.template_versions SET published_at=now() WHERE id=$1', [version(4)]);
    await db.query('UPDATE inventory.templates SET current_version_id=$1 WHERE id=$2', [version(4), template(1)]);
    expect((await db.query('SELECT template_version_id FROM inventory.items WHERE id=$1', [item(1)])).rows).toEqual([{ template_version_id: version(1) }]);
  });

  it('rejects a published current version from another template in the same project', async () => {
    await db.query('INSERT INTO inventory.templates(id,project_id,name) VALUES($1,$2,$3)', [template(4), p(1), 'Another template']);
    await db.query('INSERT INTO inventory.template_versions(id,project_id,template_id,version,schema,published_at) VALUES($1,$2,$3,1,$4,now())', [version(5), p(1), template(4), {}]);
    await expect(asUser(1, 'UPDATE inventory.templates SET current_version_id=$1 WHERE id=$2', [version(5), template(1)])).rejects.toMatchObject({ code: '23503' });
  });

  it.each(['UPDATE inventory.template_versions SET schema=\'{"changed":true}\' WHERE id=$1', 'DELETE FROM inventory.template_versions WHERE id=$1'])(
    'protects published history from service role: %s', async (sql) => {
      await db.exec('SET LOCAL ROLE service_role');
      await expect(db.query(sql, [version(1)])).rejects.toMatchObject({ code: '55000' });
    }
  );

  it('rejects duplicate version numbers', async () => {
    await expect(db.query('INSERT INTO inventory.template_versions(project_id,template_id,version,schema) VALUES($1,$2,1,$3)', [p(1), template(1), {}])).rejects.toMatchObject({ code: '23505' });
  });

  it.each(['items', 'template_versions'])('requires a JSONB object for %s', async (table) => {
    const column = table === 'items' ? 'attributes' : 'schema';
    const rowId = table === 'items' ? item(1) : version(4);
    await expect(db.query(`UPDATE inventory.${table} SET ${column}='[]' WHERE id=$1`, [rowId])).rejects.toMatchObject({ code: '23514' });
  });

  it.each(tables)('protects project identity from tenant edits on %s', async (table) => {
    await expect(asUser(1, `UPDATE inventory.${table} SET project_id=$1 WHERE project_id=$2`, [p(2), p(1)])).rejects.toMatchObject({ code: '42501' });
  });

  it('protects item version identity even from service-role changes', async () => {
    await db.exec('SET LOCAL ROLE service_role');
    await expect(db.query('UPDATE inventory.items SET template_version_id=$1 WHERE id=$2', [version(4), item(1)])).rejects.toMatchObject({ code: '55000' });
  });

  it('defaults item quantity to zero', async () => {
    expect((await db.query('SELECT quantity::text FROM inventory.items WHERE id=$1', [item(1)])).rows).toEqual([{ quantity: '0' }]);
  });

  it.each(['UPDATE inventory.items SET quantity=10 WHERE id=$1', 'INSERT INTO inventory.items(project_id,template_version_id,name,quantity) VALUES($1,$2,\'Bad\',10)'])(
    'denies direct quantity writes: %s', async (sql) => {
      await expect(asUser(1, sql, sql.startsWith('UPDATE') ? [item(1)] : [p(1), version(1)])).rejects.toMatchObject({ code: '42501' });
    }
  );

  it('denies tenant movement insertion', async () => {
    await expect(asUser(1, 'INSERT INTO inventory.stock_movements(project_id,item_id,type,quantity,created_by) VALUES($1,$2,\'receive\',1,$3)', [p(1), item(1), u(1)])).rejects.toMatchObject({ code: '42501' });
  });

  it.each(['UPDATE inventory.stock_movements SET quantity=2 WHERE id=$1', 'DELETE FROM inventory.stock_movements WHERE id=$1'])(
    'keeps movements immutable for service role: %s', async (sql) => {
      await db.exec('SET LOCAL ROLE service_role');
      await expect(db.query(sql, [movement(1)])).rejects.toMatchObject({ code: '55000' });
    }
  );

  it('denies service-role truncate of immutable history', async () => {
    await db.exec('SET LOCAL ROLE service_role');
    await expect(db.exec('TRUNCATE inventory.stock_movements')).rejects.toMatchObject({ code: '42501' });
  });

  it('rejects movements linked to a different project', async () => {
    await expect(db.query('INSERT INTO inventory.stock_movements(project_id,item_id,type,quantity,created_by) VALUES($1,$2,\'receive\',1,$3)', [p(1), item(2), u(1)])).rejects.toMatchObject({ code: '23503' });
  });

  it('enforces project-scoped idempotency references', async () => {
    const sql = "INSERT INTO inventory.stock_movements(project_id,item_id,type,quantity,created_by,reference_id) VALUES($1,$2,'receive',1,$3,'event-one')";
    await db.query(sql, [p(1), item(1), u(1)]);
    await db.query(sql, [p(2), item(2), u(1)]);
    await expect(db.query(sql, [p(1), item(1), u(1)])).rejects.toMatchObject({ code: '23505' });
  });

  it('retains populated projects and still deletes empty projects', async () => {
    expect((await db.query('DELETE FROM control.projects WHERE id=$1 RETURNING id', [p(4)])).rows).toEqual([{ id: p(4) }]);
    await expect(db.query('DELETE FROM control.projects WHERE id=$1', [p(1)])).rejects.toMatchObject({ code: '23001' });
  });
});
