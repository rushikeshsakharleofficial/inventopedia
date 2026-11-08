import { describe, it, expect } from 'vitest';
import type { TemplateSchema } from '@shared/types/templates.js';
import {
  validateAttributes,
  createItemSchema,
  updateItemSchema,
  assertItemCursorScope,
  encodeItemCursor,
  itemRowSchema,
  itemQuerySchema,
} from './inventoryValidation.js';

// ── Attribute validation ────────────────────────────────────────────────────

describe('validateAttributes', () => {
  const schema: TemplateSchema = {
    fields: [
      { key: 'color', label: 'Color', type: 'text', required: true },
      { key: 'weight', label: 'Weight', type: 'number', required: false },
      { key: 'active', label: 'Active', type: 'boolean', required: false },
      { key: 'expiry', label: 'Expiry', type: 'date', required: false },
      { key: 'size', label: 'Size', type: 'select', required: true, options: ['S', 'M', 'L'] },
    ],
  };

  it('accepts valid attributes', () => {
    const attrs = { color: 'red', size: 'M', weight: 1.5, active: true, expiry: '2026-12-31T00:00:00Z' };
    const result = validateAttributes(attrs, schema);
    expect(result.color).toBe('red');
    expect(result.size).toBe('M');
    expect(result.weight).toBe(1.5);
  });

  it('accepts minimal required attributes', () => {
    const result = validateAttributes({ color: 'blue', size: 'L' }, schema);
    expect(result).toEqual({ color: 'blue', size: 'L' });
  });

  it('rejects missing required fields', () => {
    expect(() => validateAttributes({ size: 'M' }, schema)).toThrow(/Missing required.*color/);
  });

  it('rejects unknown keys', () => {
    expect(() => validateAttributes({ color: 'red', size: 'M', unknown: 'x' }, schema)).toThrow(/Unknown attribute key.*unknown/);
  });

  it('rejects wrong types', () => {
    expect(() => validateAttributes({ color: 123, size: 'M' }, schema)).toThrow(/Expected string/);
  });

  it('rejects invalid select option', () => {
    expect(() => validateAttributes({ color: 'red', size: 'XL' }, schema)).toThrow(/not in options/);
  });

  it('rejects non-finite numbers', () => {
    expect(() => validateAttributes({ color: 'red', size: 'M', weight: Infinity }, schema)).toThrow(/Expected finite number/);
  });

  it('rejects invalid date strings', () => {
    expect(() => validateAttributes({ color: 'red', size: 'M', expiry: 'not-a-date' }, schema)).toThrow(/Invalid date/);
  });

  it('rejects non-boolean for boolean field', () => {
    expect(() => validateAttributes({ color: 'red', size: 'M', active: 'yes' }, schema)).toThrow(/Expected boolean/);
  });

  it('works with empty schema', () => {
    const result = validateAttributes({}, { fields: [] });
    expect(result).toEqual({});
  });

  it('rejects extra keys with empty schema', () => {
    expect(() => validateAttributes({ extra: 1 }, { fields: [] })).toThrow(/Unknown attribute key/);
  });
});

// ── Input schemas ───────────────────────────────────────────────────────────

describe('createItemSchema', () => {
  it('accepts valid input', () => {
    const result = createItemSchema.parse({
      templateVersionId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Widget A',
    });
    expect(result.name).toBe('Widget A');
    expect(result.categoryId).toBeNull();
    expect(result.sku).toBeNull();
    expect(result.attributes).toEqual({});
  });

  it('rejects empty name', () => {
    expect(() => createItemSchema.parse({
      templateVersionId: '550e8400-e29b-41d4-a716-446655440000',
      name: '',
    })).toThrow();
  });

  it('rejects invalid templateVersionId', () => {
    expect(() => createItemSchema.parse({
      templateVersionId: 'not-a-uuid',
      name: 'Test',
    })).toThrow();
  });

  it('rejects extra fields', () => {
    expect(() => createItemSchema.parse({
      templateVersionId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Test',
      quantity: 10,
    })).toThrow();
  });
});

describe('updateItemSchema', () => {
  it('accepts partial update', () => {
    const result = updateItemSchema.parse({ name: 'Updated' });
    expect(result.name).toBe('Updated');
  });

  it('rejects empty object', () => {
    expect(() => updateItemSchema.parse({})).toThrow(/At least one field/);
  });

  it('rejects templateVersionId (immutable)', () => {
    expect(() => updateItemSchema.parse({ templateVersionId: '550e8400-e29b-41d4-a716-446655440000' })).toThrow();
  });
});

// ── Cursor ──────────────────────────────────────────────────────────────────

describe('cursor scope', () => {
  const projectId = '550e8400-e29b-41d4-a716-446655440000';

  it('passes when projectId matches', () => {
    expect(() => assertItemCursorScope(projectId, { limit: 20 })).not.toThrow();
  });

  it('throws on project mismatch', () => {
    const query: Parameters<typeof assertItemCursorScope>[1] = {
      limit: 20,
      cursor: { kind: 'items', projectId: '00000000-0000-0000-0000-000000000001', createdAt: '2026-01-01T00:00:00Z', id: projectId },
    };
    expect(() => assertItemCursorScope(projectId, query)).toThrow(/project scope/);
  });

  it('throws on category filter mismatch', () => {
    const catId = '00000000-0000-0000-0000-000000000002';
    const query: Parameters<typeof assertItemCursorScope>[1] = {
      limit: 20,
      categoryId: catId,
      cursor: { kind: 'items', projectId, createdAt: '2026-01-01T00:00:00Z', id: projectId, categoryId: null, templateId: null },
    };
    expect(() => assertItemCursorScope(projectId, query)).toThrow(/category filter/);
  });

  it('encodes and decodes a cursor', () => {
    const row = itemRowSchema.parse({
      id: projectId,
      project_id: projectId,
      template_version_id: projectId,
      category_id: null,
      name: 'Test',
      sku: null,
      attributes: {},
      quantity: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
    const encoded = encodeItemCursor(projectId, { limit: 20 }, row);
    expect(typeof encoded).toBe('string');
    const parsed = itemQuerySchema.parse({ cursor: encoded });
    expect(parsed.cursor).toBeDefined();
    expect(parsed.cursor!.projectId).toBe(projectId);
  });
});

