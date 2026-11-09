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
  destinationItemId: z.string().guid().optional(),
  quantity: z.number().finite(),
  reason: z.string().trim().max(1000).nullable().default(null),
  referenceId: z.string().trim().min(1).max(200),
}).strict().superRefine((value, ctx) => {
  if (value.quantity === 0 || (value.type !== 'adjust' && value.quantity < 0)) {
    ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Quantity must be non-zero; only adjustments may be negative' });
  }
  if (value.type === 'transfer') {
    if (!value.destinationItemId || value.destinationItemId === value.itemId) {
      ctx.addIssue({ code: 'custom', path: ['destinationItemId'], message: 'Transfer requires a different destination item' });
    }
  } else if (value.destinationItemId) {
    ctx.addIssue({ code: 'custom', path: ['destinationItemId'], message: 'Destination is only valid for transfers' });
  }
});

// ── List query / cursor schemas ─────────────────────────────────────────────

const movementCursor = z.object({
  kind: z.literal('movements'),
  projectId: movementIdSchema,
  itemId: movementIdSchema.optional(),
  type: movementTypeSchema.optional(),
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
  destination_item_id: movementIdSchema.nullable().optional(),
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
  destination_resulting_quantity: z.coerce.number().optional(),
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
  if ((c.type ?? null) !== (query.type ?? null)) {
    throw Object.assign(new Error('Cursor movement type mismatch'), { status: 400, code: 'VALIDATION_ERROR' });
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
    type: query.type ?? undefined,
    createdAt: row.created_at,
    id: row.id,
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

