import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';

const actor = '10000000-0000-4000-8000-000000000001';
const outsider = '10000000-0000-4000-8000-000000000002';
const orgId = '20000000-0000-4000-8000-000000000001';
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
  for (const name of ['001_control_schema.sql', '002_projects.sql', '003_tenant_security.sql', '004_project_management.sql']) {
    const file = new URL(`../migrations/${name}`, import.meta.url);
    await db.exec(readFileSync(file, 'utf8'));
  }
}, 30000);

beforeEach(async () => {
  await db.exec(`BEGIN;
    INSERT INTO auth.users (id) VALUES ('${actor}'), ('${outsider}');
    INSERT INTO control.organisations (id, name, slug) VALUES ('${orgId}', 'Org', 'org-one');
    INSERT INTO control.org_members (org_id, user_id, role) VALUES ('${orgId}', '${actor}', 'owner');
    INSERT INTO control.subscriptions (org_id) VALUES ('${orgId}');
  `);
});
afterEach(async () => { await db.exec('ROLLBACK'); });
afterAll(async () => { if (db && !db.closed) await db.close(); });

async function create(userId = actor, name = 'Project') {
  await db.exec('SET LOCAL ROLE service_role');
  return db.query<{ id: string }>('SELECT control.create_project($1,$2,NULL,$3) AS id', [orgId, name, userId]);
}

describe('M3 quota transaction', () => {
  it.each([['free', 2], ['starter', 5], ['business', 10], ['enterprise', 3]] as const)(
    '%s allows exactly %i projects and rejects the next without partial writes', async (tier, limit) => {
      await db.query('UPDATE control.subscriptions SET tier=$1,max_projects=$2', [tier, limit]);
      for (let n = 0; n < limit; n++) await create();
      await db.exec('SAVEPOINT quota');
      await expect(create()).rejects.toMatchObject({ code: 'P0003' });
      await db.exec('ROLLBACK TO SAVEPOINT quota; RESET ROLE');
      for (const table of ['projects', 'project_members', 'audit_logs']) {
        expect((await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM control.${table}`)).rows[0].count).toBe(limit);
      }
    }
  );

  it('supports explicitly unlimited Enterprise configuration', async () => {
    await db.exec("UPDATE control.subscriptions SET tier='enterprise', max_projects=NULL");
    for (let n = 0; n < 12; n++) await create();
    expect((await db.query('SELECT id FROM control.projects')).rows).toHaveLength(12);
  });

  it.each([['free', 99], ['starter', 2], ['business', 5], ['enterprise', -1], ['free', null]] as const)(
    'rejects invalid %s limit %s', async (tier, limit) => {
      await expect(db.query('UPDATE control.subscriptions SET tier=$1,max_projects=$2', [tier, limit])).rejects.toMatchObject({ code: '23514' });
    }
  );

  it.each(['member', 'outsider', 'revoked'])(
    'rejects %s actors inside the privileged RPC', async (kind) => {
      if (kind === 'member') await db.exec("UPDATE control.org_members SET role='member'");
      if (kind === 'revoked') await db.exec('DELETE FROM control.org_members');
      await expect(create(kind === 'outsider' ? outsider : actor)).rejects.toMatchObject({ code: '42501' });
    }
  );

  it('allows org admins to create and assigns ownership plus audit authorship', async () => {
    await db.exec("UPDATE control.org_members SET role='admin'");
    const id = (await create()).rows[0].id;
    expect((await db.query('SELECT project_id,user_id,role FROM control.project_members')).rows)
      .toEqual([{ project_id: id, user_id: actor, role: 'owner' }]);
    expect((await db.query('SELECT user_id,action,entity_id FROM control.audit_logs')).rows)
      .toEqual([{ user_id: actor, action: 'project.create', entity_id: id }]);
  });

  it('fails closed when the organisation has no subscription', async () => {
    await db.exec('DELETE FROM control.subscriptions');
    await expect(create()).rejects.toMatchObject({ code: 'P0002' });
  });

  it('lets the org owner delete with RETURNING, cascades membership and frees capacity', async () => {
    const first = (await create()).rows[0].id;
    await create();
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [actor]);
    await db.exec('SET LOCAL ROLE authenticated');
    expect((await db.query('DELETE FROM control.projects WHERE id=$1 RETURNING id', [first])).rows).toEqual([{ id: first }]);
    await db.exec('RESET ROLE');
    expect((await db.query('SELECT project_id FROM control.project_members')).rows).toHaveLength(1);
    await create();
    expect((await db.query('SELECT id FROM control.projects')).rows).toHaveLength(2);
  });

  it.each(['admin', 'member'])('denies org %s deletion despite explicit project ownership', async (role) => {
    const id = (await create()).rows[0].id;
    await db.exec('RESET ROLE');
    await db.query('UPDATE control.org_members SET role=$1', [role]);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [actor]);
    await db.exec('SET LOCAL ROLE authenticated');
    expect((await db.query('DELETE FROM control.projects WHERE id=$1 RETURNING id', [id])).rows).toEqual([]);
    expect((await db.query('SELECT id FROM control.projects')).rows).toEqual([{ id }]);
  });

  it('rolls back project and membership when the audit insert fails', async () => {
    await db.exec(`CREATE FUNCTION private.fail_audit() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$;
      CREATE TRIGGER fail_audit BEFORE INSERT ON control.audit_logs FOR EACH ROW EXECUTE FUNCTION private.fail_audit();
      SAVEPOINT audit_failure;`);
    await expect(create()).rejects.toThrow('audit unavailable');
    await db.exec('ROLLBACK TO SAVEPOINT audit_failure; RESET ROLE');
    expect((await db.query('SELECT id FROM control.projects')).rows).toEqual([]);
    expect((await db.query('SELECT id FROM control.project_members')).rows).toEqual([]);
  });

  it.each(['anon', 'authenticated'])('denies %s direct RPC execution', async (role) => {
    await db.exec(`SET LOCAL ROLE ${role}`);
    await expect(db.query('SELECT control.create_project($1,$2,NULL,$3)', [orgId, 'Bypass', actor]))
      .rejects.toMatchObject({ code: '42501' });
  });

  it('denies direct insertion even to an authenticated org owner', async () => {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [actor]);
    await db.exec('SET LOCAL ROLE authenticated');
    await expect(db.query('INSERT INTO control.projects (org_id,name,created_by) VALUES ($1,$2,$3)', [orgId, 'Bypass', actor]))
      .rejects.toMatchObject({ code: '42501' });
  });
});
