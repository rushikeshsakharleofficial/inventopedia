import { z } from 'zod';
import type { TemplateVersion } from '@shared/types/entities.js';
import { getTemplate, templateClient, templateDbError, templateFailure } from './templates.js';
import { assertTemplateCursorScope, encodeTemplateCursor, versionRowSchema,
  type VersionInput, type VersionQuery } from './templateValidation.js';

function mapVersion(value: unknown): TemplateVersion {
  const row = versionRowSchema.parse(value);
  return { id: row.id, projectId: row.project_id, templateId: row.template_id, version: row.version,
    schema: row.schema, publishedAt: row.published_at, createdAt: row.created_at };
}
function missing(): never { return templateFailure(404, 'TEMPLATE_VERSION_NOT_FOUND', 'Template version not found'); }
export async function createTemplateVersion(projectId: string, templateId: string, input: VersionInput, token: string): Promise<TemplateVersion> {
  const { data, error } = await templateClient(token).rpc('create_template_version', {
    p_project_id: projectId, p_template_id: templateId, p_schema: input.schema,
  }).single();
  templateDbError(error);
  return mapVersion(data);
}
export async function publishTemplateVersion(projectId: string, templateId: string, versionId: string, token: string): Promise<TemplateVersion> {
  const { data, error } = await templateClient(token).rpc('publish_template_version', {
    p_project_id: projectId, p_template_id: templateId, p_version_id: versionId,
  }).single();
  templateDbError(error);
  return mapVersion(data);
}
export async function getTemplateVersion(projectId: string, templateId: string, versionId: string, token: string): Promise<TemplateVersion> {
  const { data, error } = await templateClient(token).from('template_versions').select('*')
    .eq('project_id', projectId).eq('template_id', templateId).eq('id', versionId).maybeSingle();
  templateDbError(error);
  if (!data) missing();
  return mapVersion(data);
}
export async function updateTemplateVersion(projectId: string, templateId: string, versionId: string, input: VersionInput, token: string): Promise<TemplateVersion> {
  const { data, error } = await templateClient(token).from('template_versions').update({ schema: input.schema })
    .eq('project_id', projectId).eq('template_id', templateId).eq('id', versionId).select('*').maybeSingle();
  templateDbError(error);
  if (!data) missing();
  return mapVersion(data);
}
export async function deleteTemplateVersion(projectId: string, templateId: string, versionId: string, token: string): Promise<{ id: string }> {
  const { data, error } = await templateClient(token).from('template_versions').delete()
    .eq('project_id', projectId).eq('template_id', templateId).eq('id', versionId).select('id').maybeSingle();
  templateDbError(error, true);
  if (!data) missing();
  return z.object({ id: z.string().uuid() }).parse(data);
}
export async function listTemplateVersions(projectId: string, templateId: string, query: VersionQuery, token: string) {
  assertTemplateCursorScope(projectId, query, templateId);
  await getTemplate(projectId, templateId, token);
  let builder = templateClient(token).from('template_versions').select('*').eq('project_id', projectId)
    .eq('template_id', templateId).order('version', { ascending: true }).limit(query.limit + 1);
  if (query.cursor) builder = builder.gt('version', query.cursor.version);
  const { data, error } = await builder;
  templateDbError(error);
  const rows = z.array(versionRowSchema).parse(data), page = rows.slice(0, query.limit);
  const hasMore = rows.length > query.limit;
  return { data: page.map(mapVersion), pagination: { hasMore, cursor: hasMore
    ? encodeTemplateCursor({ kind: 'versions', projectId, templateId, version: page[page.length - 1].version }) : null } };
}
