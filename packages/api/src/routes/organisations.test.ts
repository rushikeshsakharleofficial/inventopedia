import { describe, it, expect } from 'vitest';
import { createApp } from '../app.js';

describe('Organisation routes — auth guard', () => {
  const app = createApp();

  it('GET /api/v1/organisations returns 401 without auth', async () => {
    const res = await app.request('/api/v1/organisations');
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
    expect(body.error).toContain('Authorization');
  });

  it('POST /api/v1/organisations returns 401 without auth', async () => {
    const res = await app.request('/api/v1/organisations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', slug: 'test-org' }),
    });
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/organisations/:id returns 401 without auth', async () => {
    const res = await app.request('/api/v1/organisations/some-id');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/organisations/:id/members returns 401 without auth', async () => {
    const res = await app.request('/api/v1/organisations/some-id/members');
    expect(res.status).toBe(401);
  });

  it('returns 401 with malformed Bearer token', async () => {
    const res = await app.request('/api/v1/organisations', {
      headers: { Authorization: 'NotBearer xyz' },
    });
    expect(res.status).toBe(401);
  });
});
