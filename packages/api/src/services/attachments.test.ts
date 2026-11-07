import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteAttachment, downloadAttachment, listAttachments, reserveAttachment } from './attachments.js';
import { getDashboard, listAuditEvents } from './observability.js';
import { recordStockMovement } from './stock.js';

const project = '30000000-0000-4000-8000-000000000001';
const item = '70000000-0000-4000-8000-000000000001';
const id = '80000000-0000-4000-8000-000000000001';
const uid = '10000000-0000-4000-8000-000000000001';
const time = '2026-11-07T00:00:00Z';
const row = { id, project_id: project, item_id: item, filename: 'photo.png', created_by: uid, deleted: false, created_at: time };
const itemRow = { id: item, project_id: project, template_version_id: id, category_id: null, name: 'Item', sku: null,
  attributes: {}, quantity: 0, created_at: time, updated_at: time };
let replies: { data?: unknown; status?: number }[];
let seen: { url: URL; headers: Headers; method: string; body: unknown }[];
beforeEach(() => {
  replies = []; seen = [];
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co'); vi.stubEnv('SUPABASE_ANON_KEY', 'anon-test');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    seen.push({ url: new URL(String(input)), headers, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const reply = replies.shift();
    if (!reply) throw new Error('Unexpected request');
    const data = headers.get('Accept')?.includes('vnd.pgrst.object') && Array.isArray(reply.data) ? reply.data[0] ?? null : reply.data;
    return new Response(data === undefined ? null : JSON.stringify(data), { status: reply.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('M9 real Supabase client transport', () => {
  it('reserves only after checking item scope and sends caller JWT', async () => {
    replies.push({ data: [itemRow] }, { data: [row] });
    const result = await reserveAttachment(project, item, 'photo.png', 'caller');
    expect(result.path).toBe(`${project}/${item}/${id}`);
    expect(seen[0].url.searchParams.get('project_id')).toBe(`eq.${project}`);
    expect(seen[1].headers.get('Content-Profile')).toBe('inventory');
    expect(seen[1].headers.get('Authorization')).toBe('Bearer caller');
    expect(seen[1].body).toMatchObject({ project_id: project, item_id: item, filename: 'photo.png' });
    expect(seen[1].body).not.toHaveProperty('created_by');
  });
  it('does not reserve against an invisible item', async () => {
    replies.push({ data: null });
    await expect(reserveAttachment(project, item, 'photo.png', 'caller')).rejects.toMatchObject({ status: 404 });
    expect(seen).toHaveLength(1);
  });
  it('bounds listing and filters project, item, tombstones and cursor', async () => {
    replies.push({ data: [itemRow] }, { data: [row, { ...row, id: uid }] });
    const page = await listAttachments(project, item, { limit: 1, cursor: uid }, 'caller');
    expect(page.pagination).toEqual({ cursor: id, hasMore: true });
    expect(Object.fromEntries(seen[1].url.searchParams)).toMatchObject({ project_id: `eq.${project}`, item_id: `eq.${item}`,
      deleted: 'eq.false', id: `gt.${uid}`, limit: '2', order: 'id.asc' });
  });
  it('signs forced-download URLs for 60 seconds using the caller JWT', async () => {
    replies.push({ data: row }, { data: { signedURL: '/object/sign/inventory-attachments/path?token=test' } });
    const result = await downloadAttachment(project, item, id, 'caller');
    expect(result.signedUrl).toContain('token=test');
    expect(seen[1].body).toEqual({ expiresIn: 60 });
    expect(seen[1].headers.get('Authorization')).toBe('Bearer caller');
    expect(seen[1].url.pathname).toContain(`${project}/${item}/${id}`);
    expect(result.signedUrl).toContain('download=photo.png');
  });
  it('never signs tombstoned metadata', async () => {
    replies.push({ data: { ...row, deleted: true } });
    await expect(downloadAttachment(project, item, id, 'caller')).rejects.toMatchObject({ status: 404 });
    expect(seen).toHaveLength(1);
  });
  it('tombstones before storage cleanup, retaining retry metadata', async () => {
    replies.push({ data: row }, { status: 204 }, { data: [] });
    expect(await deleteAttachment(project, item, id, 'caller')).toEqual({ id });
    expect(seen[1].method).toBe('PATCH'); expect(seen[1].body).toEqual({ deleted: true });
    expect(seen[2].method).toBe('DELETE');
    expect(seen[2].body).toEqual({ prefixes: [`${project}/${item}/${id}`] });
  });
  it('does not remove an object when tombstoning fails', async () => {
    replies.push({ data: row }, { status: 403, data: { message: 'private' } });
    await expect(deleteAttachment(project, item, id, 'caller')).rejects.toThrow('Attachment deletion failed');
    expect(seen).toHaveLength(2);
  });
  it('queries dashboard via public RPC with explicit project', async () => {
    replies.push({ data: { items: 0, templates: 0, categories: 0, movements: 0, outOfStockItems: 0 } });
    await getDashboard(project, 'caller');
    expect(seen[0].headers.get('Content-Profile')).toBe('public');
    expect(seen[0].body).toEqual({ p_project_id: project });
  });
  it('scopes audit pagination using caller JWT and inventory schema', async () => {
    replies.push({ data: [] });
    expect(await listAuditEvents(project, { limit: 2, cursor: id }, 'caller')).toEqual({ data: [], pagination: { cursor: null, hasMore: false } });
    expect(seen[0].headers.get('Accept-Profile')).toBe('inventory');
    expect(Object.fromEntries(seen[0].url.searchParams)).toMatchObject({ project_id: `eq.${project}`, id: `gt.${id}`, limit: '3' });
  });
  it('calls stock RPC in inventory schema rather than control', async () => {
    replies.push({ data: { ...row, type: 'receive', quantity: 2, reason: null, reference_id: null, resulting_quantity: 2 } });
    await recordStockMovement(project, { itemId: item, type: 'receive', quantity: 2, reason: null, referenceId: null }, uid, 'caller');
    expect(seen[0].headers.get('Content-Profile')).toBe('inventory');
    expect(seen[0].body).toMatchObject({ p_project_id: project, p_created_by: uid });
  });
});
