import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(), getSupabaseClient: vi.fn(),
  createCategory: vi.fn(), listCategories: vi.fn(), getCategory: vi.fn(),
  updateCategory: vi.fn(), deleteCategory: vi.fn(),
}));
vi.mock('../src/db/index.js', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin, getSupabaseClient: mocks.getSupabaseClient }));
vi.mock('../src/services/categories.js', () => mocks);

const uid = '10000000-0000-4000-8000-000000000001';
const orgId = '20000000-0000-4000-8000-000000000001';
const projectId = '30000000-0000-4000-8000-000000000001';
const categoryId = '40000000-0000-4000-8000-000000000001';
const parentId = '40000000-0000-4000-8000-000000000002';
const base = `/api/v1/organisations/${orgId}/projects/${projectId}/categories`;
const category = { id: categoryId, projectId, name: 'Category', parentId: null, path: `/${categoryId}/`, sortOrder: 0,
  createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z' };
let orgRole: string;
let projectRole: string | null;
let membership: boolean;
let projectOrg: string;

function query(table: string) {
  const filters: Record<string, unknown> = {};
  const builder = {
    select: (_columns: string) => builder,
    eq: (key: string, value: unknown) => { filters[key] = value; return builder; },
    maybeSingle: async () => {
      let data: Record<string, unknown> | null = null;
      if (table === 'org_members' && membership && filters.org_id === orgId && filters.user_id === uid) data = { org_id: orgId, role: orgRole };
      if (table === 'projects' && filters.id === projectId) data = { id: projectId, org_id: projectOrg };
      if (table === 'project_members' && projectRole && filters.project_id === projectId && filters.user_id === uid) data = { role: projectRole };
      return { data, error: null };
    },
  };
  return builder;
}

beforeEach(() => {
  vi.resetAllMocks();
  orgRole = 'owner'; projectRole = 'viewer'; membership = true; projectOrg = orgId;
  mocks.getSupabaseClient.mockReturnValue({ from: query });
  mocks.getSupabaseAdmin.mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: uid } }, error: null }) } });
  mocks.createCategory.mockResolvedValue(category);
  mocks.getCategory.mockResolvedValue(category);
  mocks.updateCategory.mockResolvedValue({ ...category, name: 'Updated' });
  mocks.deleteCategory.mockResolvedValue({ id: categoryId });
  mocks.listCategories.mockResolvedValue({ data: [category], pagination: { cursor: null, hasMore: false } });
});

