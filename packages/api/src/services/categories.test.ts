import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCategory, deleteCategory, getCategory, listCategories, updateCategory } from './categories.js';
import { categoryQuerySchema } from './categoryValidation.js';

const projectId = '30000000-0000-4000-8000-000000000001';
const otherProject = '30000000-0000-4000-8000-000000000002';
const id = '40000000-0000-4000-8000-000000000001';
const second = '40000000-0000-4000-8000-000000000002';
const parent = '40000000-0000-4000-8000-000000000003';
const row = { id, project_id: projectId, name: 'Category', parent_id: null, path: `/${id}/`, sort_order: -2,
  created_at: '2026-11-02T00:00:00+00:00', updated_at: '2026-11-02T00:00:00+00:00' };
type Reply = { data?: unknown; code?: string };
let replies: Reply[];
let seen: { url: URL; headers: Headers; method: string; body: unknown }[];

beforeEach(() => {
  replies = []; seen = [];
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon-test');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    seen.push({ url: new URL(String(input)), headers, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const reply = replies.shift();
    if (!reply) throw new Error('Unexpected database request');
    if (reply.code) return new Response(JSON.stringify({ code: reply.code, message: 'private database detail', details: null, hint: null }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const data = headers.get('Accept')?.includes('vnd.pgrst.object') && Array.isArray(reply.data)
      ? reply.data[0] ?? null : reply.data;
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Category service with real Supabase transport', () => {
  it('reads within inventory schema and project using the caller JWT', async () => {
    replies.push({ data: [row] });
    expect(await getCategory(projectId, id, 'caller-jwt')).toMatchObject({ id, projectId, sortOrder: -2, parentId: null });
    expect(seen[0].headers.get('Authorization')).toBe('Bearer caller-jwt');
    expect(seen[0].headers.get('Accept-Profile')).toBe('inventory');
    expect(seen[0].url.searchParams.get('project_id')).toBe(`eq.${projectId}`);
    expect(seen[0].url.searchParams.get('id')).toBe(`eq.${id}`);
  });

  it('creates with snake-case editable fields and no client path/identity', async () => {
    replies.push({ data: [row] });
    await createCategory(projectId, { name: 'Category', parentId: null, sortOrder: -2 }, 'caller-jwt');
    expect(seen[0].method).toBe('POST');
    expect(seen[0].headers.get('Content-Profile')).toBe('inventory');
    expect(seen[0].headers.get('Authorization')).toBe('Bearer caller-jwt');
    expect(seen[0].body).toEqual({ project_id: projectId, name: 'Category', parent_id: null, sort_order: -2 });
  });

  it('resolves parent through the current project before creating', async () => {
    replies.push({ data: [{ ...row, id: parent }] }, { data: [{ ...row, parent_id: parent }] });
    await createCategory(projectId, { name: 'Category', parentId: parent, sortOrder: 0 }, 'caller-jwt');
    expect(seen[0].url.searchParams.get('project_id')).toBe(`eq.${projectId}`);
    expect(seen[0].url.searchParams.get('id')).toBe(`eq.${parent}`);
    expect(seen[1].body).toMatchObject({ parent_id: parent });
  });

  it('hides a missing or cross-project parent before mutation', async () => {
    replies.push({ data: [] });
    await expect(createCategory(projectId, { name: 'Category', parentId: parent, sortOrder: 0 }, 'jwt')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe('GET');
  });

  it('patches only present fields and keeps project/id filters', async () => {
    replies.push({ data: [{ ...row, parent_id: null }] });
    await updateCategory(projectId, id, { parentId: null }, 'jwt');
    expect(seen[0].body).toEqual({ parent_id: null });
    expect(seen[0].url.searchParams.get('id')).toBe(`eq.${id}`);
    expect(seen[0].url.searchParams.get('project_id')).toBe(`eq.${projectId}`);
  });

  it('checks move parents and relies on DB paths in the response', async () => {
    replies.push({ data: [{ ...row, id: parent }] }, { data: [{ ...row, parent_id: parent, path: `/${parent}/${id}/` }] });
    expect(await updateCategory(projectId, id, { parentId: parent }, 'jwt')).toMatchObject({ parentId: parent, path: `/${parent}/${id}/` });
  });

  it('deletes only within the requested project', async () => {
    replies.push({ data: [{ id }] });
    expect(await deleteCategory(projectId, id, 'jwt')).toEqual({ id });
    expect(seen[0].method).toBe('DELETE');
    expect(seen[0].url.searchParams.get('project_id')).toBe(`eq.${projectId}`);
  });

  it.each(['read', 'update', 'delete'])('hides nonexistent or inaccessible categories for %s', async (operation) => {
    replies.push({ data: [] });
    const run = operation === 'read' ? getCategory(projectId, id, 'jwt')
      : operation === 'update' ? updateCategory(projectId, id, { name: 'New' }, 'jwt') : deleteCategory(projectId, id, 'jwt');
    await expect(run).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('paginates sort ties with a validated numeric/UUID tuple', async () => {
    replies.push({ data: [row, { ...row, id: second }] });
    const first = await listCategories(projectId, categoryQuerySchema.parse({ limit: '1' }), 'jwt');
    expect(first.data.map((category) => category.id)).toEqual([id]);
    expect(first.pagination.hasMore).toBe(true);
    expect(seen[0].url.searchParams.get('order')).toBe('sort_order.asc,id.asc');
    expect(seen[0].url.searchParams.get('limit')).toBe('2');
    replies.push({ data: [{ ...row, id: second }] });
    const next = await listCategories(projectId, categoryQuerySchema.parse({ limit: '1', cursor: first.pagination.cursor }), 'jwt');
    expect(next.data.map((category) => category.id)).toEqual([second]);
    expect(next.pagination).toEqual({ cursor: null, hasMore: false });
    expect(seen[1].url.searchParams.get('or')).toBe(`(sort_order.gt.-2,and(sort_order.eq.-2,id.gt.${id}))`);
  });

  it('filters roots with IS NULL and children with a scoped parent lookup', async () => {
    replies.push({ data: [] });
    await listCategories(projectId, categoryQuerySchema.parse({ parentId: 'root' }), 'jwt');
    expect(seen[0].url.searchParams.get('parent_id')).toBe('is.null');
    replies.push({ data: [{ ...row, id: parent }] }, { data: [] });
    await listCategories(projectId, categoryQuerySchema.parse({ parentId: parent }), 'jwt');
    expect(seen[2].url.searchParams.get('parent_id')).toBe(`eq.${parent}`);
  });

  it('rejects cursor reuse for another project or parent filter before querying', async () => {
    replies.push({ data: [row, { ...row, id: second }] });
    const first = await listCategories(projectId, categoryQuerySchema.parse({ limit: 1 }), 'jwt');
    const count = seen.length;
    await expect(listCategories(otherProject, categoryQuerySchema.parse({ cursor: first.pagination.cursor }), 'jwt')).rejects.toMatchObject({ status: 400 });
    await expect(listCategories(projectId, categoryQuerySchema.parse({ cursor: first.pagination.cursor, parentId: 'root' }), 'jwt')).rejects.toMatchObject({ status: 400 });
    expect(seen).toHaveLength(count);
  });

  it.each(['23001', '23503'])('maps delete retention %s to CATEGORY_IN_USE', async (code) => {
    replies.push({ code });
    await expect(deleteCategory(projectId, id, 'jwt')).rejects.toMatchObject({ status: 409, code: 'CATEGORY_IN_USE' });
  });

  it('maps a parent disappearing after preflight to 404', async () => {
    replies.push({ data: [{ ...row, id: parent }] }, { code: '23503' });
    await expect(updateCategory(projectId, id, { parentId: parent }, 'jwt')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('maps a hierarchy check conflict without depending on its private message', async () => {
    replies.push({ data: [{ ...row, id: parent }] }, { code: '23514' });
    await expect(updateCategory(projectId, id, { parentId: parent }, 'jwt')).rejects.toMatchObject({ status: 409, code: 'CATEGORY_CONFLICT' });
  });

  it.each(['read', 'create', 'update', 'delete', 'list'])('keeps unexpected %s database errors internal', async (operation) => {
    replies.push({ code: 'XX000' });
    const run = operation === 'read' ? getCategory(projectId, id, 'jwt') : operation === 'create'
      ? createCategory(projectId, { name: 'New', parentId: null, sortOrder: 0 }, 'jwt') : operation === 'update'
        ? updateCategory(projectId, id, { name: 'New' }, 'jwt') : operation === 'delete'
          ? deleteCategory(projectId, id, 'jwt') : listCategories(projectId, categoryQuerySchema.parse({}), 'jwt');
    await expect(run).rejects.toThrow('Failed');
  });

  it.each([{ ...row, sort_order: '0' }, { ...row, parent_id: 'bad' }, { ...row, name: 5 }])('rejects malformed DB rows', async (invalid) => {
    replies.push({ data: [invalid] });
    await expect(getCategory(projectId, id, 'jwt')).rejects.toThrow();
  });

  it.each(['id.gt.injected',
    JSON.stringify({ version: 1, parentId: null, sortOrder: '0),id.neq.x', id, projectId }),
    JSON.stringify({ version: 1, parentId: null, sortOrder: 0, id: `${id}),sort_order.gt.-1`, projectId }),
  ])('rejects cursor injection payloads', (payload) => {
    expect(() => categoryQuerySchema.parse({ cursor: Buffer.from(payload).toString('base64url') })).toThrow();
    expect(seen).toHaveLength(0);
  });

  it.each([{ unexpected: 'object' }, [{ ...row, sort_order: '0' }]])('rejects malformed list responses', async (data) => {
    replies.push({ data });
    await expect(listCategories(projectId, categoryQuerySchema.parse({}), 'jwt')).rejects.toThrow();
  });

  it('rejects a malformed delete response', async () => {
    replies.push({ data: [{ id: 'not-a-uuid' }] });
    await expect(deleteCategory(projectId, id, 'jwt')).rejects.toThrow();
  });
});
