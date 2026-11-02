import { z } from 'zod';

export const categoryIdSchema = z.string().uuid().transform((value) => value.toLowerCase());
const sortOrderSchema = z.number().int().min(-2147483648).max(2147483647);
const categoryFields = z.object({
  name: z.string().trim().min(1).max(200),
  parentId: categoryIdSchema.nullable(),
  sortOrder: sortOrderSchema,
}).strict();
export const createCategorySchema = categoryFields.extend({
  parentId: categoryIdSchema.nullable().default(null), sortOrder: sortOrderSchema.default(0),
});
export const updateCategorySchema = categoryFields.partial().refine(
  (input) => Object.values(input).some((value) => value !== undefined), 'At least one field is required');

const parentFilterSchema = z.union([z.literal('root'), categoryIdSchema]);
const cursorValueSchema = z.object({
  version: z.literal(1), projectId: categoryIdSchema, parentId: parentFilterSchema.nullable(),
  sortOrder: sortOrderSchema, id: categoryIdSchema,
}).strict();
const cursorSchema = z.string().max(1024).regex(/^[A-Za-z0-9_-]+$/).transform((value, ctx) => {
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    if (Buffer.from(decoded).toString('base64url') !== value) throw new Error('Non-canonical cursor');
    return cursorValueSchema.parse(JSON.parse(decoded));
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid cursor' });
    return z.NEVER;
  }
});
export const categoryQuerySchema = z.object({
  parentId: parentFilterSchema.optional(), cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const categoryRowSchema = z.object({
  id: categoryIdSchema, project_id: categoryIdSchema, name: z.string().min(1).max(200),
  parent_id: categoryIdSchema.nullable(), sort_order: sortOrderSchema,
  path: z.string().refine((path) => path.startsWith('/') && path.endsWith('/')
    && path.slice(1, -1).split('/').every((part) => z.string().uuid().safeParse(part).success), 'Invalid category path'),
  created_at: z.string().datetime({ offset: true }), updated_at: z.string().datetime({ offset: true }),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategoryQuery = z.infer<typeof categoryQuerySchema>;

export function assertCategoryCursorScope(projectId: string, query: CategoryQuery): void {
  if (query.cursor && (query.cursor.projectId !== projectId || query.cursor.parentId !== (query.parentId ?? null))) {
    throw Object.assign(new Error('Cursor does not match category scope'), { status: 400, code: 'VALIDATION_ERROR' });
  }
}

export function encodeCategoryCursor(projectId: string, query: CategoryQuery, row: z.infer<typeof categoryRowSchema>): string {
  return Buffer.from(JSON.stringify({ version: 1, projectId, parentId: query.parentId ?? null,
    sortOrder: row.sort_order, id: row.id })).toString('base64url');
}
