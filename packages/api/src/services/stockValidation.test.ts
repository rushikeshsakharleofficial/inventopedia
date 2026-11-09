import { describe, it, expect } from 'vitest';
import {
  createMovementSchema,
  movementQuerySchema,
  assertMovementCursorScope,
  encodeMovementCursor,
  movementRowSchema,
  movementTypeSchema,
} from './stockValidation.js';

describe('createMovementSchema', () => {
  const validInput = {
    itemId: '550e8400-e29b-41d4-a716-446655440000',
    type: 'receive',
    quantity: 10,
    referenceId: 'req-001',
  };

  it('accepts valid input with defaults', () => {
    const result = createMovementSchema.parse(validInput);
    expect(result.type).toBe('receive');
    expect(result.quantity).toBe(10);
    expect(result.reason).toBeNull();
    expect(result.referenceId).toBe('req-001');
  });

  it('accepts all movement types', () => {
    for (const type of ['receive', 'ship', 'adjust', 'transfer', 'return']) {
      const result = createMovementSchema.parse({ ...validInput, type, ...(type === 'transfer' ? { destinationItemId: '660e8400-e29b-41d4-a716-446655440000' } : {}) });
      expect(result.type).toBe(type);
    }
  });

  it('accepts reason and referenceId', () => {
    const result = createMovementSchema.parse({
      ...validInput,
      reason: 'Restocking',
      referenceId: 'PO-2026-001',
    });
    expect(result.reason).toBe('Restocking');
    expect(result.referenceId).toBe('PO-2026-001');
  });

  it('rejects zero quantity', () => {
    expect(() => createMovementSchema.parse({ ...validInput, quantity: 0 })).toThrow();
  });

  it('rejects negative quantities except for adjustments', () => {
    expect(() => createMovementSchema.parse({ ...validInput, quantity: -5 })).toThrow();
    expect(createMovementSchema.parse({ ...validInput, type: 'adjust', quantity: -5 }).quantity).toBe(-5);
  });

  it('requires idempotency key and distinct destination for transfers', () => {
    expect(() => createMovementSchema.parse({ itemId: validInput.itemId, type: 'ship', quantity: 1 })).toThrow();
    expect(() => createMovementSchema.parse({ ...validInput, type: 'transfer' })).toThrow();
    expect(() => createMovementSchema.parse({ ...validInput, type: 'transfer', destinationItemId: validInput.itemId })).toThrow();
    expect(() => createMovementSchema.parse({ ...validInput, destinationItemId: validInput.itemId })).toThrow();
  });

  it('rejects non-finite quantity', () => {
    expect(() => createMovementSchema.parse({ ...validInput, quantity: Infinity })).toThrow();
  });

  it('rejects invalid type', () => {
    expect(() => createMovementSchema.parse({ ...validInput, type: 'invalid' })).toThrow();
  });

  it('rejects missing itemId', () => {
    expect(() => createMovementSchema.parse({ type: 'receive', quantity: 10 })).toThrow();
  });

  it('rejects invalid itemId', () => {
    expect(() => createMovementSchema.parse({ ...validInput, itemId: 'not-uuid' })).toThrow();
  });

  it('rejects extra fields', () => {
    expect(() => createMovementSchema.parse({ ...validInput, extra: true })).toThrow();
  });

  it('trims reason', () => {
    const result = createMovementSchema.parse({ ...validInput, reason: '  spaced  ' });
    expect(result.reason).toBe('spaced');
  });

  it('rejects reason over 1000 chars', () => {
    expect(() => createMovementSchema.parse({ ...validInput, reason: 'x'.repeat(1001) })).toThrow();
  });
});

describe('movementTypeSchema', () => {
  it('accepts all valid types', () => {
    expect(movementTypeSchema.parse('receive')).toBe('receive');
    expect(movementTypeSchema.parse('ship')).toBe('ship');
    expect(movementTypeSchema.parse('adjust')).toBe('adjust');
    expect(movementTypeSchema.parse('transfer')).toBe('transfer');
    expect(movementTypeSchema.parse('return')).toBe('return');
  });

  it('rejects invalid type', () => {
    expect(() => movementTypeSchema.parse('invalid')).toThrow();
  });
});

describe('movementQuerySchema', () => {
  it('accepts empty query with defaults', () => {
    const result = movementQuerySchema.parse({});
    expect(result.limit).toBe(20);
    expect(result.cursor).toBeUndefined();
    expect(result.itemId).toBeUndefined();
    expect(result.type).toBeUndefined();
  });

  it('accepts itemId filter', () => {
    const result = movementQuerySchema.parse({ itemId: '550e8400-e29b-41d4-a716-446655440000' });
    expect(result.itemId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('accepts type filter', () => {
    const result = movementQuerySchema.parse({ type: 'ship' });
    expect(result.type).toBe('ship');
  });

  it('rejects invalid type filter', () => {
    expect(() => movementQuerySchema.parse({ type: 'invalid' })).toThrow();
  });

  it('rejects extra fields', () => {
    expect(() => movementQuerySchema.parse({ extra: true })).toThrow();
  });
});

describe('cursor scope', () => {
  const projectId = '550e8400-e29b-41d4-a716-446655440000';

  it('passes without cursor', () => {
    expect(() => assertMovementCursorScope(projectId, { limit: 20 })).not.toThrow();
  });

  it('throws on project mismatch', () => {
    const query: Parameters<typeof assertMovementCursorScope>[1] = {
      limit: 20,
      cursor: { kind: 'movements', projectId: '00000000-0000-0000-0000-000000000001', createdAt: '2026-01-01T00:00:00Z', id: projectId },
    };
    expect(() => assertMovementCursorScope(projectId, query)).toThrow(/project scope/);
  });

  it('throws on item filter mismatch', () => {
    const itemId = '00000000-0000-0000-0000-000000000002';
    const query: Parameters<typeof assertMovementCursorScope>[1] = {
      limit: 20,
      itemId,
      cursor: { kind: 'movements', projectId, createdAt: '2026-01-01T00:00:00Z', id: projectId },
    };
    expect(() => assertMovementCursorScope(projectId, query)).toThrow(/item filter/);
  }

  it('rejects reusing a cursor for a different movement type', () => {
    const query: Parameters<typeof assertMovementCursorScope>[1] = {
      limit: 20, type: 'ship',
      cursor: { kind: 'movements', projectId, type: 'receive', createdAt: '2026-01-01T00:00:00Z', id: projectId },
    };
    expect(() => assertMovementCursorScope(projectId, query)).toThrow(/movement type/);
  }););

  it('encodes and decodes a cursor', () => {
    const row = movementRowSchema.parse({
      id: projectId,
      project_id: projectId,
      item_id: projectId,
      type: 'receive',
      quantity: 10,
      reason: null,
      reference_id: null,
      created_by: projectId,
      created_at: '2026-01-01T00:00:00Z',
    });
    const encoded = encodeMovementCursor(projectId, { limit: 20 }, row);
    expect(typeof encoded).toBe('string');
    const parsed = movementQuerySchema.parse({ cursor: encoded });
    expect(parsed.cursor).toBeDefined();
    expect(parsed.cursor!.projectId).toBe(projectId);
  });
});

