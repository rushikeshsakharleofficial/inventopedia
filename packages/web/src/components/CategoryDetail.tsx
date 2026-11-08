import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { categorySchema, request } from '../lib/client.js';
import { Dialog } from './Dialog.js';
import { useGuardedNavigation, useUnsaved } from './Unsaved.js';

type Category = { id: string; name: string; parentId: string | null; sortOrder: number };
export function CategoryDetail({ token, base, category, categories, nextCursor, onBack }: { token: string; base: string; category: Category; categories: Category[]; nextCursor: string | null; onBack: () => void }) {
  const [name, setName] = useState(category.name);
  const [parent, setParent] = useState(category.parentId ?? '');
  const [order, setOrder] = useState(String(category.sortOrder));
  const [saved, setSaved] = useState({ name:category.name, parent:category.parentId ?? '', order:String(category.sortOrder) });
  const navigate = useGuardedNavigation();
  useUnsaved(name !== saved.name || parent !== saved.parent || order !== saved.order);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [options, setOptions] = useState(categories);
  const [cursor, setCursor] = useState(nextCursor);
  async function loadMore() {
    if (!cursor || busy) return; setBusy(true); setError('');
    try { const result = await request(token, `${base}/categories?limit=20&cursor=${encodeURIComponent(cursor)}`, z.array(categorySchema)); setOptions(current => [...current, ...result.data]); setCursor(result.pagination?.hasMore ? result.pagination.cursor : null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load categories.'); } finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    const sortOrder = Number(order);
    if (!name.trim() || !Number.isInteger(sortOrder) || sortOrder < -2147483648 || sortOrder > 2147483647) { setError('Enter a name and a whole-number sort order.'); return; }
    setError(''); setBusy(true);
    try { await request(token, `${base}/categories/${category.id}`, z.unknown(), { method: 'PATCH', body: JSON.stringify({ name: name.trim(), parentId: parent || null, sortOrder }) }); setName(name.trim()); setSaved({ name:name.trim(), parent, order }); setNotice('Category saved.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save category.'); } finally { setBusy(false); }
  }
  async function remove() {
    if (busy) return; setBusy(true); setError('');
    try { await request(token, `${base}/categories/${category.id}`, z.unknown(), { method: 'DELETE' }); onBack(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete category.'); } finally { setBusy(false); }
  }
  return <section className="content-card"><div className="card-heading"><div><button className="link-button back-link" onClick={() => navigate(onBack)}>← All categories</button><p className="eyebrow">CATEGORY</p><h2>{saved.name}</h2><p>Organise related items in your project.</p></div><button className="button secondary danger-text" onClick={() => setConfirm(true)}>Delete category</button></div><div className="detail-body">{error && <div className="notice error" role="alert">{error}</div>}{notice && <div className="notice success" role="status">{notice}</div>}<form noValidate className="form-stack" onSubmit={save}><label>Name<input value={name} onChange={e => setName(e.target.value)} maxLength={200} /></label><label>Parent category<select value={parent} onChange={e => setParent(e.target.value)}><option value="">No parent</option>{parent && !options.some(value => value.id === parent) && <option value={parent}>Current parent ({parent.slice(0, 8)})</option>}{options.filter(value => value.id !== category.id).map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>{cursor && <button type="button" className="button secondary" disabled={busy} onClick={() => void loadMore()}>Load more categories</button>}<label>Sort order<input type="number" step="1" value={order} onChange={e => setOrder(e.target.value)} /></label><div><button className="button primary" disabled={busy}>Save changes</button></div></form></div>
    {confirm && <Dialog titleId="delete-category-title" onClose={() => { if (!busy) setConfirm(false); }}><div className="modal-header"><div><p className="eyebrow">CONFIRM DELETION</p><h2 id="delete-category-title">Delete {category.name}?</h2></div></div><p className="form-help">Categories with child categories or items cannot be deleted.</p>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button autoFocus className="button secondary" onClick={() => setConfirm(false)}>Cancel</button><button className="button danger-button" disabled={busy} onClick={() => void remove()}>Delete category</button></div></Dialog>}
  </section>;
}
