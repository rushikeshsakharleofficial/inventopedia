import { z } from 'zod';
import type { StockMovement } from '@shared/types/entities.js';
import { getSupabaseClient } from '../db/index.js';
import {
  assertMovementCursorScope,
  encodeMovementCursor,
  movementRowSchema,
  rpcResultSchema,
  type CreateMovementInput,
  type MovementQuery,
} from './stockValidation.js';

function client(token: string) { return getSupabaseClient(token).schema('inventory'); }

function mapMovement(value: unknown): StockMovement {
  const row = movementRowSchema.parse(value);
  return {
    id: row.id,
    itemId: row.item_id,
    destinationItemId: row.destination_item_id ?? null,
    type: row.type,
    quantity: row.quantity,
    reason: row.reason,
    referenceId: row.reference_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/** Extended response for create — includes resulting quantity */
export interface StockMovementResult extends StockMovement {
  resultingQuantity: number;
  destinationResultingQuantity?: number;
}

// ── Record stock movement via transactional RPC ─────────────────────────────

export async function recordStockMovement(
  projectId: string,
  input: CreateMovementInput,
  userId: string,
  token: string,
): Promise<StockMovementResult> {
  const supabase = getSupabaseClient(token);

  const isTransfer = input.type === 'transfer';
  const { data, error } = isTransfer
    ? await supabase.schema('inventory').rpc('record_stock_transfer', {
        p_project_id: projectId,
        p_source_item_id: input.itemId,
        p_destination_item_id: input.destinationItemId,
        p_quantity: input.quantity,
        p_reason: input.reason,
        p_reference_id: input.referenceId,
        p_created_by: userId,
      })
    : await supabase.schema('inventory').rpc('record_stock_movement', {
        p_project_id: projectId,
        p_item_id: input.itemId,
        p_type: input.type,
        p_quantity: input.quantity,
        p_reason: input.reason,
        p_reference_id: input.referenceId,
        p_created_by: userId,
      });

  if (error) {
    if (error.code === '42501') {
      throw Object.assign(new Error('Stock write forbidden'), { status: 403, code: 'FORBIDDEN' });
    }
    // Map PostgreSQL error codes to HTTP errors
    if (error.code === 'P0002') {
      throw Object.assign(new Error('Item not found in project'), { status: 404, code: 'NOT_FOUND' });
    }
    if (error.code === 'P0004') {
      throw Object.assign(new Error(error.message || 'Insufficient stock'), { status: 409, code: 'INSUFFICIENT_STOCK' });
    }
    if (error.code === '23505') {
      // Unique constraint on (project_id, reference_id) — idempotency conflict
      throw Object.assign(new Error('Duplicate reference ID'), { status: 409, code: 'DUPLICATE_REFERENCE' });
    }
    if (error.code === '22023') {
      throw Object.assign(new Error(error.message || 'Invalid movement parameters'), { status: 400, code: 'VALIDATION_ERROR' });
    }
    if (error.code === '28000') {
      throw Object.assign(new Error('Authentication required'), { status: 401, code: 'UNAUTHORIZED' });
    }
    throw new Error(`Stock movement failed: ${error.message}`);
  }

  const parsed = rpcResultSchema.parse(data);
  return {
    id: parsed.id,
    itemId: parsed.item_id,
    destinationItemId: parsed.destination_item_id ?? null,
    type: parsed.type,
    quantity: parsed.quantity,
    reason: parsed.reason,
    referenceId: parsed.reference_id,
    createdBy: parsed.created_by,
    createdAt: parsed.created_at,
    resultingQuantity: parsed.resulting_quantity,
    ...(parsed.destination_resulting_quantity !== undefined ? { destinationResultingQuantity: parsed.destination_resulting_quantity } : {}),
  };
}

// ── Get a single movement ───────────────────────────────────────────────────

export async function getMovement(
  projectId: string,
  movementId: string,
  token: string,
): Promise<StockMovement> {
  const { data, error } = await client(token)
    .from('stock_movements')
    .select('*')
    .eq('project_id', projectId)
    .eq('id', movementId)
    .maybeSingle();

  if (error) throw new Error('Failed to fetch movement');
  if (!data) {
    throw Object.assign(new Error('Movement not found'), { status: 404, code: 'NOT_FOUND' });
  }
  return mapMovement(data);
}

// ── List movements with pagination and filters ──────────────────────────────

export async function listMovements(
  projectId: string,
  query: MovementQuery,
  token: string,
) {
  assertMovementCursorScope(projectId, query);

  let builder = client(token)
    .from('stock_movements')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(query.limit + 1);

  if (query.itemId) {
    builder = builder.eq('item_id', query.itemId);
  }
  if (query.type) {
    builder = builder.eq('type', query.type);
  }

  if (query.cursor) {
    const { createdAt, id } = query.cursor;
    builder = builder.or(
      `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.gt.${id})`
    );
  }

  const { data, error } = await builder;
  if (error) throw new Error('Failed to list movements');
  const rows = z.array(movementRowSchema).parse(data);
  const hasMore = rows.length > query.limit;
  const page = rows.slice(0, query.limit);

  return {
    data: page.map(mapMovement),
    pagination: {
      hasMore,
      cursor: hasMore ? encodeMovementCursor(projectId, query, page[page.length - 1]) : null,
    },
  };
}

