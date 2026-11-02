import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

const mocks = vi.hoisted(() => ({ getSupabaseAdmin: vi.fn(), getSupabaseClient: vi.fn(),
  createTemplate: vi.fn(), listTemplates: vi.fn(), getTemplate: vi.fn(), updateTemplate: vi.fn(), deleteTemplate: vi.fn(),
  createTemplateVersion: vi.fn(), listTemplateVersions: vi.fn(), getTemplateVersion: vi.fn(),
  updateTemplateVersion: vi.fn(), deleteTemplateVersion: vi.fn(), publishTemplateVersion: vi.fn() }));
vi.mock('../src/db/index.js', () => mocks);
vi.mock('../src/services/templates.js', () => mocks);
vi.mock('../src/services/templateVersions.js', () => mocks);
const uid = '10000000-0000-4000-8000-000000000001';
const orgId = '20000000-0000-4000-8000-000000000001';
const projectId = '30000000-0000-4000-8000-000000000001';
const templateId = '50000000-0000-4000-8000-000000000001';
const versionId = '60000000-0000-4000-8000-000000000001';
const base = `/api/v1/organisations/${orgId}/projects/${projectId}/templates`;
const item = `/${templateId}`, versions = `${item}/versions`, version = `${versions}/${versionId}`;
const schema = { fields: [{ key: 'serial', label: 'Serial', type: 'text' }] };
const row = { id: templateId, projectId, name: 'Template', description: null, currentVersionId: null,
  createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z' };
const versionRow = { id: versionId, projectId, templateId, version: 1, schema, publishedAt: null, createdAt: row.createdAt };
let orgRole: string, projectRole: string | null, membership: boolean, projectOrg: string;
function query(table: string) {
  const filters: Record<string, unknown> = {};
  const builder = { select: (_v: string) => builder, eq: (k: string, v: unknown) => { filters[k] = v; return builder; },
    maybeSingle: async () => {
      let data: Record<string, unknown> | null = null;
      if (table === 'org_members' && membership && filters.org_id === orgId && filters.user_id === uid) data = { org_id: orgId, role: orgRole };
      if (table === 'projects' && filters.id === projectId) data = { id: projectId, org_id: projectOrg };
      if (table === 'project_members' && projectRole && filters.project_id === projectId && filters.user_id === uid) data = { role: projectRole };
      return { data, error: null };
    } };
  return builder;
}
beforeEach(() => {
  vi.resetAllMocks();
  orgRole = 'owner'; projectRole = 'viewer'; membership = true; projectOrg = orgId;
  mocks.getSupabaseClient.mockReturnValue({ from: query });
  mocks.getSupabaseAdmin.mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: uid } }, error: null }) } });
  for (const fn of [mocks.createTemplate, mocks.getTemplate, mocks.updateTemplate]) fn.mockResolvedValue(row);
  for (const fn of [mocks.createTemplateVersion, mocks.getTemplateVersion, mocks.updateTemplateVersion, mocks.publishTemplateVersion]) fn.mockResolvedValue(versionRow);
  mocks.deleteTemplate.mockResolvedValue({ id: templateId }); mocks.deleteTemplateVersion.mockResolvedValue({ id: versionId });
  mocks.listTemplates.mockResolvedValue({ data: [row], pagination: { hasMore: false, cursor: null } });
  mocks.listTemplateVersions.mockResolvedValue({ data: [versionRow], pagination: { hasMore: false, cursor: null } });
});
function request(suffix = '', method = 'GET', body?: unknown, auth = true) {
  return createApp().request(base + suffix, { method, headers: { ...(auth ? { Authorization: 'Bearer caller' } : {}),
    'Content-Type': 'application/json', 'X-Request-Id': 'm6-test' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const writes = [
  ['', 'POST', { name: 'Template' }], [item, 'PATCH', { description: null }], [item, 'DELETE', undefined],
  [versions, 'POST', { schema }], [version, 'PATCH', { schema }], [version, 'DELETE', undefined],
  [`${version}/publish`, 'POST', undefined],
] as const;
describe('Template lifecycle HTTP contract', () => {
  it('requires authentication', async () => expect((await request('', 'GET', undefined, false)).status).toBe(401));
  it.each(['owner', 'admin'])('permits inherited org %s writes', async (role) => {
    orgRole = role;
    for (const [suffix, method, body] of writes) expect((await request(suffix, method, body)).status).toBe(method === 'POST' && !suffix.endsWith('/publish') ? 201 : 200);
  });
  it.each(['owner', 'admin'])('permits explicit project %s writes', async (role) => {
    orgRole = 'member'; projectRole = role;
    for (const [suffix, method, body] of writes) expect((await request(suffix, method, body)).status).toBe(method === 'POST' && !suffix.endsWith('/publish') ? 201 : 200);
  });
  it.each(['editor', 'viewer'])('permits %s reads and blocks every write', async (role) => {
    orgRole = 'member'; projectRole = role;
    for (const suffix of ['', item, versions, version]) expect((await request(suffix)).status).toBe(200);
    for (const [suffix, method, body] of writes) expect((await request(suffix, method, body)).status).toBe(403);
  });
  it('normalizes metadata and field defaults with explicit caller scope', async () => {
    const res = await request('', 'POST', { name: ' Template ' });
    expect(await res.json()).toEqual({ data: row, requestId: 'm6-test' });
    expect(mocks.createTemplate).toHaveBeenCalledWith(projectId, { name: 'Template', description: null }, 'caller');
    await request(versions, 'POST', { schema });
    expect(mocks.createTemplateVersion).toHaveBeenCalledWith(projectId, templateId, { schema: { fields: [{ key: 'serial', label: 'Serial', type: 'text', required: false }] } }, 'caller');
  });
  it('returns list and publication envelopes', async () => {
    expect(await (await request()).json()).toEqual({ data: [row], pagination: { hasMore: false, cursor: null }, requestId: 'm6-test' });
    expect(await (await request(`${version}/publish`, 'POST')).json()).toEqual({ data: versionRow, requestId: 'm6-test' });
  });
  it.each([{}, { name: ' ' }, { name: 'X', projectId }, { name: 'X', currentVersionId: versionId }, { name: 'X', description: 4 }])('rejects invalid create %j', async (body) => {
    expect((await request('', 'POST', body)).status).toBe(400);
  });
  it.each([{}, { name: '' }, { createdAt: 'now' }])('rejects invalid metadata patch %j', async (body) => {
    expect((await request(item, 'PATCH', body)).status).toBe(400);
  });
  it.each([{}, { schema: {} }, { schema, version: 2 }, { schema, publishedAt: '2026-11-02T00:00:00Z' }])('rejects invalid version input %j', async (body) => {
    expect((await request(versions, 'POST', body)).status).toBe(400);
    expect((await request(version, 'PATCH', body)).status).toBe(400);
  });
  it('rejects publication bodies rather than accepting forged timestamps', async () => {
    expect((await request(`${version}/publish`, 'POST', { publishedAt: 'now' })).status).toBe(400);
  });
  it.each(['/bad', `/${templateId}/versions/bad`, `/bad/versions`])('rejects bad IDs %s', async (suffix) => {
    expect((await request(suffix)).status).toBe(400);
  });
  it.each(['limit=0', 'limit=101', 'cursor=bad', 'extra=yes'])('rejects invalid queries %s', async (q) => {
    expect((await request(`?${q}`)).status).toBe(400);
    expect((await request(`${versions}?${q}`)).status).toBe(400);
  });
  it('rejects a valid cursor bound to a different project', async () => {
    const cursor = Buffer.from(JSON.stringify({ kind: 'templates', projectId: uid, createdAt: row.createdAt, id: templateId })).toString('base64url');
    expect((await request(`?cursor=${cursor}`)).status).toBe(400);
    expect(mocks.listTemplates).not.toHaveBeenCalled();
  });
  it.each(['revoked', 'wrong-org', 'no-project-role'])('denies all endpoints for %s', async (condition) => {
    orgRole = 'member';
    if (condition === 'revoked') membership = false;
    if (condition === 'wrong-org') projectOrg = uid;
    if (condition === 'no-project-role') projectRole = null;
    for (const suffix of ['', item, versions, version]) expect((await request(suffix)).status).toBe(404);
    for (const [suffix, method, body] of writes) expect((await request(suffix, method, body)).status).toBe(404);
  });
  it('preserves conflict errors and hides internal details', async () => {
    mocks.publishTemplateVersion.mockRejectedValue(Object.assign(new Error('Version already published'), { status: 409, code: 'TEMPLATE_VERSION_PUBLISHED' }));
    expect(await (await request(`${version}/publish`, 'POST')).json()).toEqual({ error: 'Version already published', code: 'TEMPLATE_VERSION_PUBLISHED', requestId: 'm6-test' });
    mocks.getTemplate.mockRejectedValue(new Error('secret database detail'));
    expect(await (await request(item)).json()).toEqual({ error: 'Internal server error', code: 'INTERNAL_ERROR', requestId: 'm6-test' });
  });
});
