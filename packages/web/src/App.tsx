import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Auth } from './components/Auth.js';
import { Workspace } from './components/Workspace.js';
import { supabase } from './lib/client.js';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setLoading(false); });
    return () => subscription.unsubscribe();
  }, []);
  if (loading) return <main className="center-state" role="status">Opening Inventopedia…</main>;
  return session ? <Workspace session={session} /> : <Auth />;
}
