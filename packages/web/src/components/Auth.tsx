import { useRef, useState, type FormEvent } from 'react';
import { supabase } from '../lib/client.js';

export function Auth() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'reset'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || busy) return;
    if (!email.trim() || (mode !== 'reset' && !password)) { setError(mode === 'reset' ? 'Enter your email address.' : 'Enter your email and password.'); (!email.trim() ? emailRef : passwordRef).current?.focus(); return; }
    setError(''); setMessage(''); setBusy(true);
    try {
      if (mode === 'reset') {
        const result = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/` });
        if (result.error) throw result.error;
        setMessage('If an account exists for that email, a reset link has been sent.'); return;
      }
      const result = mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${window.location.origin}/` } });
      if (result.error) throw result.error;
      if (mode === 'sign-up' && !result.data.session) setMessage('Check your email for a confirmation link, then sign in.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to continue. Try again.'); }
    finally { setBusy(false); }
  }

  return <main className="auth-layout">
    <section className="auth-story" aria-label="About Inventopedia">
      <a className="brand brand-light" href="/"><span className="brand-mark">in<span>.</span></span><span>inventopedia<small>INVENTORY, IN ORDER</small></span></a>
      <div className="story-content"><span className="eyebrow light">YOUR INVENTORY WORKSPACE</span><h1>Everything in its right place.</h1><p>Keep your inventory clear, connected, and ready for whatever comes next.</p>
        <div className="story-label"><span className="barcode" aria-hidden="true" /><div><strong>Clarity at every step</strong><small>One place for your projects, items and movement.</small></div><span aria-hidden="true">↗</span></div>
      </div><div className="story-footer">BUILT FOR THE DETAILS <span>INVENTOPEDIA / WORKSPACE</span></div>
    </section>
    <section className="auth-panel"><div className="auth-inner"><div className="mobile-brand"><span className="brand-mark">in<span>.</span></span> inventopedia</div>
      <p className="eyebrow">WELCOME TO INVENTOPEDIA</p><h2>{mode === 'sign-in' ? 'Good to see you.' : mode === 'reset' ? 'Reset your password.' : 'Let’s get started.'}</h2><p className="subtle auth-intro">{mode === 'sign-in' ? 'Sign in to pick up where you left off.' : mode === 'reset' ? 'We’ll send you a link to choose a new password.' : 'Create an account to start organising your inventory.'}</p>
      {!supabase && <div className="notice warning" role="alert">Sign-in is unavailable. Contact your administrator.</div>}
      {error && <div id="auth-error" className="notice error" role="alert">{error}</div>}{message && <div className="notice success" role="status">{message}</div>}
      <form onSubmit={submit} noValidate className="form-stack"><label>Email address<input ref={emailRef} type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" aria-invalid={Boolean(error)} aria-describedby={error ? 'auth-error' : undefined} /></label>
        {mode !== 'reset' && <label>Password<span className="password-wrap"><input ref={passwordRef} type={visible ? 'text' : 'password'} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" aria-invalid={Boolean(error)} aria-describedby={error ? 'auth-error' : undefined} /><button type="button" className="reveal" onClick={() => setVisible(!visible)} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? 'Hide' : 'Show'}</button></span></label>}
        {mode === 'sign-in' && <button type="button" className="link-button forgot-link" onClick={() => { setMode('reset'); setError(''); setMessage(''); }}>Forgot password?</button>}
        <button className="button primary wide" disabled={busy || !supabase}>{busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : mode === 'reset' ? 'Send reset link' : 'Create account'} <span aria-hidden="true">→</span></button>
      </form>
      <p className="auth-switch">{mode === 'sign-in' ? 'New to Inventopedia?' : mode === 'reset' ? 'Remembered your password?' : 'Already have an account?'} <button className="link-button" onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setError(''); setMessage(''); }}>{mode === 'sign-in' ? 'Create an account' : 'Sign in'}</button></p>
      <p className="auth-footnote">A little more organised, every day.</p>
    </div></section>
  </main>;
}
