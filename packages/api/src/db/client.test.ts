import { beforeEach, expect, it, vi } from 'vitest';

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn(() => ({})) }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
});

it('selects control schema for admin and caller JWT clients without sharing JWT state', async () => {
  const { getSupabaseAdmin, getSupabaseClient } = await import('./client.js');
  getSupabaseAdmin();
  getSupabaseClient('alice');
  getSupabaseClient('bob');
  expect(createClient).toHaveBeenNthCalledWith(1, 'https://example.supabase.co', 'service', expect.objectContaining({ db: { schema: 'control' } }));
  for (const [index, token] of [[2, 'alice'], [3, 'bob']] as const) {
    expect(createClient).toHaveBeenNthCalledWith(index, 'https://example.supabase.co', 'anon', expect.objectContaining({
      db: { schema: 'control' }, global: { headers: { Authorization: `Bearer ${token}` } },
    }));
  }
});