function request(suffix = '', method = 'GET', body?: unknown, auth = true) {
  return createApp().request(base + suffix, { method, headers: {
    ...(auth ? { Authorization: 'Bearer caller' } : {}), 'Content-Type': 'application/json', 'X-Request-Id': 'm5-test',
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

describe('Category routes', () => {
  it('requires authentication', async () => {
    expect((await request('', 'GET', undefined, false)).status).toBe(401);
  });

  it.each(['owner', 'admin'])('creates categories for inherited org %s with safe defaults', async (role) => {
    orgRole = role;
    const res = await request('', 'POST', { name: ' Category ' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: category, requestId: 'm5-test' });
    expect(mocks.createCategory).toHaveBeenCalledWith(projectId, { name: 'Category', parentId: null, sortOrder: 0 }, 'caller');
  });

  it.each(['owner', 'admin'])('allows explicit project %s to create/edit/delete', async (role) => {
    orgRole = 'member'; projectRole = role;
    expect((await request('', 'POST', { name: 'Category', parentId, sortOrder: -5 })).status).toBe(201);
    expect((await request(`/${categoryId}`, 'PATCH', { name: 'Updated' })).status).toBe(200);
    expect((await request(`/${categoryId}`, 'DELETE')).status).toBe(200);
  });

  it.each(['editor', 'viewer'])('permits %s reads and denies all writes', async (role) => {
    orgRole = 'member'; projectRole = role;
    expect((await request()).status).toBe(200);
    expect((await request(`/${categoryId}`)).status).toBe(200);
    for (const [suffix, method, body] of [['', 'POST', { name: 'Category' }], [`/${categoryId}`, 'PATCH', { name: 'New' }], [`/${categoryId}`, 'DELETE', undefined]] as const) {
      expect((await request(suffix, method, body)).status).toBe(403);
    }
    expect(mocks.createCategory).not.toHaveBeenCalled();
    expect(mocks.updateCategory).not.toHaveBeenCalled();
    expect(mocks.deleteCategory).not.toHaveBeenCalled();
  });

  it.each([{}, { name: '' }, { name: '   ' }, { name: 'x'.repeat(201) }, { name: 'OK', parentId: 'bad' },
    { name: 'OK', sortOrder: 1.5 }, { name: 'OK', sortOrder: 2147483648 }, { name: 'OK', sortOrder: -2147483649 },
    { name: 'OK', path: '/forged/' }, { name: 'OK', projectId }, { name: 'OK', id: categoryId }])(
    'rejects invalid create input %j', async (body) => {
      expect((await request('', 'POST', body)).status).toBe(400);
      expect(mocks.createCategory).not.toHaveBeenCalled();
    }
  );

  it.each([{}, { parentId: 'bad' }, { name: null }, { sortOrder: '1' }, { createdAt: 'yesterday' }, { path: '/forged/' }])(
    'rejects invalid patch %j', async (body) => {
      expect((await request(`/${categoryId}`, 'PATCH', body)).status).toBe(400);
      expect(mocks.updateCategory).not.toHaveBeenCalled();
    }
  );

  it('supports moving to root without resetting omitted settings', async () => {
    expect((await request(`/${categoryId}`, 'PATCH', { parentId: null })).status).toBe(200);
    expect(mocks.updateCategory).toHaveBeenCalledWith(projectId, categoryId, { parentId: null }, 'caller');
  });

  it('normalizes uppercase category UUIDs', async () => {
    const letterId = '40000000-0000-4000-8000-00000000000a';
    expect((await request(`/${letterId.toUpperCase()}`)).status).toBe(200);
    expect(mocks.getCategory).toHaveBeenCalledWith(projectId, letterId, 'caller');
  });

  it.each(['GET', 'PATCH', 'DELETE'])('rejects malformed category IDs for %s', async (method) => {
    expect((await request('/invalid', method, method === 'PATCH' ? { name: 'New' } : undefined)).status).toBe(400);
  });

  it.each(['limit=0', 'limit=101', 'limit=1.5', 'cursor=bad', 'cursor=', 'parentId=bad', 'unknown=true'])(
    'rejects invalid listing query %s', async (query) => {
      expect((await request(`?${query}`)).status).toBe(400);
      expect(mocks.listCategories).not.toHaveBeenCalled();
    }
  );

  it('passes root and parent filters to the list service', async () => {
    expect((await request('?parentId=root&limit=2')).status).toBe(200);
    expect(mocks.listCategories).toHaveBeenLastCalledWith(projectId, { parentId: 'root', limit: 2 }, 'caller');
    expect((await request(`?parentId=${parentId}`)).status).toBe(200);
    expect(mocks.listCategories).toHaveBeenLastCalledWith(projectId, { parentId, limit: 20 }, 'caller');
  });

  it('returns pagination and request ID', async () => {
    const res = await request();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [category], pagination: { cursor: null, hasMore: false }, requestId: 'm5-test' });
  });

  it('rejects cursor scope mismatches before calling the list service', async () => {
    for (const context of [{ projectId: '30000000-0000-4000-8000-000000000002', parentId: null },
      { projectId, parentId: 'root' }]) {
      const cursor = Buffer.from(JSON.stringify({ version: 1, ...context, sortOrder: 0, id: categoryId })).toString('base64url');
      expect((await request(`?cursor=${cursor}`)).status).toBe(400);
    }
    expect(mocks.listCategories).not.toHaveBeenCalled();
  });

  it('hides revoked org memberships and missing project memberships', async () => {
    membership = false;
    expect((await request()).status).toBe(404);
    membership = true; orgRole = 'member'; projectRole = null;
    expect((await request()).status).toBe(404);
    expect(mocks.listCategories).not.toHaveBeenCalled();
  });

  it('rejects a project nested under the wrong org', async () => {
    projectOrg = '20000000-0000-4000-8000-000000000002';
    expect((await request()).status).toBe(404);
    expect(mocks.listCategories).not.toHaveBeenCalled();
  });

  it('preserves documented category errors in the common envelope', async () => {
    mocks.deleteCategory.mockRejectedValue(Object.assign(new Error('Category is referenced'), { status: 409, code: 'CATEGORY_IN_USE' }));
    const res = await request(`/${categoryId}`, 'DELETE');
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'CATEGORY_IN_USE', requestId: 'm5-test' });
  });

  it('keeps unexpected downstream errors internal', async () => {
    mocks.createCategory.mockRejectedValue(new Error('private details'));
    const res = await request('', 'POST', { name: 'Category' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error', code: 'INTERNAL_ERROR', requestId: 'm5-test' });
  });
});
