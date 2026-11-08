import { z } from 'zod';
import type { TemplateSchema } from '@shared/types/templates.js';

export const templateIdSchema = z.string().guid().transform((v) => v.toLowerCase());
const fieldBase = {
  key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/).refine((v) => !['__proto__', 'prototype', 'constructor'].includes(v)),
  label: z.string().trim().min(1).max(200), required: z.boolean().default(false),
};
const choice = z.string().trim().min(1).max(200);
const fieldSchema = z.discriminatedUnion('type', [
  z.object({ ...fieldBase, type: z.literal('text') }).strict(),
  z.object({ ...fieldBase, type: z.literal('number') }).strict(),
  z.object({ ...fieldBase, type: z.literal('boolean') }).strict(),
  z.object({ ...fieldBase, type: z.literal('date') }).strict(),
  z.object({ ...fieldBase, type: z.literal('select'), options: z.array(choice).min(1)
    .refine((v) => new Set(v).size === v.length, 'Options must be unique') }).strict(),
]);
export const templateSchema = z.object({ fields: z.array(fieldSchema)
  .refine((v) => new Set(v.map((f) => f.key)).size === v.length, 'Field keys must be unique') }).strict() satisfies z.ZodType<TemplateSchema>;
const metadata = z.object({ name: z.string().trim().min(1).max(200), description: z.string().max(2000).nullable() }).strict();
export const createTemplateSchema = metadata.extend({ description: metadata.shape.description.default(null) });
export const updateTemplateSchema = metadata.partial().refine((v) => Object.values(v).some((x) => x !== undefined), 'At least one field required');
export const versionInputSchema = z.object({ schema: templateSchema }).strict();
const number = z.number().int().min(1).max(2147483647);
const time = z.string().datetime({ offset: true });
const templateCursor = z.object({ kind: z.literal('templates'), projectId: templateIdSchema, createdAt: time, id: templateIdSchema }).strict();
const versionCursor = z.object({ kind: z.literal('versions'), projectId: templateIdSchema, templateId: templateIdSchema, version: number }).strict();
function cursor<T extends z.ZodTypeAny>(schema: T) {
  return z.string().max(1024).regex(/^[A-Za-z0-9_-]+$/).transform((value, ctx): z.infer<T> => {
    try {
      const decoded = Buffer.from(value, 'base64url').toString('utf8');
      if (Buffer.from(decoded).toString('base64url') !== value) throw new Error('Invalid encoding');
      return schema.parse(JSON.parse(decoded));
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid cursor' });
      return z.NEVER;
    }
  });
}
const limit = z.coerce.number().int().min(1).max(100).default(20);
export const templateQuerySchema = z.object({ limit, cursor: cursor(templateCursor).optional() }).strict();
export const versionQuerySchema = z.object({ limit, cursor: cursor(versionCursor).optional() }).strict();
export const templateRowSchema = z.object({ id: templateIdSchema, project_id: templateIdSchema,
  name: z.string().min(1).max(200), description: z.string().max(2000).nullable(),
  current_version_id: templateIdSchema.nullable(), created_at: time, updated_at: time });
// Historical drafts/publications may predate typed schemas; preserve them on reads.
export const versionRowSchema = z.object({ id: templateIdSchema, project_id: templateIdSchema,
  template_id: templateIdSchema, version: number, schema: z.record(z.string(), z.unknown()),
  published_at: time.nullable(), created_at: time });
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type VersionInput = z.infer<typeof versionInputSchema>;
export type TemplateQuery = z.infer<typeof templateQuerySchema>;
export type VersionQuery = z.infer<typeof versionQuerySchema>;
export function assertTemplateCursorScope(projectId: string, query: TemplateQuery | VersionQuery, templateId?: string): void {
  const value = query.cursor;
  if (value && (value.projectId !== projectId || (value.kind === 'versions' ? value.templateId !== templateId : templateId !== undefined))) {
    throw Object.assign(new Error('Cursor does not match template scope'), { status: 400, code: 'VALIDATION_ERROR' });
  }
}
export function encodeTemplateCursor(value: z.infer<typeof templateCursor> | z.infer<typeof versionCursor>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
