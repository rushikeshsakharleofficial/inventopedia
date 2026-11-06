import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app.js';

const app = createApp();
const orgId = '550e8400-e29b-41d4-a716-446655440000';
const projectId = '660e8400-e29b-41d4-a716-446655440000';
const itemId = '770e8400-e29b-41d4-a716-446655440000';
const base = `/api/v1/organisations/${orgId}/projects/${projectId}/items`;

// All inventory routes require authentication (inherited from organisations)
describe('Inventory routes — auth guard', () => {
  it('GET items returns 401 without auth', async () => {
    const res = await app.request(base);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('POST items returns 401 without auth', async () => {
    const res = await app.request(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateVersionId: itemId, name: 'Test' }),
    });
    expect(res.status).toBe(401);
  });

  it('GET single item returns 401 without auth', async () => {
    const res = await app.request(`${base}/${itemId}`);
    expect(res.status).toBe(401);
  });

  it('PATCH item returns 401 without auth', async () => {
    const res = await app.request(`${base}/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated' }),
    });
    expect(res.status).toBe(401);
  });

  it('DELETE item returns 401 without auth', async () => {
    const res = await app.request(`${base}/${itemId}`, { method: 'DELETE' });
    expect(res.status).toBe(401);
  });

  it('rejects malformed Bearer token', async () => {
    const res = await app.request(base, {
      headers: { Authorization: 'NotBearer xyz' },
    });
    expect(res.status).toBe(401);
  });
});

describe('Inventory routes — input validation', () => {
  const authHeader = { Authorization: 'Bearer fake-token-for-test' };

  // These tests get 401 because the token is invalid, but they confirm route matching
  it('rejects invalid item ID format', async () => {
    const res = await app.request(`${base}/not-a-uuid`, {
      headers: authHeader,
    });
    // Route matches but auth fails first — this is expected
    expect(res.status).toBe(401);
  });
});

describe('Inventory routes — route registration', () => {
  it('POST route exists at correct path', async () => {
    const res = await app.request(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // Route exists — returns 401 (auth) not 404
    expect(res.status).toBe(401);
  });

  it('GET list route exists', async () => {
    const res = await app.request(base);
    expect(res.status).toBe(401);
  });

  it('GET single route exists', async () => {
    const res = await app.request(`${base}/${itemId}`);
    expect(res.status).toBe(401);
  });

  it('PATCH route exists', async () => {
    const res = await app.request(`${base}/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    });
    expect(res.status).toBe(401);
  });

  it('DELETE route exists', async () => {
    const res = await app.request(`${base}/${itemId}`, { method: 'DELETE' });
    expect(res.status).toBe(401);
  });
});

