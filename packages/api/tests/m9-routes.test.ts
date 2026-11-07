import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(), getSupabaseClient: vi.fn(), getDashboard: vi.fn(), listAuditEvents: vi.fn(),
  reserveAttachment: vi.fn(), listAttachments: vi.fn(), downloadAttachment: vi.fn(), deleteAttachment: vi.fn(),
}));
vi.mock('../src/db/index.js', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin, getSupabaseClient: mocks.getSupabaseClient }));
vi.mock('../src/services/observability.js', async (original) => ({ ...await original<object>(), getDashboard: mocks.getDashboard, listAuditEvents: mocks.listAuditEvents }));
vi.mock('../src/services/attachments.js', async (original) => ({ ...await original<object>(), reserveAttachment: mocks.reserveAttachment,
  listAttachments: mocks.listAttachments, downloadAttachment: mocks.downloadAttachment, deleteAttachment: mocks.deleteAttachment }));
const uid = '10000000-0000-4000-8000-000000000001';
const org = '20000000-0000-4000-8000-000000000001';
const project = '30000000-0000-4000-8000-000000000001';
const item = '70000000-0000-4000-8000-000000000001';
const id = '80000000-0000-4000-8000-000000000001';
const base = `/api/v1/organisations/${org}/projects/${project}`;
const attachments = `/items/${item}/attachments`;
let role: string;
let member: boolean;
let projectOrg: string;
function query(table: string) {
  const filters: Record<string, unknown> = {};
  const builder = {
    select: () => builder,
    eq: (key: string, value: unknown) => { filters[key] = value; return builder; },
    maybeSingle: async () => ({ error: null, data: !member ? null :
      table === 'org_members' && filters.org_id === org ? { org_id: org, role: 'member' } :
      table === 'projects' && filters.id === project ? { id: project, org_id: projectOrg } :
      table === 'project_members' ? { role } : null }),
  };
  return builder;
}
const row = { id, project_id: project, item_id: item, filename: 'photo.png', created_by: uid, deleted: false, created_at: '2026-11-07T00:00:00Z' };
beforeEach(() => {
  vi.resetAllMocks(); role = 'owner'; member = true; projectOrg = org;
  mocks.getSupabaseClient.mockReturnValue({ from: query });
  mocks.getSupabaseAdmin.mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: uid } }, error: null }) } });
  mocks.getDashboard.mockResolvedValue({ items: 1, categories: 0, templates: 1, movements: 0, outOfStockItems: 1 });
  mocks.listAuditEvents.mockResolvedValue({ data: [], pagination: { cursor: null, hasMore: false } });
  mocks.reserveAttachment.mockResolvedValue({ ...row, bucket: 'inventory-attachments', path: `${project}/${item}/${id}` });
  mocks.listAttachments.mockResolvedValue({ data: [row], pagination: { cursor: null, hasMore: false } });
  mocks.downloadAttachment.mockResolvedValue({ signedUrl: 'https://example.com/signed' });
  mocks.deleteAttachment.mockResolvedValue({ id });
});
function request(path: string, method = 'GET', body?: unknown, auth = true) {
  return createApp().request(base + path, { method, headers: { ...(auth ? { Authorization: 'Bearer caller' } : {}),
    'Content-Type': 'application/json', 'X-Request-Id': 'm9-test' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
describe('M9 routes', () => {
  it.each(['/dashboard', '/audit', attachments, `${attachments}/${id}/download`])('requires JWT for %s', async (path) => {
    expect((await request(path, 'GET', undefined, false)).status).toBe(401);
  });
  it.each(['owner','admin','editor','viewer'])('allows %s dashboard and attachment reads', async (value) => {
    role = value;
    expect((await request('/dashboard')).status).toBe(200);
    expect((await request(attachments)).status).toBe(200);
    expect((await request(`${attachments}/${id}/download`)).status).toBe(200);
    expect(mocks.getDashboard).toHaveBeenCalledWith(project, 'caller');
    expect(mocks.listAttachments).toHaveBeenCalledWith(project, item, { limit: 20 }, 'caller');
  });
  it.each(['owner','admin','editor'])('allows %s reservations and deletion', async (value) => {
    role = value;
    expect((await request(attachments, 'POST', { filename: ' photo.png ' })).status).toBe(201);
    expect(mocks.reserveAttachment).toHaveBeenCalledWith(project, item, 'photo.png', 'caller');
    expect((await request(`${attachments}/${id}`, 'DELETE')).status).toBe(200);
  });
  it('denies viewer writes and editor/viewer audit reads', async () => {
    role = 'viewer';
    expect((await request(attachments, 'POST', { filename: 'photo.png' })).status).toBe(403);
    expect((await request(`${attachments}/${id}`, 'DELETE')).status).toBe(403);
    for (role of ['viewer','editor']) expect((await request('/audit')).status).toBe(403);
    expect(mocks.reserveAttachment).not.toHaveBeenCalled();
    expect(mocks.deleteAttachment).not.toHaveBeenCalled();
    expect(mocks.listAuditEvents).not.toHaveBeenCalled();
  });
  it.each(['owner','admin'])('allows %s audit reads with bounded pagination', async (value) => {
    role = value;
    expect((await request(`/audit?limit=2&cursor=${id}`)).status).toBe(200);
    expect(mocks.listAuditEvents).toHaveBeenCalledWith(project, { limit: 2, cursor: id }, 'caller');
  });
  it.each([{}, { filename: '../x' }, { filename: 'a\\b' }, { filename: '\u0000' }, { filename: 'x', projectId: project }])('rejects invalid reservation %j', async (body) => {
    expect((await request(attachments, 'POST', body)).status).toBe(400);
    expect(mocks.reserveAttachment).not.toHaveBeenCalled();
  });
  it.each(['/audit?limit=101', '/audit?cursor=bad', `${attachments}?limit=0`, '/items/bad/attachments', `${attachments}/bad/download`])('rejects invalid scope/query %s', async (path) => {
    expect((await request(path)).status).toBe(400);
  });
  it('denies revoked membership and mismatched organisation scope', async () => {
    member = false;
    expect((await request('/dashboard')).status).toBe(404);
    member = true; projectOrg = id;
    expect((await request(attachments)).status).toBe(404);
    expect(mocks.getDashboard).not.toHaveBeenCalled();
    expect(mocks.listAttachments).not.toHaveBeenCalled();
  });
  it('returns safe 500 envelopes for service failures and malformed successful results', async () => {
    mocks.getDashboard.mockRejectedValueOnce(new Error('secret database error'));
    const response = await request('/dashboard');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error', code: 'INTERNAL_ERROR', requestId: 'm9-test' });
    mocks.getDashboard.mockResolvedValueOnce({ items: -1 });
    expect((await request('/dashboard')).status).toBe(500);
  });
});
