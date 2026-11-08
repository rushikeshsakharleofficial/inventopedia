import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { request } from '../lib/client.js';
import { Dialog } from './Dialog.js';

type Category = { id: string; name: string; parentId: string | null; sortOrder: number };
export function CategoryDetail({ token, base, category, categories, onBack }: { token: string; base: string; category: Category; categories: Category[]; onBack: () => void }) {
  const [name, setName] = useState(category.name);
  const [parent, setParent] = useState(category.parentId ?? '');
  const [order, setOrder] = useState(String(category.sortOrder));
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    const sortOrder = Number(order);
    if (!name.trim() || !Number.isInteger(sortOrder) || sortOrder < -2147483648 || sortOrder > 2147483647) { setError('Enter a name and a whole-number sort order.'); return; }
    setError(''); setBusy(true);
    try { await request(token, `${base}/categories/${category.id}`, z.unknown(), { method: 'PATCH', body: JSON.stringify({ name: name.trim(), parentId: parent || null, sortOrder }) }); setNotice('Category saved.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save category.'); } finally { setBusy(false); }
  }
  async function remove() {
    if (busy) return; setBusy(true); setError('');
    try { await request(token, `${base}/categories/${category.id}`, z.unknown(), { method: 'DELETE' }); onBack(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete category.'); } finally { setBusy(false); }
  }
  return <section className="content-card"><div className="card-heading"><div><button className="link-button back-link" onClick={onBack}>← All categories</button><p className="eyebrow">CATEGORY</p><h2>{category.name}</h2><p>Organise related items in your project.</p></div><button className="button secondary danger-text" onClick={() => setConfirm(true)}>Delete category</button></div><div className="detail-body">{error && <div className="notice error" role="alert">{error}</div>}{notice && <div className="notice success" role="status">{notice}</div>}<form noValidate className="form-stack" onSubmit={save}><label>Name<input value={name} onChange={e => setName(e.target.value)} maxLength={200} /></label><label>Parent category<select value={parent} onChange={e => setParent(e.target.value)}><option value="">No parent</option>{categories.filter(value => value.id !== category.id).map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label><label>Sort order<input type="number" step="1" value={order} onChange={e => setOrder(e.target.value)} /></label><div><button className="button primary" disabled={busy}>Save changes</button></div></form></div>
    {confirm && <Dialog titleId="delete-category-title" onClose={() => { if (!busy) setConfirm(false); }}><div className="modal-header"><div><p className="eyebrow">CONFIRM DELETION</p><h2 id="delete-category-title">Delete {category.name}?</h2></div></div><p className="form-help">Categories with child categories or items cannot be deleted.</p>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button autoFocus className="button secondary" onClick={() => setConfirm(false)}>Cancel</button><button className="button danger-button" disabled={busy} onClick={() => void remove()}>Delete category</button></div></Dialog>}
  </section>;
}
