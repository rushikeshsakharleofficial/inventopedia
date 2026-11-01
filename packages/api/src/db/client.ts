import { createClient } from '@supabase/supabase-js';

function createControlClient(url: string, key: string, accessToken?: string) {
  return createClient(url, key, {
    db: { schema: 'control' },
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type ControlClient = ReturnType<typeof createControlClient>;
let supabaseAdmin: ControlClient | null = null;

/**
 * Get the Supabase admin client (service role).
 * Used for server-side operations that bypass RLS.
 */
export function getSupabaseAdmin(): ControlClient {
  if (!supabaseAdmin) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    supabaseAdmin = createControlClient(url, key);
  }
  return supabaseAdmin;
}

/**
 * Create a Supabase client scoped to a user's JWT.
 * RLS policies will apply based on the user's auth context.
 */
export function getSupabaseClient(accessToken: string): ControlClient {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  }
  return createControlClient(url, anonKey, accessToken);
}

