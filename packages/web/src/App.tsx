import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Auth } from './components/Auth.js';
import { Workspace } from './components/Workspace.js';
import { supabase } from './lib/client.js';
import { UnsavedProvider } from './components/Unsaved.js';
import { Recovery } from './components/Recovery.js';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [recovering, setRecovering] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => { if (event === 'PASSWORD_RECOVERY') setRecovering(true); if (event === 'SIGNED_OUT') setRecovering(false); setSession(next); setLoading(false); });
    return () => subscription.unsubscribe();
  }, []);
  if (loading) return <main className="center-state" role="status">Opening Inventopedia…</main>;
  if (recovering && session) return <Recovery onDone={() => setRecovering(false)} />;
  return session ? <UnsavedProvider><Workspace session={session} /></UnsavedProvider> : <Auth />;
}
