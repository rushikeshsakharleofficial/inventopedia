import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { createApp } from '../src/app.js';
import { authMiddleware } from '../src/middleware/auth.js';
import { orgScope } from '../src/middleware/orgScope.js';
import { projectScope } from '../src/middleware/projectScope.js';
import { requireOrgRole, requireProjectRole } from '../src/middleware/permissions.js';
import type { AppEnv } from '../src/types.js';

const mocks = vi.hoisted(() => ({ getSupabaseClient: vi.fn(), getSupabaseAdmin: vi.fn() }));
vi.mock('../src/db/index.js', () => mocks);

const userId = '10000000-0000-4000-8000-000000000001';
const orgId = '20000000-0000-4000-8000-00000000000a';
const otherOrgId = '20000000-0000-4000-8000-000000000002';
const projectId = '30000000-0000-4000-8000-00000000000a';
const timestamp = '2026-11-01T00:00:00Z';
const organisation = { id: orgId, name: 'Org', slug: 'org-one', created_at: timestamp, updated_at: timestamp };
type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let queryError: { message: string } | null;
const filters = vi.fn();

function query(table: string) {
  const clauses: [string, unknown][] = [];
  const result = () => ({
    data: (tables[table] ?? []).filter((row) => clauses.every(([key, value]) => row[key] === value)),
    error: queryError,
  });
  const builder = {
    select: (_columns: string) => builder,
    eq: (key: string, value: unknown) => { clauses.push([key, value]); filters(table, key, value); return builder; },
    order: (_column: string, _options: unknown) => builder,
    maybeSingle: async () => ({ ...result(), data: result().data[0] ?? null }),
    then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  queryError = null;
  tables = {
    org_members: [{ id: '40000000-0000-4000-8000-000000000001', org_id: orgId, user_id: userId, role: 'member', created_at: timestamp, organisations: organisation }],
    projects: [{ id: projectId, org_id: orgId }],
    project_members: [{ project_id: projectId, user_id: userId, role: 'viewer' }],
  };
  mocks.getSupabaseClient.mockImplementation(() => ({ from: query }));
  mocks.getSupabaseAdmin.mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId, email: 'user@example.com' } }, error: null }) } });
});

function scopedApp() {
  const app = createApp();
  const routes = new Hono<AppEnv>();
  routes.use('*', authMiddleware());
  routes.get('/orgs/:orgId', orgScope(), requireOrgRole('owner', 'admin'), (c) => c.json(c.get('org')));
  routes.get('/projects/:projectId', projectScope(), (c) => c.json(c.get('project')));
  routes.post('/projects/:projectId', projectScope(), requireProjectRole('owner', 'admin', 'editor'), (c) => c.json(c.get('project')));
  routes.get('/orgs/:orgId/projects/:projectId', orgScope(), projectScope(), (c) => c.json(c.get('project')));
  app.route('/test', routes);
  return app;
}

function request(path: string, method = 'GET') {
  return scopedApp().request(path, { method, headers: { Authorization: 'Bearer valid', 'X-Request-Id': 'security-test' } });
}

describe('Organisation scope', () => {
  it('denies an ordinary member access to admin operations', async () => {
    expect((await request(`/test/orgs/${orgId}`)).status).toBe(403);
  });

  it.each(['owner', 'admin'])('allows %s and attaches caller membership', async (role) => {
    tables.org_members[0].role = role;
    const res = await request(`/test/orgs/${orgId}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: orgId, role });
    expect(filters).toHaveBeenCalledWith('org_members', 'user_id', userId);
    expect(mocks.getSupabaseClient).toHaveBeenCalledWith('valid');
  });

  it('returns 404 for another organisation without disclosing membership', async () => {
    const res = await request(`/test/orgs/${otherOrgId}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND', requestId: 'security-test' });
  });

  it('validates scope IDs before querying the database', async () => {
    expect((await request('/test/orgs/not-a-uuid')).status).toBe(400);
    expect(mocks.getSupabaseClient).not.toHaveBeenCalled();
  });

  it('requires membership on the real members route', async () => {
    const res = await request(`/api/v1/organisations/${otherOrgId}/members`);
    expect(res.status).toBe(404);
  });

  it('uses the caller role when an organisation has several members', async () => {
    tables.org_members.unshift({ ...tables.org_members[0], user_id: '10000000-0000-4000-8000-000000000002', role: 'owner' });
    const res = await request(`/api/v1/organisations/${orgId}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { id: orgId, userRole: 'member' } });
  });

  it('lists each organisation once with only the caller role', async () => {
    tables.org_members.push({ ...tables.org_members[0], user_id: '10000000-0000-4000-8000-000000000002', role: 'owner' });
    const res = await request('/api/v1/organisations');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].userRole).toBe('member');
  });
});

describe('Project scope', () => {
  it.each(['owner', 'admin', 'editor', 'viewer'])('resolves explicit %s project membership', async (role) => {
    tables.project_members[0].role = role;
    const res = await request(`/test/projects/${projectId}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: projectId, orgId, role });
    expect(filters).toHaveBeenCalledWith('project_members', 'user_id', userId);
  });

  it.each(['owner', 'admin', 'editor'])('permits %s to write', async (role) => {
    tables.project_members[0].role = role;
    expect((await request(`/test/projects/${projectId}`, 'POST')).status).toBe(200);
  });

  it('denies writes by viewer', async () => {
    const res = await request(`/test/projects/${projectId}`, 'POST');
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'FORBIDDEN', requestId: 'security-test' });
  });

  it.each(['owner', 'admin'])('inherits org %s access without a project membership', async (role) => {
    tables.org_members[0].role = role;
    tables.project_members = [];
    const res = await request(`/test/projects/${projectId}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ role });
  });

  it('denies an org member without explicit project membership', async () => {
    tables.project_members = [];
    expect((await request(`/test/projects/${projectId}`)).status).toBe(404);
  });

  it('denies stale project membership after org membership is revoked', async () => {
    tables.org_members = [];
    expect((await request(`/test/projects/${projectId}`)).status).toBe(404);
  });

  it('rejects a project from a different org even if both orgs are accessible', async () => {
    tables.org_members.push({ ...tables.org_members[0], org_id: otherOrgId });
    const res = await request(`/test/orgs/${otherOrgId}/projects/${projectId}`);
    expect(res.status).toBe(404);
  });

  it('accepts uppercase UUIDs and compares nested scope canonically', async () => {
    const res = await request(`/test/orgs/${orgId.toUpperCase()}/projects/${projectId.toUpperCase()}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: projectId, orgId, role: 'viewer' });
  });

  it('rejects unknown and malformed project IDs', async () => {
    expect((await request('/test/projects/not-a-uuid')).status).toBe(400);
    expect((await request('/test/projects/30000000-0000-4000-8000-000000000099')).status).toBe(404);
  });

  it('returns 500 rather than 404 or 401 when the database fails', async () => {
    queryError = { message: 'private database problem' };
    const res = await request(`/test/projects/${projectId}`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error', code: 'INTERNAL_ERROR', requestId: 'security-test' });
  });

  it('fails closed on an invalid stored role', async () => {
    tables.project_members[0].role = 'superadmin';
    expect((await request(`/test/projects/${projectId}`)).status).toBe(500);
  });

  it('guards fail closed when their scope middleware is missing', async () => {
    const app = createApp();
    app.get('/org', requireOrgRole('owner'), (c) => c.text('should not run'));
    app.get('/project', requireProjectRole('owner'), (c) => c.text('should not run'));
    expect((await app.request('/org')).status).toBe(403);
    expect((await app.request('/project')).status).toBe(403);
  });
});
