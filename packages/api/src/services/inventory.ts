import { z } from 'zod';
import type { InventoryItem } from '@shared/types/entities.js';
import type { TemplateSchema } from '@shared/types/templates.js';
import { getSupabaseClient } from '../db/index.js';
import {
  assertItemCursorScope,
  encodeItemCursor,
  itemRowSchema,
  validateAttributes,
  type CreateItemInput,
  type ItemQuery,
  type UpdateItemInput,
} from './inventoryValidation.js';

function client(token: string) { return getSupabaseClient(token).schema('inventory'); }

function notFound(): never {
  throw Object.assign(new Error('Item not found'), { status: 404, code: 'NOT_FOUND' });
}

function mapItem(value: unknown): InventoryItem {
  const row = itemRowSchema.parse(value);
  return {
    id: row.id,
    projectId: row.project_id,
    templateVersionId: row.template_version_id,
    categoryId: row.category_id,
    name: row.name,
    sku: row.sku,
    attributes: row.attributes,
    quantity: row.quantity,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mutationError(error: { code: string; message: string } | null, deleting = false): void {
  if (!error) return;
  // FK violation — template version or category not found / not in same project
  if (error.code === '23503') {
    if (deleting) {
      throw Object.assign(new Error('Item has stock movements and cannot be deleted'), { status: 409, code: 'ITEM_IN_USE' });
    }
    throw Object.assign(new Error('Referenced template version or category not found in this project'), { status: 404, code: 'NOT_FOUND' });
  }
  // Check constraint or trigger rejection
  if (error.code === '23514') {
    throw Object.assign(new Error('Invalid item data'), { status: 400, code: 'VALIDATION_ERROR' });
  }
  // Restrict violation (stock_movements reference on delete)
  if (error.code === '23001') {
    throw Object.assign(new Error('Item has stock movements and cannot be deleted'), { status: 409, code: 'ITEM_IN_USE' });
  }
  // Immutability trigger (55000)
  if (error.code === '55000') {
    throw Object.assign(new Error(error.message || 'Immutable field cannot be changed'), { status: 400, code: 'VALIDATION_ERROR' });
  }
  throw new Error(`Item operation failed: ${error.message}`);
}

// ── Fetch template schema for attribute validation ──────────────────────────

async function getTemplateVersionSchema(
  projectId: string,
  templateVersionId: string,
  token: string,
): Promise<TemplateSchema> {
  const { data, error } = await client(token)
    .from('template_versions')
    .select('schema, published_at')
    .eq('project_id', projectId)
    .eq('id', templateVersionId)
    .maybeSingle();

  if (error || !data) {
    throw Object.assign(new Error('Template version not found in this project'), { status: 404, code: 'NOT_FOUND' });
  }

  if (!data.published_at) {
    throw Object.assign(new Error('Cannot create items against an unpublished template version'), { status: 400, code: 'VALIDATION_ERROR' });
  }

  // The schema is stored as TemplateSchema in the DB
  return data.schema as TemplateSchema;
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export async function getItem(
  projectId: string,
  itemId: string,
  token: string,
): Promise<InventoryItem> {
  const { data, error } = await client(token)
    .from('items')
    .select('*')
    .eq('project_id', projectId)
    .eq('id', itemId)
    .maybeSingle();
  if (error) throw new Error('Failed to fetch item');
  if (!data) notFound();
  return mapItem(data);
}

export async function createItem(
  projectId: string,
  input: CreateItemInput,
  token: string,
): Promise<InventoryItem> {
  // Validate attributes against published template version schema
  const schema = await getTemplateVersionSchema(projectId, input.templateVersionId, token);
  const validatedAttrs = validateAttributes(input.attributes, schema);

  const { data, error } = await client(token)
    .from('items')
    .insert({
      project_id: projectId,
      template_version_id: input.templateVersionId,
      category_id: input.categoryId,
      name: input.name,
      sku: input.sku,
      attributes: validatedAttrs,
    })
    .select('*')
    .single();
  mutationError(error);
  return mapItem(data);
}

export async function updateItem(
  projectId: string,
  itemId: string,
  input: UpdateItemInput,
  token: string,
): Promise<InventoryItem> {
  // If attributes are being updated, validate them against the item's template version
  if (input.attributes !== undefined) {
    const existingItem = await getItem(projectId, itemId, token);
    const schema = await getTemplateVersionSchema(projectId, existingItem.templateVersionId, token);

    // Merge existing attributes with partial update
    const merged = { ...existingItem.attributes, ...input.attributes };
    const validatedAttrs = validateAttributes(merged, schema);
    input = { ...input, attributes: validatedAttrs };
  }

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.sku !== undefined) patch.sku = input.sku;
  if (input.categoryId !== undefined) patch.category_id = input.categoryId;
  if (input.attributes !== undefined) patch.attributes = input.attributes;

  const { data, error } = await client(token)
    .from('items')
    .update(patch)
    .eq('project_id', projectId)
    .eq('id', itemId)
    .select('*')
    .maybeSingle();
  mutationError(error);
  if (!data) notFound();
  return mapItem(data);
}

export async function deleteItem(
  projectId: string,
  itemId: string,
  token: string,
): Promise<{ id: string }> {
  const { data, error } = await client(token)
    .from('items')
    .delete()
    .eq('project_id', projectId)
    .eq('id', itemId)
    .select('id')
    .maybeSingle();
  mutationError(error, true);
  if (!data) notFound();
  return z.object({ id: z.string().uuid() }).parse(data);
}

export async function listItems(
  projectId: string,
  query: ItemQuery,
  token: string,
) {
  assertItemCursorScope(projectId, query);

  let builder = client(token)
    .from('items')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(query.limit + 1);

  // Optional filters
  if (query.categoryId) {
    builder = builder.eq('category_id', query.categoryId);
  }
  if (query.templateId) {
    // Filter by template_id via template_versions join is complex with Supabase;
    // instead filter by template versions belonging to the template.
    // We'll use a subquery approach: get version IDs for this template, then filter.
    const { data: versions, error: vErr } = await client(token)
      .from('template_versions')
      .select('id')
      .eq('project_id', projectId)
      .eq('template_id', query.templateId);
    if (vErr) throw new Error('Failed to resolve template versions');
    const versionIds = (versions || []).map((v: { id: string }) => v.id);
    if (versionIds.length === 0) {
      // No versions — return empty
      return { data: [], pagination: { hasMore: false, cursor: null } };
    }
    builder = builder.in('template_version_id', versionIds);
  }
  if (query.search) {
    // ilike on name or sku
    builder = builder.or(`name.ilike.%${query.search}%,sku.ilike.%${query.search}%`);
  }

  // Cursor pagination (created_at DESC, id ASC)
  if (query.cursor) {
    const { createdAt, id } = query.cursor;
    builder = builder.or(
      `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.gt.${id})`
    );
  }

  const { data, error } = await builder;
  if (error) throw new Error('Failed to list items');
  const rows = z.array(itemRowSchema).parse(data);
  const hasMore = rows.length > query.limit;
  const page = rows.slice(0, query.limit);

  return {
    data: page.map(mapItem),
    pagination: {
      hasMore,
      cursor: hasMore ? encodeItemCursor(projectId, query, page[page.length - 1]) : null,
    },
  };
}
