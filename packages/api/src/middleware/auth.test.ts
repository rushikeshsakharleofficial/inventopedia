import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware } from './auth.js';
import { createApp } from '../app.js';
import type { AppEnv } from '../types.js';

const { getUser, getSupabaseAdmin } = vi.hoisted(() => ({
  getUser: vi.fn(), getSupabaseAdmin: vi.fn(),
}));
vi.mock('../db/index.js', () => ({ getSupabaseAdmin }));

beforeEach(() => {
  vi.resetAllMocks();
  getSupabaseAdmin.mockReturnValue({ auth: { getUser } });
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

function protectedApp() {
  const app = new Hono<AppEnv>();
  app.use('*', authMiddleware());
  app.get('/', (c) => c.json({ user: c.get('user'), token: c.get('accessToken') }));
  return app;
}

describe('JWT validation', () => {
  it.each([undefined, 'Basic abc', 'Bearer ', 'Bearer token extra'])('rejects malformed credentials %s before auth lookup', async (authorization) => {
    const res = await protectedApp().request('/', { headers: authorization ? { authorization } : {} });
    expect(res.status).toBe(401);
    expect(getUser).not.toHaveBeenCalled();
  });

  it('validates the token with Supabase and allows users without email', async () => {
    const res = await protectedApp().request('/', { headers: { authorization: 'Bearer valid' } });
    expect(res.status).toBe(200);
    expect(getUser).toHaveBeenCalledWith('valid');
    expect(await res.json()).toEqual({ user: { id: 'user-1', email: null }, token: 'valid' });
  });

  it.each([
    { data: { user: null }, error: null },
    { data: { user: null }, error: { message: 'expired' } },
  ])('rejects invalid or expired tokens', async (response) => {
    getUser.mockResolvedValue(response);
    const res = await protectedApp().request('/', { headers: { authorization: 'Bearer expired' } });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'UNAUTHORIZED', requestId: 'unknown' });
  });

  it('returns the error envelope when the auth provider throws', async () => {
    getUser.mockRejectedValue(new Error('provider down'));
    const res = await protectedApp().request('/', { headers: { authorization: 'Bearer token' } });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('preserves downstream failures as 500 with the request ID', async () => {
    const app = createApp();
    app.get('/failure', authMiddleware(), () => { throw new Error('private database detail'); });
    const res = await app.request('/failure', { headers: { authorization: 'Bearer valid', 'X-Request-Id': 'test-request' } });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error', code: 'INTERNAL_ERROR', requestId: 'test-request' });
  });
});
