import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { request, RequestError } from './client.js';

afterEach(() => vi.unstubAllGlobals());

describe('API client', () => {
  it('sends the caller token and validates the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: 'one', name: 'Tools' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await request('test-token', '/organisations', z.object({ id: z.string(), name: z.string() }));
    expect(result.data.name).toBe('Tools');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token');
  });
  it('surfaces the server error without exposing credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Not allowed', code: 'FORBIDDEN', requestId: 'request-1' }), { status: 403 })));
    await expect(request('test-token', '/organisations', z.array(z.unknown()))).rejects.toMatchObject({ message: 'Not allowed', status: 403, code: 'FORBIDDEN' } satisfies Partial<RequestError>);
  });
  it('rejects malformed success responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { name: 5 } }), { status: 200 })));
    await expect(request('test-token', '/organisations', z.object({ name: z.string() }))).rejects.toThrow();
  });
});
