import { describe, it, expect } from 'vitest';
import { createApp } from '../app.js';

describe('Health endpoint', () => {
  const app = createApp();

  it('GET /api/v1/health returns 200 with status ok', async () => {
    const res = await app.request('/api/v1/health');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('inventopedia-api');
    expect(body.version).toBe('0.1.0');
    expect(body.timestamp).toBeDefined();
  });

  it('returns X-Request-Id header', async () => {
    const res = await app.request('/api/v1/health');
    expect(res.headers.get('x-request-id')).toBeDefined();
  });

  it('echoes provided X-Request-Id', async () => {
    const testId = 'test-req-123';
    const res = await app.request('/api/v1/health', {
      headers: { 'x-request-id': testId },
    });
    expect(res.headers.get('x-request-id')).toBe(testId);
  });
});
