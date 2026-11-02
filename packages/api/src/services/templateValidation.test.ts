import { describe, expect, it } from 'vitest';
import { templateSchema, createTemplateSchema, updateTemplateSchema, templateQuerySchema,
  versionQuerySchema, assertTemplateCursorScope } from './templateValidation.js';

const field = { key: 'serial', label: ' Serial ', type: 'text' };
const projectId = '30000000-0000-4000-8000-000000000001';
describe('Typed template contract', () => {
  it('normalizes labels/defaults and preserves display order', () => {
    expect(templateSchema.parse({ fields: [field, { key: 'count', label: 'Count', type: 'number', required: true }] })).toEqual({
      fields: [{ key: 'serial', label: 'Serial', type: 'text', required: false },
        { key: 'count', label: 'Count', type: 'number', required: true }],
    });
  });
  it.each(['text', 'number', 'boolean', 'date'])('accepts %s fields', (type) => {
    expect(templateSchema.safeParse({ fields: [{ ...field, type }] }).success).toBe(true);
  });
  it('accepts select choices and empty templates', () => {
    expect(templateSchema.parse({ fields: [{ ...field, type: 'select', options: [' Red ', 'Blue'] }] }).fields[0]).toMatchObject({ options: ['Red', 'Blue'] });
    expect(templateSchema.parse({ fields: [] })).toEqual({ fields: [] });
  });
  it.each([
    {}, { fields: null }, { fields: [], extra: true }, { fields: [field, field] },
    ...['__proto__', 'constructor', 'prototype', 'Bad', 'a-b', 'a'.repeat(65)].map((key) => ({ fields: [{ ...field, key }] })),
    ...[{ type: 'unknown' }, { required: 'yes' }, { options: ['x'] }, { label: ' ' }, { label: 'x'.repeat(201) },
      { extra: 1 }, { type: 'select' }, { type: 'select', options: [] }, { type: 'select', options: ['x', ' x '] },
      { type: 'select', options: [''] }, { type: 'select', options: [3] }].map((patch) => ({ fields: [{ ...field, ...patch }] })),
  ])('rejects invalid schema %j', (input) => expect(templateSchema.safeParse(input).success).toBe(false));
  it('validates metadata and partial edits', () => {
    expect(createTemplateSchema.parse({ name: ' New ' })).toEqual({ name: 'New', description: null });
    expect(updateTemplateSchema.parse({ description: null })).toEqual({ description: null });
    for (const input of [{}, { name: '' }, { name: 'x'.repeat(201) }, { currentVersionId: projectId }, { description: 'x'.repeat(2001) }]) {
      expect(updateTemplateSchema.safeParse(input).success).toBe(false);
    }
  });
  it('rejects invalid and injectable cursors and unknown queries', () => {
    for (const input of [{ limit: 0 }, { limit: 101 }, { cursor: 'bad' }, { extra: 'x' },
      { cursor: Buffer.from(JSON.stringify({ projectId, createdAt: 'x),id.gt.0', id: projectId })).toString('base64url') }]) {
      expect(templateQuerySchema.safeParse(input).success).toBe(false);
    }
  });
  it('binds metadata and version cursors to distinct scopes', () => {
    const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const query = templateQuerySchema.parse({ cursor: encode({ kind: 'templates', projectId, createdAt: '2026-11-02T00:00:00Z', id: projectId }) });
    expect(() => assertTemplateCursorScope(projectId, query)).not.toThrow();
    expect(() => assertTemplateCursorScope('30000000-0000-4000-8000-000000000002', query)).toThrow();
    expect(versionQuerySchema.safeParse({ cursor: encode({ kind: 'versions', projectId, templateId: projectId, version: '1),id.gt.0' }) }).success).toBe(false);
    const versions = versionQuerySchema.parse({ cursor: encode({ kind: 'versions', projectId, templateId: projectId, version: 2 }) });
    expect(() => assertTemplateCursorScope(projectId, versions, '30000000-0000-4000-8000-000000000002')).toThrow();
  });
});
