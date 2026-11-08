import { z } from 'zod';

// ── ID primitives ───────────────────────────────────────────────────────────

export const movementIdSchema = z.string().guid().transform((v) => v.toLowerCase());
const time = z.string().datetime({ offset: true });
const limit = z.coerce.number().int().min(1).max(100).default(20);

// ── Movement types ──────────────────────────────────────────────────────────

export const movementTypes = ['receive', 'ship', 'adjust', 'transfer', 'return'] as const;
export const movementTypeSchema = z.enum(movementTypes);

// ── Create movement schema ──────────────────────────────────────────────────

export const createMovementSchema = z.object({
  itemId: z.string().guid(),
  type: movementTypeSchema,
  quantity: z.number().positive().finite(),
  reason: z.string().trim().max(1000).nullable().default(null),
  referenceId: z.string().trim().max(200).nullable().default(null),
}).strict();

// ── List query / cursor schemas ─────────────────────────────────────────────

const movementCursor = z.object({
  kind: z.literal('movements'),
  projectId: movementIdSchema,
  itemId: movementIdSchema.optional(),
  createdAt: time,
  id: movementIdSchema,
}).strict();

export const movementQuerySchema = z.object({
  limit,
  cursor: z.string().max(2048).regex(/^[A-Za-z0-9_-]+$/).transform((value, ctx): z.infer<typeof movementCursor> => {
    try {
      const decoded = Buffer.from(value, 'base64url').toString('utf8');
      if (Buffer.from(decoded).toString('base64url') !== value) throw new Error('Invalid encoding');
      return movementCursor.parse(JSON.parse(decoded));
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid cursor' });
      return z.NEVER;
    }
  }).optional(),
  itemId: z.string().guid().optional(),
  type: movementTypeSchema.optional(),
}).strict();

// ── Row schema (DB result validation) ───────────────────────────────────────

export const movementRowSchema = z.object({
  id: movementIdSchema,
  project_id: movementIdSchema,
  item_id: movementIdSchema,
  type: movementTypeSchema,
  quantity: z.coerce.number(),
  reason: z.string().nullable(),
  reference_id: z.string().nullable(),
  created_by: movementIdSchema,
  created_at: time,
});

// ── RPC result schema ───────────────────────────────────────────────────────

export const rpcResultSchema = z.object({
  id: movementIdSchema,
  project_id: movementIdSchema,
  item_id: movementIdSchema,
  type: movementTypeSchema,
  quantity: z.coerce.number(),
  reason: z.string().nullable(),
  reference_id: z.string().nullable(),
  created_by: movementIdSchema,
  created_at: time,
  resulting_quantity: z.coerce.number(),
});

// ── Types ───────────────────────────────────────────────────────────────────

export type CreateMovementInput = z.infer<typeof createMovementSchema>;
export type MovementQuery = z.infer<typeof movementQuerySchema>;

// ── Cursor scope assertion ──────────────────────────────────────────────────

export function assertMovementCursorScope(
  projectId: string,
  query: MovementQuery,
): void {
  const c = query.cursor;
  if (!c) return;
  if (c.projectId !== projectId) {
    throw Object.assign(new Error('Cursor does not match project scope'), { status: 400, code: 'VALIDATION_ERROR' });
  }
  if ((c.itemId ?? null) !== (query.itemId ?? null)) {
    throw Object.assign(new Error('Cursor item filter mismatch'), { status: 400, code: 'VALIDATION_ERROR' });
  }
}

export function encodeMovementCursor(
  projectId: string,
  query: MovementQuery,
  row: z.infer<typeof movementRowSchema>,
): string {
  const payload = {
    kind: 'movements' as const,
    projectId,
    itemId: query.itemId ?? undefined,
    createdAt: row.created_at,
    id: row.id,
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

