import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTemplate, deleteTemplate, getTemplate, listTemplates, updateTemplate } from './templates.js';
import { createTemplateVersion, deleteTemplateVersion, getTemplateVersion, listTemplateVersions,
  publishTemplateVersion, updateTemplateVersion } from './templateVersions.js';
import { templateQuerySchema, versionQuerySchema } from './templateValidation.js';
const projectId = '30000000-0000-4000-8000-000000000001';
const templateId = '50000000-0000-4000-8000-000000000001';
const versionId = '60000000-0000-4000-8000-000000000001';
const secondId = '50000000-0000-4000-8000-000000000002';
const row = { id: templateId, project_id: projectId, name: 'Template', description: null, current_version_id: null,
  created_at: '2026-11-02T00:00:00.123456+00:00', updated_at: '2026-11-02T00:00:00Z' };
const schema = { fields: [] };
const version = { id: versionId, project_id: projectId, template_id: templateId, version: 1, schema,
  published_at: null, created_at: row.created_at };
let replies: { data?: unknown; code?: string }[];
let seen: { url: URL; headers: Headers; method: string; body: unknown }[];
beforeEach(() => {
  replies = []; seen = [];
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co'); vi.stubEnv('SUPABASE_ANON_KEY', 'anon-test');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    seen.push({ url: new URL(String(input)), headers, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const reply = replies.shift();
    if (!reply) throw new Error('Unexpected request');
    if (reply.code) return new Response(JSON.stringify({ code: reply.code, message: 'private detail' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const data = headers.get('Accept')?.includes('vnd.pgrst.object') && Array.isArray(reply.data) ? reply.data[0] ?? null : reply.data;
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('Template real-client transport', () => {
  it('reads metadata using inventory, caller JWT and explicit project/id scope', async () => {
    replies.push({ data: [row] });
    expect(await getTemplate(projectId, templateId, 'jwt')).toMatchObject({ id: templateId, projectId, currentVersionId: null });
    expect(seen[0].headers.get('Authorization')).toBe('Bearer jwt');
    expect(seen[0].headers.get('Accept-Profile')).toBe('inventory');
    expect(seen[0].url.searchParams.get('project_id')).toBe(`eq.${projectId}`);
    expect(seen[0].url.searchParams.get('id')).toBe(`eq.${templateId}`);
  });
  it('creates metadata with only editable fields', async () => {
    replies.push({ data: [row] });
    await createTemplate(projectId, { name: 'Template', description: null }, 'jwt');
    expect(seen[0].body).toEqual({ project_id: projectId, name: 'Template', description: null });
    expect(seen[0].headers.get('Content-Profile')).toBe('inventory');
  });
  it('patches only present metadata', async () => {
    replies.push({ data: [row] });
    await updateTemplate(projectId, templateId, { description: null }, 'jwt');
    expect(seen[0].body).toEqual({ description: null });
    expect(seen[0].url.searchParams.get('project_id')).toBe(`eq.${projectId}`);
  });
  it('deletes scoped metadata and validates the deletion result', async () => {
    replies.push({ data: [{ id: templateId }] });
    expect(await deleteTemplate(projectId, templateId, 'jwt')).toEqual({ id: templateId });
    expect(seen[0].method).toBe('DELETE');
    expect(seen[0].url.searchParams.get('project_id')).toBe(`eq.${projectId}`);
  });
  it('uses timestamp/UUID tuple pagination without losing microseconds', async () => {
    replies.push({ data: [row, { ...row, id: secondId }] });
    const first = await listTemplates(projectId, templateQuerySchema.parse({ limit: 1 }), 'jwt');
    expect(first.data).toHaveLength(1); expect(first.pagination.hasMore).toBe(true);
    const query = templateQuerySchema.parse({ limit: 1, cursor: first.pagination.cursor });
    replies.push({ data: [] });
    await listTemplates(projectId, query, 'jwt');
    expect(seen[1].url.searchParams.get('or')).toBe(`(created_at.gt.${row.created_at},and(created_at.eq.${row.created_at},id.gt.${templateId}))`);
    expect(seen[0].url.searchParams.get('order')).toBe('created_at.asc,id.asc');
    expect(seen[0].url.searchParams.get('limit')).toBe('2');
  });
  it('allocates versions via caller-scoped RPC', async () => {
    replies.push({ data: version });
    expect(await createTemplateVersion(projectId, templateId, { schema }, 'jwt')).toMatchObject({ projectId, templateId, version: 1 });
    expect(seen[0].url.pathname).toBe('/rest/v1/rpc/create_template_version');
    expect(seen[0].body).toEqual({ p_project_id: projectId, p_template_id: templateId, p_schema: schema });
    expect(seen[0].headers.get('Content-Profile')).toBe('inventory');
    expect(seen[0].headers.get('Authorization')).toBe('Bearer jwt');
  });
  it('publishes via atomic RPC with no client publication timestamp', async () => {
    replies.push({ data: { ...version, published_at: row.created_at } });
    expect(await publishTemplateVersion(projectId, templateId, versionId, 'jwt')).toMatchObject({ publishedAt: row.created_at });
    expect(seen[0].url.pathname).toBe('/rest/v1/rpc/publish_template_version');
    expect(seen[0].body).toEqual({ p_project_id: projectId, p_template_id: templateId, p_version_id: versionId });
  });
  it.each(['read', 'update', 'delete'])('binds %s version to project AND template AND version', async (op) => {
    replies.push({ data: op === 'delete' ? [{ id: versionId }] : [version] });
    if (op === 'read') await getTemplateVersion(projectId, templateId, versionId, 'jwt');
    if (op === 'update') await updateTemplateVersion(projectId, templateId, versionId, { schema }, 'jwt');
    if (op === 'delete') await deleteTemplateVersion(projectId, templateId, versionId, 'jwt');
    expect(seen[0].url.searchParams.get('project_id')).toBe(`eq.${projectId}`);
    expect(seen[0].url.searchParams.get('template_id')).toBe(`eq.${templateId}`);
    expect(seen[0].url.searchParams.get('id')).toBe(`eq.${versionId}`);
    if (op === 'update') expect(seen[0].body).toEqual({ schema });
  });
  it('lists versions only after resolving the scoped parent and paginates by number', async () => {
    replies.push({ data: [row] }, { data: [version, { ...version, version: 2 }] });
    const first = await listTemplateVersions(projectId, templateId, versionQuerySchema.parse({ limit: 1 }), 'jwt');
    expect(first.pagination.hasMore).toBe(true);
    replies.push({ data: [row] }, { data: [] });
    await listTemplateVersions(projectId, templateId, versionQuerySchema.parse({ cursor: first.pagination.cursor }), 'jwt');
    expect(seen[3].url.searchParams.get('version')).toBe('gt.1');
    expect(seen[3].url.searchParams.get('template_id')).toBe(`eq.${templateId}`);
  });
  it('returns 404 for absent parent before listing versions', async () => {
    replies.push({ data: [] });
    await expect(listTemplateVersions(projectId, templateId, versionQuerySchema.parse({}), 'jwt')).rejects.toMatchObject({ status: 404, code: 'TEMPLATE_NOT_FOUND' });
    expect(seen).toHaveLength(1);
  });
  it.each(['read', 'update', 'delete'])('returns scoped version 404 for %s', async (op) => {
    replies.push({ data: [] });
    const run = op === 'read' ? getTemplateVersion(projectId, templateId, versionId, 'jwt')
      : op === 'update' ? updateTemplateVersion(projectId, templateId, versionId, { schema }, 'jwt')
        : deleteTemplateVersion(projectId, templateId, versionId, 'jwt');
    await expect(run).rejects.toMatchObject({ status: 404, code: 'TEMPLATE_VERSION_NOT_FOUND' });
  });
  it.each([
    ['T0001', 404, 'TEMPLATE_NOT_FOUND'], ['T0002', 404, 'TEMPLATE_VERSION_NOT_FOUND'],
    ['T0003', 409, 'TEMPLATE_VERSION_PUBLISHED'], ['T0004', 400, 'INVALID_TEMPLATE_SCHEMA'],
    ['T0005', 409, 'TEMPLATE_VERSION_CONFLICT'], ['42501', 403, 'FORBIDDEN'],
  ] as const)('maps RPC error %s to a safe response', async (code, status, apiCode) => {
    replies.push({ code });
    await expect(publishTemplateVersion(projectId, templateId, versionId, 'jwt')).rejects.toMatchObject({ status, code: apiCode });
  });
  it('maps metadata retention and draft immutability errors', async () => {
    replies.push({ code: '23503' }, { code: '55000' });
    await expect(deleteTemplate(projectId, templateId, 'jwt')).rejects.toMatchObject({ status: 409, code: 'TEMPLATE_IN_USE' });
    await expect(deleteTemplateVersion(projectId, templateId, versionId, 'jwt')).rejects.toMatchObject({ status: 409, code: 'TEMPLATE_VERSION_PUBLISHED' });
  });
  it.each([null, {}, { ...row, id: 'bad' }])('rejects malformed metadata %j', async (data) => {
    replies.push({ data });
    await expect(createTemplate(projectId, { name: 'Template', description: null }, 'jwt')).rejects.toThrow();
  });
  it('rejects malformed versions, lists and deletion results', async () => {
    replies.push({ data: { ...version, version: '1' } }, { data: null }, { data: [{ id: 'bad' }] });
    await expect(createTemplateVersion(projectId, templateId, { schema }, 'jwt')).rejects.toThrow();
    await expect(listTemplates(projectId, templateQuerySchema.parse({}), 'jwt')).rejects.toThrow();
    await expect(deleteTemplateVersion(projectId, templateId, versionId, 'jwt')).rejects.toThrow();
  });
  it('hides unexpected database failures', async () => {
    replies.push({ code: 'XX000' });
    await expect(getTemplate(projectId, templateId, 'jwt')).rejects.toThrow('Failed to access template');
  });
});
