import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const uid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const project = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  `);
  for (const name of ['001_control_schema.sql', '002_projects.sql', '003_tenant_security.sql']) {
    const file = new URL(`../migrations/${name}`, import.meta.url);
    await db.exec(readFileSync(file, 'utf8'));
    if (name === '002_projects.sql') {
      // Reproduce common exposed-schema grants; 003 must narrow them.
      await db.exec('GRANT ALL ON ALL TABLES IN SCHEMA control TO anon, authenticated;');
    }
  }
  await db.exec(`
    GRANT USAGE ON SCHEMA control TO authenticated, anon;
    INSERT INTO auth.users SELECT ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid FROM generate_series(1, 7) n;
    INSERT INTO control.organisations (id, name, slug) VALUES
      ('${org(1)}', 'Tenant A', 'tenant-a'), ('${org(2)}', 'Tenant B', 'tenant-b');
    INSERT INTO control.org_members (org_id, user_id, role) VALUES
      ('${org(1)}', '${uid(1)}', 'owner'), ('${org(1)}', '${uid(2)}', 'admin'),
      ('${org(1)}', '${uid(3)}', 'member'), ('${org(1)}', '${uid(4)}', 'member'),
      ('${org(1)}', '${uid(5)}', 'member'), ('${org(2)}', '${uid(6)}', 'owner'),
      ('${org(1)}', '${uid(7)}', 'member');
    INSERT INTO control.subscriptions (org_id) VALUES ('${org(1)}'), ('${org(2)}');
    INSERT INTO control.projects (id, org_id, name, created_by) VALUES
      ('${project(1)}', '${org(1)}', 'One', '${uid(1)}'),
      ('${project(2)}', '${org(1)}', 'Two', '${uid(1)}'),
      ('${project(3)}', '${org(2)}', 'Other tenant', '${uid(6)}');
    INSERT INTO control.project_members (project_id, user_id, role) VALUES
      ('${project(1)}', '${uid(4)}', 'editor'), ('${project(1)}', '${uid(5)}', 'viewer'),
      ('${project(1)}', '${uid(7)}', 'owner'), ('${project(2)}', '${uid(7)}', 'owner');
  `);
}, 30000);

afterAll(async () => { if (db && !db.closed) await db.close(); });

async function asUser<T>(user: number, sql: string, params: unknown[] = []) {
  await db.exec('BEGIN; SET LOCAL ROLE authenticated;');
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [uid(user)]);
    return await db.query<T>(sql, params);
  } finally {
    await db.exec('ROLLBACK');
  }
}

describe('Tenant RLS on real PostgreSQL (PGlite)', () => {
  it('reads own org and its memberships without recursive policies', async () => {
    expect((await asUser(3, 'SELECT id FROM control.organisations')).rows).toEqual([{ id: org(1) }]);
    expect((await asUser(3, 'SELECT * FROM control.org_members')).rows).toHaveLength(6);
  });

  it('isolates subscriptions and organisations across tenants', async () => {
    expect((await asUser(6, 'SELECT id FROM control.organisations')).rows).toEqual([{ id: org(2) }]);
    expect((await asUser(3, 'SELECT org_id FROM control.subscriptions')).rows).toEqual([{ org_id: org(1) }]);
  });

  it.each([1, 2])('org owner/admin %i sees own projects without explicit membership', async (user) => {
    const result = await asUser(user, 'SELECT id FROM control.projects ORDER BY id');
    expect(result.rows).toEqual([{ id: project(1) }, { id: project(2) }]);
  });

  it('ordinary members need project membership, and viewers see only their projects', async () => {
    expect((await asUser(3, 'SELECT id FROM control.projects')).rows).toEqual([]);
    expect((await asUser(5, 'SELECT id FROM control.projects')).rows).toEqual([{ id: project(1) }]);
    expect((await asUser(5, 'SELECT project_id FROM control.project_members')).rows).toHaveLength(3);
  });

  it('viewers and editors cannot update project settings', async () => {
    for (const user of [4, 5]) {
      expect((await asUser(user, "UPDATE control.projects SET name = 'stolen' RETURNING id")).rows).toEqual([]);
    }
  });

  it('project owner may update settings, and another tenant may not', async () => {
    expect((await asUser(7, "UPDATE control.projects SET name = 'renamed' WHERE id = $1 RETURNING id", [project(1)])).rows).toEqual([{ id: project(1) }]);
    expect((await asUser(6, "UPDATE control.projects SET name = 'stolen' WHERE id = $1 RETURNING id", [project(1)])).rows).toEqual([]);
  });

  it('org admin cannot promote a member to owner or promote itself', async () => {
    await expect(asUser(2, "UPDATE control.org_members SET role = 'owner' WHERE user_id = $1", [uid(3)])).rejects.toThrow();
    expect((await asUser(2, "UPDATE control.org_members SET role = 'owner' WHERE user_id = $1 RETURNING user_id", [uid(2)])).rows).toEqual([]);
  });

  it('org admin can add members but cannot insert owner memberships', async () => {
    expect((await asUser(2, 'INSERT INTO control.org_members (org_id, user_id, role) VALUES ($1, $2, $3) RETURNING user_id', [org(1), uid(6), 'member'])).rows).toEqual([{ user_id: uid(6) }]);
    await expect(asUser(2, 'INSERT INTO control.org_members (org_id, user_id, role) VALUES ($1, $2, $3)', [org(1), uid(6), 'owner'])).rejects.toThrow();
  });

  it('org owner can assign roles', async () => {
    expect((await asUser(1, "UPDATE control.org_members SET role = 'admin' WHERE user_id = $1 RETURNING role", [uid(3)])).rows).toEqual([{ role: 'admin' }]);
  });

  it('cannot move membership or projects between tenants', async () => {
    await expect(asUser(1, 'UPDATE control.org_members SET org_id = $1 WHERE user_id = $2', [org(2), uid(3)])).rejects.toThrow();
    await expect(asUser(1, 'UPDATE control.projects SET org_id = $1 WHERE id = $2', [org(2), project(1)])).rejects.toThrow();
    await expect(asUser(7, 'UPDATE control.project_members SET project_id = $1 WHERE user_id = $2', [project(2), uid(5)])).rejects.toThrow();
  });

  it('project owners may add org members, but cannot add outsiders', async () => {
    expect((await asUser(7, 'INSERT INTO control.project_members (project_id, user_id, role) VALUES ($1, $2, $3) RETURNING role', [project(1), uid(3), 'editor'])).rows).toEqual([{ role: 'editor' }]);
    await expect(asUser(7, 'INSERT INTO control.project_members (project_id, user_id, role) VALUES ($1, $2, $3)', [project(1), uid(6), 'editor'])).rejects.toThrow();
  });

  it('a viewer cannot promote itself and org admins cannot grant project ownership', async () => {
    expect((await asUser(5, "UPDATE control.project_members SET role = 'owner' WHERE user_id = $1 RETURNING role", [uid(5)])).rows).toEqual([]);
    await expect(asUser(2, "UPDATE control.project_members SET role = 'owner' WHERE user_id = $1", [uid(5)])).rejects.toThrow();
  });

  it('revoked org membership invalidates stale project access', async () => {
    await db.exec('BEGIN');
    try {
      await db.query('DELETE FROM control.org_members WHERE user_id = $1', [uid(7)]);
      await db.exec('SET LOCAL ROLE authenticated');
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [uid(7)]);
      expect((await db.query('SELECT id FROM control.projects')).rows).toEqual([]);
      expect((await db.query('SELECT * FROM control.project_members')).rows).toEqual([]);
    } finally { await db.exec('ROLLBACK'); }
  });

  it('tenant owners cannot alter subscription quotas or forge audit entries', async () => {
    await expect(asUser(1, 'UPDATE control.subscriptions SET max_projects = 999')).rejects.toThrow();
    await expect(asUser(1, 'INSERT INTO control.audit_logs (org_id, user_id, action) VALUES ($1, $2, $3)', [org(1), uid(6), 'forged'])).rejects.toThrow();
  });

  it('privileged creation RPCs execute only as service_role', async () => {
    for (const signature of ['control.create_organisation(text,text,uuid)', 'control.create_project(uuid,text,text,uuid)']) {
      const result = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>(`
        SELECT has_function_privilege('anon', $1, 'EXECUTE') AS anon,
          has_function_privilege('authenticated', $1, 'EXECUTE') AS authenticated,
          has_function_privilege('service_role', $1, 'EXECUTE') AS service`, [signature]);
      expect(result.rows).toEqual([{ anon: false, authenticated: false, service: true }]);
    }
  });

  it.each(['anon', 'authenticated'])('rejects direct RPC impersonation by %s', async (role) => {
    await db.exec(`BEGIN; SET LOCAL ROLE ${role};`);
    try {
      await expect(db.query('SELECT control.create_organisation($1, $2, $3)', ['Forged', 'forged-org', uid(1)])).rejects.toThrow(/permission denied/);
    } finally { await db.exec('ROLLBACK'); }
  });

  it('service role can still create an organisation through the hardened RPC', async () => {
    await db.exec('BEGIN; SET LOCAL ROLE service_role;');
    try {
      const result = await db.query<{ id: string }>('SELECT control.create_organisation($1, $2, $3) AS id', ['New org', 'new-org', uid(1)]);
      const members = await db.query<{ role: string }>('SELECT role FROM control.org_members WHERE org_id = $1', [result.rows[0].id]);
      expect(members.rows).toEqual([{ role: 'owner' }]);
    } finally { await db.exec('ROLLBACK'); }
  });

  it('pins every security definer search path and keeps helper schema private', async () => {
    const functions = await db.query<{ proconfig: string[] | null }>(`
      SELECT p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('control', 'private') AND p.prosecdef`);
    expect(functions.rows.length).toBeGreaterThanOrEqual(4);
    for (const row of functions.rows) expect(row.proconfig).toContain('search_path=""');
    expect((await db.query<{ allowed: boolean }>("SELECT has_schema_privilege('anon', 'private', 'USAGE') AS allowed")).rows).toEqual([{ allowed: false }]);
  });
});
