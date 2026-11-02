import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

const mocks = vi.hoisted(() => ({ getSupabaseClient: vi.fn(), getSupabaseAdmin: vi.fn() }));
vi.mock('../src/db/index.js', () => mocks);
const userId = '10000000-0000-4000-8000-000000000001';
const orgId = '20000000-0000-4000-8000-000000000001';
const otherOrgId = '20000000-0000-4000-8000-000000000002';
const projectId = '30000000-0000-4000-8000-000000000001';
const secondId = '30000000-0000-4000-8000-000000000002';
const time = '2026-11-02T00:00:00Z';
const base = `/api/v1/organisations/${orgId}`;
type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let failure: string | null;
let rpcError: { code: string; message: string } | null;
let rpcData: unknown;
let rpc: ReturnType<typeof vi.fn>;
const makeProject = (id = projectId): Row => ({ id, org_id: orgId, name: 'Project', description: null, created_at: time, updated_at: time });

// Emulates the external PostgREST boundary; routes and all application services are real.
function query(table: string) {
  const predicates: ((row: Row) => boolean)[] = [];
  let max = Infinity;
  let patch: Row | null = null;
  let remove = false;
  let sorted = false;
  const result = () => {
    let rows = (tables[table] ?? []).filter((row) => predicates.every((test) => test(row)));
    const count = rows.length;
    if (sorted) rows = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    rows = rows.slice(0, max);
    if (patch) rows.forEach((row) => Object.assign(row, patch));
    if (remove) tables[table] = tables[table].filter((row) => !rows.includes(row));
    return { data: rows, count, error: failure === table ? { code: 'XX000', message: 'private DB failure' } : null };
  };
  const builder = {
    select: (_columns?: string, _options?: unknown) => builder,
    eq: (key: string, value: unknown) => { predicates.push((row) => row[key] === value); return builder; },
    gt: (key: string, value: unknown) => { predicates.push((row) => String(row[key]) > String(value)); return builder; },
    order: (_key: string, _options?: unknown) => { sorted = true; return builder; },
    limit: (value: number) => { max = value; return builder; },
    update: (value: Row) => { patch = value; return builder; },
    delete: () => { remove = true; return builder; },
    maybeSingle: async () => { const res = result(); return { ...res, data: res.data[0] ?? null }; },
    single: async () => { const res = result(); return { ...res, data: res.data[0] ?? null }; },
    then: (resolve: (res: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  failure = null;
  rpcError = null;
  rpcData = projectId;
  tables = {
    org_members: [{ org_id: orgId, user_id: userId, role: 'owner' }],
    projects: [makeProject()],
    project_members: [{ project_id: projectId, user_id: userId, role: 'viewer' }],
    subscriptions: [{ org_id: orgId, tier: 'free', max_projects: 2 }],
  };
  rpc = vi.fn(async () => ({ data: rpcData, error: rpcError }));
  mocks.getSupabaseClient.mockReturnValue({ from: query });
  mocks.getSupabaseAdmin.mockReturnValue({ from: query, rpc, auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
  } });
});

function request(path = '/projects', method = 'GET', body?: unknown, authenticated = true) {
  return createApp().request(`${base}${path}`, { method, headers: {
    ...(authenticated ? { Authorization: 'Bearer valid' } : {}),
    'Content-Type': 'application/json', 'X-Request-Id': 'm3-test',
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

describe('M3 projects API', () => {
  it('requires authentication', async () => {
    expect((await request('/projects', 'GET', undefined, false)).status).toBe(401);
  });

  it.each(['owner', 'admin'])('allows org %s to create with a server-derived actor', async (role) => {
    tables.org_members[0].role = role;
    const res = await request('/projects', 'POST', { name: 'Project' });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ data: { id: projectId, orgId, name: 'Project', description: null }, requestId: 'm3-test' });
    expect(rpc).toHaveBeenCalledWith('create_project', { p_org_id: orgId, p_name: 'Project', p_description: null, p_user_id: userId });
  });

  it('denies creation by ordinary org members', async () => {
    tables.org_members[0].role = 'member';
    expect((await request('/projects', 'POST', { name: 'Project' })).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([{}, { name: '' }, { name: '   ' }, { name: 'x'.repeat(201) }, { name: 'Valid', description: 'x'.repeat(2001) }, { name: 'Valid', orgId: otherOrgId }, { name: 'Valid', userId }])(
    'rejects invalid creation body %j', async (body) => {
      expect((await request('/projects', 'POST', body)).status).toBe(400);
      expect(rpc).not.toHaveBeenCalled();
    }
  );

  it.each([['P0003', 409, 'PROJECT_QUOTA_EXCEEDED'], ['42501', 403, 'FORBIDDEN'], ['P0002', 500, 'INTERNAL_ERROR'], ['XX000', 500, 'INTERNAL_ERROR']] as const)(
    'maps database code %s without exposing private details', async (code, status, expected) => {
      rpcError = { code, message: 'private DB failure' };
      const res = await request('/projects', 'POST', { name: 'Project' });
      expect(res.status).toBe(status);
      const body = await res.json();
      expect(body).toMatchObject({ code: expected, requestId: 'm3-test' });
      expect(JSON.stringify(body)).not.toContain('private DB failure');
    }
  );

  it('rejects malformed RPC responses as internal failures', async () => {
    rpcData = 'not-a-uuid';
    expect((await request('/projects', 'POST', { name: 'Project' })).status).toBe(500);
  });

  it('paginates deterministically and returns a usable next cursor', async () => {
    tables.projects = [makeProject(secondId), makeProject()];
    const res = await request('/projects?limit=1');
    expect(res.status).toBe(200);
    const page = await res.json();
    expect(page.data.map((p: { id: string }) => p.id)).toEqual([projectId]);
    expect(page.pagination.hasMore).toBe(true);
    const next = await (await request(`/projects?limit=1&cursor=${page.pagination.cursor}`)).json();
    expect(next.data.map((p: { id: string }) => p.id)).toEqual([secondId]);
    expect(next.pagination).toEqual({ cursor: null, hasMore: false });
    expect(mocks.getSupabaseClient).toHaveBeenCalledWith('valid');
  });

  it.each(['limit=0', 'limit=101', 'limit=1.5', 'limit=no', 'cursor=bad', 'cursor=', `cursor=${Buffer.from('id.gt.secret,org_id.neq.x').toString('base64url')}`])(
    'rejects invalid pagination %s', async (query) => {
      expect((await request(`/projects?${query}`)).status).toBe(400);
    }
  );

  it('returns an empty terminal page', async () => {
    tables.projects = [];
    const res = await request();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: [], pagination: { cursor: null, hasMore: false } });
  });

  it('reads a project for a viewer', async () => {
    tables.org_members[0].role = 'member';
    const res = await request(`/projects/${projectId}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { id: projectId, orgId } });
  });

  it.each(['owner', 'admin'])('allows explicit project %s to update settings', async (role) => {
    tables.org_members[0].role = 'member';
    tables.project_members[0].role = role;
    const res = await request(`/projects/${projectId}`, 'PATCH', { name: 'Renamed', description: 'Details' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { name: 'Renamed', description: 'Details' } });
  });

  it.each(['editor', 'viewer'])('denies settings changes by %s', async (role) => {
    tables.org_members[0].role = 'member';
    tables.project_members[0].role = role;
    expect((await request(`/projects/${projectId}`, 'PATCH', { name: 'Renamed' })).status).toBe(403);
  });

  it.each([{}, { orgId: otherOrgId }, { created_by: userId }, { name: null }, { description: 'x'.repeat(2001) }])(
    'rejects invalid update %j', async (body) => {
      expect((await request(`/projects/${projectId}`, 'PATCH', body)).status).toBe(400);
    }
  );

  it('allows clearing description without changing name', async () => {
    tables.projects[0].description = 'Previous';
    const res = await request(`/projects/${projectId}`, 'PATCH', { description: null });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { name: 'Project', description: null } });
  });

  it('allows org owner deletion', async () => {
    expect((await request(`/projects/${projectId}`, 'DELETE')).status).toBe(200);
    expect(tables.projects).toEqual([]);
  });

  it.each(['admin', 'member'])('denies project deletion by org %s even if project owner', async (role) => {
    tables.org_members[0].role = role;
    tables.project_members[0].role = 'owner';
    expect((await request(`/projects/${projectId}`, 'DELETE')).status).toBe(403);
  });

  it.each(['GET', 'PATCH', 'DELETE'])('hides projects under the wrong tenant for %s', async (method) => {
    tables.projects[0].org_id = otherOrgId;
    tables.org_members.push({ org_id: otherOrgId, user_id: userId, role: 'owner' });
    expect((await request(`/projects/${projectId}`, method, method === 'PATCH' ? { name: 'Wrong' } : undefined)).status).toBe(404);
  });

  it('rejects malformed project ids', async () => {
    expect((await request('/projects/no-uuid')).status).toBe(400);
  });

  it('hides revoked memberships', async () => {
    tables.org_members = [];
    expect((await request(`/projects/${projectId}`)).status).toBe(404);
    expect((await request()).status).toBe(404);
  });

  it('returns internal error for invalid project rows', async () => {
    tables.projects[0].name = 42;
    expect((await request()).status).toBe(500);
  });

  it('returns internal error for database failures', async () => {
    failure = 'projects';
    expect((await request()).status).toBe(500);
  });
});

describe('M3 subscription usage API', () => {
  it.each(['owner', 'admin'])('allows %s to read organisation-wide usage', async (role) => {
    tables.org_members[0].role = role;
    tables.projects.push(makeProject(secondId));
    const res = await request('/subscription');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { tier: 'free', maxProjects: 2, projectsUsed: 2, projectsRemaining: 0 }, requestId: 'm3-test' });
  });

  it('does not disclose subscription usage to ordinary org members', async () => {
    tables.org_members[0].role = 'member';
    expect((await request('/subscription')).status).toBe(403);
  });

  it('represents unlimited Enterprise with null remaining', async () => {
    tables.subscriptions[0] = { org_id: orgId, tier: 'enterprise', max_projects: null };
    expect(await (await request('/subscription')).json()).toMatchObject({ data: { maxProjects: null, projectsRemaining: null } });
  });

  it('clamps remaining capacity to zero after a downgrade', async () => {
    tables.projects.push(makeProject(secondId), makeProject('30000000-0000-4000-8000-000000000003'));
    expect(await (await request('/subscription')).json()).toMatchObject({ data: { projectsUsed: 3, projectsRemaining: 0 } });
  });

  it('fails closed for a missing subscription', async () => {
    tables.subscriptions = [];
    expect((await request('/subscription')).status).toBe(500);
  });

  it('returns internal error for subscription database failures', async () => {
    failure = 'subscriptions';
    expect((await request('/subscription')).status).toBe(500);
  });
});
