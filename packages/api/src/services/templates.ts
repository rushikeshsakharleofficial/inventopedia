import { z } from 'zod';
import type { Template } from '@shared/types/entities.js';
import { getSupabaseClient } from '../db/index.js';
import { assertTemplateCursorScope, encodeTemplateCursor, templateRowSchema,
  type CreateTemplateInput, type TemplateQuery, type UpdateTemplateInput } from './templateValidation.js';

export function templateClient(token: string) { return getSupabaseClient(token).schema('inventory'); }
export function templateFailure(status: number, code: string, message: string): never {
  throw Object.assign(new Error(message), { status, code });
}
export function templateDbError(error: { code: string } | null, deleting = false): void {
  if (!error) return;
  switch (error.code) {
    case 'T0001': templateFailure(404, 'TEMPLATE_NOT_FOUND', 'Template not found');
    case 'T0002': templateFailure(404, 'TEMPLATE_VERSION_NOT_FOUND', 'Template version not found');
    case 'T0003': case '55000': templateFailure(409, 'TEMPLATE_VERSION_PUBLISHED', 'Published versions are immutable');
    case 'T0004': templateFailure(400, 'INVALID_TEMPLATE_SCHEMA', 'Invalid template schema');
    case 'T0005': case '23505': templateFailure(409, 'TEMPLATE_VERSION_CONFLICT', 'Template version conflicts with this change');
    case '42501': templateFailure(403, 'FORBIDDEN', 'Insufficient project role');
    case '23503': case '23001':
      if (deleting) templateFailure(409, 'TEMPLATE_IN_USE', 'Template has retained versions or references');
  }
  throw new Error('Failed to access template');
}
function mapTemplate(value: unknown): Template {
  const row = templateRowSchema.parse(value);
  return { id: row.id, projectId: row.project_id, name: row.name, description: row.description,
    currentVersionId: row.current_version_id, createdAt: row.created_at, updatedAt: row.updated_at };
}
export async function getTemplate(projectId: string, templateId: string, token: string): Promise<Template> {
  const { data, error } = await templateClient(token).from('templates').select('*')
    .eq('project_id', projectId).eq('id', templateId).maybeSingle();
  templateDbError(error);
  if (!data) templateFailure(404, 'TEMPLATE_NOT_FOUND', 'Template not found');
  return mapTemplate(data);
}
export async function createTemplate(projectId: string, input: CreateTemplateInput, token: string): Promise<Template> {
  const { data, error } = await templateClient(token).from('templates')
    .insert({ project_id: projectId, name: input.name, description: input.description }).select('*').single();
  templateDbError(error);
  return mapTemplate(data);
}
export async function updateTemplate(projectId: string, templateId: string, input: UpdateTemplateInput, token: string): Promise<Template> {
  const { data, error } = await templateClient(token).from('templates').update(input)
    .eq('project_id', projectId).eq('id', templateId).select('*').maybeSingle();
  templateDbError(error);
  if (!data) templateFailure(404, 'TEMPLATE_NOT_FOUND', 'Template not found');
  return mapTemplate(data);
}
export async function deleteTemplate(projectId: string, templateId: string, token: string): Promise<{ id: string }> {
  const { data, error } = await templateClient(token).from('templates').delete()
    .eq('project_id', projectId).eq('id', templateId).select('id').maybeSingle();
  templateDbError(error, true);
  if (!data) templateFailure(404, 'TEMPLATE_NOT_FOUND', 'Template not found');
  return z.object({ id: z.string().uuid() }).parse(data);
}
export async function listTemplates(projectId: string, query: TemplateQuery, token: string) {
  assertTemplateCursorScope(projectId, query);
  let builder = templateClient(token).from('templates').select('*').eq('project_id', projectId)
    .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(query.limit + 1);
  if (query.cursor) {
    const { createdAt, id } = query.cursor;
    builder = builder.or(`created_at.gt.${createdAt},and(created_at.eq.${createdAt},id.gt.${id})`);
  }
  const { data, error } = await builder;
  templateDbError(error);
  const rows = z.array(templateRowSchema).parse(data), page = rows.slice(0, query.limit);
  const hasMore = rows.length > query.limit, last = page[page.length - 1];
  return { data: page.map(mapTemplate), pagination: { hasMore, cursor: hasMore
    ? encodeTemplateCursor({ kind: 'templates', projectId, createdAt: last.created_at, id: last.id }) : null } };
}
