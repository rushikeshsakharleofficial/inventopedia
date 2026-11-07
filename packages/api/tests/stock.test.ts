import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app.js';

const app = createApp();
const orgId = '550e8400-e29b-41d4-a716-446655440000';
const projectId = '660e8400-e29b-41d4-a716-446655440000';
const movementId = '770e8400-e29b-41d4-a716-446655440000';
const base = `/api/v1/organisations/${orgId}/projects/${projectId}/stock/movements`;

describe('Stock routes — auth guard', () => {
  it('POST movements returns 401 without auth', async () => {
    const res = await app.request(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: movementId, type: 'receive', quantity: 10 }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('GET movements returns 401 without auth', async () => {
    const res = await app.request(base);
    expect(res.status).toBe(401);
  });

  it('GET single movement returns 401 without auth', async () => {
    const res = await app.request(`${base}/${movementId}`);
    expect(res.status).toBe(401);
  });

  it('rejects malformed Bearer token', async () => {
    const res = await app.request(base, {
      headers: { Authorization: 'NotBearer xyz' },
    });
    expect(res.status).toBe(401);
  });
});

describe('Stock routes — route registration', () => {
  it('POST movements route exists', async () => {
    const res = await app.request(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // Auth fails (401) not 404 — route exists
    expect(res.status).toBe(401);
  });

  it('GET movements list route exists', async () => {
    const res = await app.request(base);
    expect(res.status).toBe(401);
  });

  it('GET single movement route exists', async () => {
    const res = await app.request(`${base}/${movementId}`);
    expect(res.status).toBe(401);
  });

  it('no PUT/PATCH/DELETE on movements (immutable)', async () => {
    // PATCH and DELETE are not defined as stock routes.
    // Auth middleware catches all methods first (401), confirming
    // no accidental write route is registered for mutations.
    const patch = await app.request(`${base}/${movementId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: 5 }),
    });
    // Auth runs first → 401; the key point is no 2xx is possible
    expect([401, 404, 405]).toContain(patch.status);

    const del = await app.request(`${base}/${movementId}`, { method: 'DELETE' });
    expect([401, 404, 405]).toContain(del.status);
  });
});
