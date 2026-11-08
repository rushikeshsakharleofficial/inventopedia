import { readFileSync } from 'node:fs';
import SwaggerParser from '@apidevtools/swagger-parser';
import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { contracts, createOpenApiDocument, errorSchema } from '../src/contracts.js';
import { validateBody, validateQuery } from '../src/middleware/validation.js';
import { errorHandler } from '../src/middleware/error.js';
import { requestId } from '../src/middleware/requestId.js';
import type { AppEnv } from '../src/types.js';

describe('API v1 contracts', () => {
  it('covers every registered route and method exactly once', () => {
    const routes = createApp().routes.filter((route) => route.method !== 'ALL')
      .map((route) => `${route.method} ${route.path.replace(/:([A-Za-z]+)/g, '{$1}').replace(/\/$/, '')}`);
    const declared = contracts.map((contract) => `${contract.method} ${contract.path}`);
    expect(new Set(declared).size).toBe(declared.length);
    expect([...new Set(routes)].sort()).toEqual(declared.sort());
  });
  it('generates a valid OpenAPI 3.1 document and keeps the artifact current', async () => {
    const document = createOpenApiDocument();
    const parsed = await SwaggerParser.validate(JSON.parse(JSON.stringify(document)));
    expect(parsed).toHaveProperty('openapi', '3.1.0');
    expect(JSON.parse(readFileSync(new URL('../../../docs/openapi.json', import.meta.url), 'utf8'))).toEqual(document);
  });
  it('serves the contract and validates the public health response', async () => {
    const app = createApp();
    const response = await app.request('/api/v1/openapi.json');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(createOpenApiDocument());
    expect(await (await app.request('/api/v1/openapi.json')).json()).toEqual(createOpenApiDocument());
    const health = await app.request('/api/v1/health');
    expect(contracts.find((c) => c.path.endsWith('/health'))!.response.safeParse(await health.json()).success).toBe(true);
  });
  it('preserves acceptance of UUID-shaped IDs without RFC version bits', () => {
    const id = '12345678-1234-1234-1234-123456789abc';
    const contract = contracts.find((c) => c.path.endsWith('/items') && c.method === 'POST')!;
    expect(contract.body!.safeParse({ name: 'Item', templateVersionId: id }).success).toBe(true);
    expect(contract.body!.safeParse({ name: 'Item', templateVersionId: 'not-an-id' }).success).toBe(false);
  });
  it('returns the common envelope for unknown routes', async () => {
    const response = await createApp().request('/api/v1/missing', { headers: { 'X-Request-Id': 'contract-test' } });
    expect(response.status).toBe(404);
    expect(errorSchema.parse(await response.json())).toEqual({ error: 'Route not found', code: 'NOT_FOUND', requestId: 'contract-test' });
  });
  it.each(['body', 'query'])('keeps downstream errors outside %s validation', async (kind) => {
    const app = new Hono<AppEnv>();
    app.use('*', requestId()); app.onError(errorHandler());
    const schema = z.object({ value: z.string() });
    app.post('/', kind === 'body' ? validateBody(schema) : validateQuery(schema), () => {
      throw new Error('private failure');
    });
    const response = await app.request(kind === 'body' ? '/' : '/?value=valid', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'valid' }),
    });
    expect(response.status).toBe(500);
    expect(errorSchema.parse(await response.json()).code).toBe('INTERNAL_ERROR');
  });
});
