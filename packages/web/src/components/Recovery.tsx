import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/client.js';

export function Recovery({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!supabase || busy) return;
    if (!password || password !== confirm) { setError('Enter matching passwords.'); return; }
    setBusy(true); setError('');
    try { const result = await supabase.auth.updateUser({ password }); if (result.error) throw result.error; onDone(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update your password.'); }
    finally { setBusy(false); }
  }
  return <main className="auth-panel recovery-panel"><div className="auth-inner"><a className="brand recovery-brand" href="/"><span className="brand-mark">in<span>.</span></span><span>inventopedia<small>INVENTORY, IN ORDER</small></span></a><p className="eyebrow">ACCOUNT RECOVERY</p><h2>Choose a new password.</h2><p className="subtle auth-intro">Enter a new password for your account.</p>{error && <div className="notice error" role="alert">{error}</div>}<form noValidate className="form-stack" onSubmit={submit}><label>New password<span className="password-wrap"><input type={visible ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /><button type="button" className="reveal" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Show'}</button></span></label><label>Confirm password<input type={visible ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></label><button className="button primary wide" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button></form></div></main>;
}
