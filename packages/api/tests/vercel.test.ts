import { describe, expect, it } from 'vitest';
import app from '../src/vercel.js';

describe('Vercel entry point', () => {
  it('serves the existing API route', async () => {
    const response = await app.request('/api/v1/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok', service: 'inventopedia-api' });
  });
});
