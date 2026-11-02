import { z } from 'zod';
import type { Category } from '@shared/types/entities.js';
import { getSupabaseClient } from '../db/index.js';
import { assertCategoryCursorScope, categoryRowSchema, encodeCategoryCursor,
  type CategoryQuery, type CreateCategoryInput, type UpdateCategoryInput } from './categoryValidation.js';

function client(token: string) { return getSupabaseClient(token).schema('inventory'); }

function notFound(): never {
  throw Object.assign(new Error('Category or parent not found'), { status: 404, code: 'NOT_FOUND' });
}

function mapCategory(value: unknown): Category {
  const row = categoryRowSchema.parse(value);
  return { id: row.id, projectId: row.project_id, name: row.name, parentId: row.parent_id,
    path: row.path, sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mutationError(error: { code: string } | null, deleting = false): void {
  if (!error) return;
  if (deleting && (error.code === '23001' || error.code === '23503')) {
    throw Object.assign(new Error('Category has children or referenced items'), { status: 409, code: 'CATEGORY_IN_USE' });
  }
  if (error.code === '23503') notFound();
  if (error.code === '23514') {
    throw Object.assign(new Error('Category hierarchy conflicts with this change'), { status: 409, code: 'CATEGORY_CONFLICT' });
  }
  throw new Error('Failed to change category');
}

export async function getCategory(projectId: string, categoryId: string, token: string): Promise<Category> {
  const { data, error } = await client(token).from('categories').select('*')
    .eq('project_id', projectId).eq('id', categoryId).maybeSingle();
  if (error) throw new Error('Failed to fetch category');
  if (!data) notFound();
  return mapCategory(data);
}

export async function createCategory(projectId: string, input: CreateCategoryInput, token: string): Promise<Category> {
  if (input.parentId) await getCategory(projectId, input.parentId, token);
  const { data, error } = await client(token).from('categories').insert({
    project_id: projectId, name: input.name, parent_id: input.parentId, sort_order: input.sortOrder,
  }).select('*').single();
  mutationError(error);
  return mapCategory(data);
}

export async function updateCategory(
  projectId: string, categoryId: string, input: UpdateCategoryInput, token: string
): Promise<Category> {
  if (input.parentId) await getCategory(projectId, input.parentId, token);
  const patch = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.parentId !== undefined ? { parent_id: input.parentId } : {}),
    ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
  };
  const { data, error } = await client(token).from('categories').update(patch)
    .eq('project_id', projectId).eq('id', categoryId).select('*').maybeSingle();
  mutationError(error);
  if (!data) notFound();
  return mapCategory(data);
}

export async function deleteCategory(projectId: string, categoryId: string, token: string): Promise<{ id: string }> {
  const { data, error } = await client(token).from('categories').delete()
    .eq('project_id', projectId).eq('id', categoryId).select('id').maybeSingle();
  mutationError(error, true);
  if (!data) notFound();
  return z.object({ id: z.string().uuid() }).parse(data);
}

export async function listCategories(projectId: string, query: CategoryQuery, token: string) {
  assertCategoryCursorScope(projectId, query);
  if (query.parentId && query.parentId !== 'root') await getCategory(projectId, query.parentId, token);
  let builder = client(token).from('categories').select('*').eq('project_id', projectId)
    .order('sort_order', { ascending: true }).order('id', { ascending: true }).limit(query.limit + 1);
  if (query.parentId === 'root') builder = builder.is('parent_id', null);
  else if (query.parentId) builder = builder.eq('parent_id', query.parentId);
  if (query.cursor) {
    const { sortOrder, id } = query.cursor;
    builder = builder.or(`sort_order.gt.${sortOrder},and(sort_order.eq.${sortOrder},id.gt.${id})`);
  }
  const { data, error } = await builder;
  if (error) throw new Error('Failed to list categories');
  const rows = z.array(categoryRowSchema).parse(data);
  const hasMore = rows.length > query.limit;
  const page = rows.slice(0, query.limit);
  return { data: page.map(mapCategory), pagination: { hasMore,
    cursor: hasMore ? encodeCategoryCursor(projectId, query, page[page.length - 1]) : null } };
}
