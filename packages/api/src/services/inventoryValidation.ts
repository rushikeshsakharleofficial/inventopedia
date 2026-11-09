import { z } from 'zod';
import type { TemplateSchema, TemplateField } from '@shared/types/templates.js';

// ── ID / pagination primitives ──────────────────────────────────────────────

export const itemIdSchema = z.string().guid().transform((v) => v.toLowerCase());
const time = z.string().datetime({ offset: true });
const limit = z.coerce.number().int().min(1).max(100).default(20);

// ── Create / Update input schemas ───────────────────────────────────────────

export const createItemSchema = z.object({
  templateVersionId: z.string().guid(),
  categoryId: z.string().guid().nullable().default(null),
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().max(200).nullable().default(null),
  attributes: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const updateItemSchema = z.object({
  categoryId: z.string().guid().nullable().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  sku: z.string().trim().max(200).nullable().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
}).strict().refine(
  (v) => Object.values(v).some((x) => x !== undefined),
  'At least one field required'
);

// ── List query / cursor schemas ─────────────────────────────────────────────

const itemCursor = z.object({
  kind: z.literal('items'),
  projectId: itemIdSchema,
  createdAt: time,
  id: itemIdSchema,
  // scoping filters encoded in cursor to prevent cross-scope replay
  categoryId: z.string().guid().nullable().optional(),
  templateId: z.string().guid().nullable().optional(),
  search: z.string().max(200).nullable().optional(),
}).strict();

export const itemQuerySchema = z.object({
  limit,
  cursor: z.string().max(2048).regex(/^[A-Za-z0-9_-]+$/).transform((value, ctx): z.infer<typeof itemCursor> => {
    try {
      const decoded = Buffer.from(value, 'base64url').toString('utf8');
      if (Buffer.from(decoded).toString('base64url') !== value) throw new Error('Invalid encoding');
      return itemCursor.parse(JSON.parse(decoded));
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid cursor' });
      return z.NEVER;
    }
  }).optional(),
  categoryId: z.string().guid().optional(),
  templateId: z.string().guid().optional(),
  search: z.string().trim().max(200).optional(),
}).strict();

// ── Row schema (DB result validation) ───────────────────────────────────────

export const itemRowSchema = z.object({
  id: itemIdSchema,
  project_id: itemIdSchema,
  template_version_id: itemIdSchema,
  category_id: itemIdSchema.nullable(),
  name: z.string().min(1).max(200),
  sku: z.string().max(200).nullable(),
  attributes: z.record(z.string(), z.unknown()),
  quantity: z.coerce.number(),
  created_at: time,
  updated_at: time,
});

// ── Types ───────────────────────────────────────────────────────────────────

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type ItemQuery = z.infer<typeof itemQuerySchema>;

// ── Cursor scope assertion ──────────────────────────────────────────────────

export function assertItemCursorScope(
  projectId: string,
  query: ItemQuery,
): void {
  const c = query.cursor;
  if (!c) return;
  if (c.projectId !== projectId) {
    throw Object.assign(new Error('Cursor does not match project scope'), { status: 400, code: 'VALIDATION_ERROR' });
  }
  // Ensure filter context hasn't changed between pages
  if ((c.categoryId ?? null) !== (query.categoryId ?? null)) {
    throw Object.assign(new Error('Cursor category filter mismatch'), { status: 400, code: 'VALIDATION_ERROR' });
  }
  if ((c.templateId ?? null) !== (query.templateId ?? null)) {
    throw Object.assign(new Error('Cursor template filter mismatch'), { status: 400, code: 'VALIDATION_ERROR' });
  }
  if ((c.search ?? null) !== (query.search ?? null)) {
    throw Object.assign(new Error('Cursor search filter mismatch'), { status: 400, code: 'VALIDATION_ERROR' });
  }
}

export function encodeItemCursor(
  projectId: string,
  query: ItemQuery,
  row: z.infer<typeof itemRowSchema>,
): string {
  const payload: z.infer<typeof itemCursor> = {
    kind: 'items',
    projectId,
    createdAt: row.created_at,
    id: row.id,
    categoryId: query.categoryId ?? null,
    templateId: query.templateId ?? null,
    search: query.search ?? null,
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

// ── Attribute validation against template schema ────────────────────────────

/**
 * Validates item attributes against the published template version schema.
 * Returns the validated attributes object (with defaults/coercion applied).
 * Throws with status 400 if validation fails.
 */
export function validateAttributes(
  attributes: Record<string, unknown>,
  templateSchema: TemplateSchema,
): Record<string, unknown> {
  const errors: string[] = [];
  const validated: Record<string, unknown> = {};

  // Validate no extra keys
  const definedKeys = new Set(templateSchema.fields.map((f) => f.key));
  for (const key of Object.keys(attributes)) {
    if (!definedKeys.has(key)) {
      errors.push(`Unknown attribute key: ${key}`);
    }
  }

  for (const field of templateSchema.fields) {
    const value = attributes[field.key];
    if (value === undefined || value === null) {
      if (field.required) {
        errors.push(`Missing required attribute: ${field.key}`);
      }
      continue;
    }
    const result = validateFieldValue(field, value);
    if (result.error) {
      errors.push(`${field.key}: ${result.error}`);
    } else {
      validated[field.key] = result.value;
    }
  }

  if (errors.length > 0) {
    throw Object.assign(
      new Error(`Attribute validation failed: ${errors.join('; ')}`),
      { status: 400, code: 'VALIDATION_ERROR' },
    );
  }

  return validated;
}

function validateFieldValue(
  field: TemplateField,
  value: unknown,
): { value?: unknown; error?: string } {
  switch (field.type) {
    case 'text':
      if (typeof value !== 'string') return { error: 'Expected string' };
      if (value.length > 10000) return { error: 'Text too long (max 10000)' };
      return { value };
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return { error: 'Expected finite number' };
      return { value };
    case 'boolean':
      if (typeof value !== 'boolean') return { error: 'Expected boolean' };
      return { value };
    case 'date':
      if (typeof value !== 'string') return { error: 'Expected ISO date string' };
      if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value.slice(0, 10)) return { error: 'Invalid date format' };
      return { value };
    case 'select':
      if (typeof value !== 'string') return { error: 'Expected string' };
      if (!field.options.includes(value)) return { error: `Value not in options: ${field.options.join(', ')}` };
      return { value };
    default:
      return { error: 'Unknown field type' };
  }
}

