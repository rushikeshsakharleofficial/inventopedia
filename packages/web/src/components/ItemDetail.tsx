import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { request, supabase } from '../lib/client.js';
import { Dialog } from './Dialog.js';

const attachment = z.object({ id: z.string(), filename: z.string(), created_at: z.string() });
const reservation = attachment.extend({ bucket: z.string(), path: z.string() });
type Item = { id: string; name: string; sku: string | null; quantity: number; attributes: Record<string, unknown> };
type Pending = { file: File; reservation: z.infer<typeof reservation> };

export function ItemDetail({ token, base, item, onBack }: { token: string; base: string; item: Item; onBack: () => void }) {
  const [name, setName] = useState(item.name);
  const [sku, setSku] = useState(item.sku ?? '');
  const [files, setFiles] = useState<z.infer<typeof attachment>[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: 'item' | 'attachment'; id: string; name: string } | null>(null);
  const [download, setDownload] = useState<{ name: string; url: string } | null>(null);
  const path = `${base}/items/${item.id}`;
  const load = useCallback(async (next?: string) => {
    setLoading(true);
    try { const result = await request(token, `${path}/attachments?limit=20${next ? `&cursor=${encodeURIComponent(next)}` : ''}`, z.array(attachment)); setFiles(current => next ? [...current, ...result.data] : result.data); setCursor(result.pagination?.hasMore ? result.pagination.cursor : null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load attachments.'); }
    finally { setLoading(false); }
  }, [path, token]);
  useEffect(() => { void load(); }, [load]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    if (!name.trim()) { setError('Enter an item name.'); return; }
    setBusy(true); setError('');
    try { await request(token, path, z.unknown(), { method: 'PATCH', body: JSON.stringify({ name: name.trim(), sku: sku.trim() || null }) }); setNotice('Item saved.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save item.'); }
    finally { setBusy(false); }
  }
  async function upload(file: File, existing?: z.infer<typeof reservation>) {
    if (!supabase || busy) return; setBusy(true); setError(''); setNotice('');
    let reserved = existing;
    try {
      reserved = existing ?? (await request(token, `${path}/attachments`, reservation, { method: 'POST', body: JSON.stringify({ filename: file.name }) })).data;
      setPending({ file, reservation: reserved });
      const result = await supabase.storage.from(reserved.bucket).upload(reserved.path, file, { upsert: false });
      if (result.error) throw result.error;
      setPending(null); setNotice('Attachment uploaded.'); await load();
    } catch (cause) { const message = cause instanceof Error ? cause.message : 'Upload failed.'; setError(reserved ? `${message} You can retry the upload below.` : message); }
    finally { setBusy(false); }
  }
  async function getDownload(file: z.infer<typeof attachment>) {
    setBusy(true); setError(''); setDownload(null);
    try { const result = await request(token, `${path}/attachments/${file.id}/download`, z.object({ signedUrl: z.string().url() })); setDownload({ name: file.filename, url: result.data.signedUrl }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to prepare download.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm || busy) return; setBusy(true); setError('');
    try { await request(token, confirm.kind === 'item' ? path : `${path}/attachments/${confirm.id}`, z.unknown(), { method: 'DELETE' }); const kind = confirm.kind; setConfirm(null); if (kind === 'item') onBack(); else { setNotice('Attachment deleted.'); await load(); } }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete. Try again.'); }
    finally { setBusy(false); }
  }
  return <section className="content-card"><div className="card-heading"><div><button className="link-button back-link" onClick={onBack}>← All items</button><p className="eyebrow">ITEM DETAILS</p><h2>{item.name}</h2><p>Quantity: {item.quantity} · Reference {item.id.slice(0, 8)}</p></div><button className="button secondary danger-text" onClick={() => setConfirm({ kind:'item', id:item.id, name:item.name })}>Delete item</button></div>
    <div className="detail-body">{error && <div className="notice error" role="alert">{error}</div>}{notice && <div className="notice success" role="status">{notice}</div>}
      <form noValidate onSubmit={save} className="form-stack"><h3>Item information</h3><label>Name<input value={name} onChange={e => setName(e.target.value)} maxLength={200} /></label><label>SKU <small>Optional</small><input value={sku} onChange={e => setSku(e.target.value)} maxLength={200} /></label><div><button className="button primary" disabled={busy}>Save changes</button></div></form>
      {Object.keys(item.attributes).length > 0 && <div className="detail-section"><h3>Custom fields</h3><dl className="attributes">{Object.entries(item.attributes).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl></div>}
      <div className="detail-section"><div className="section-heading"><div><p className="eyebrow">KEEP THE DETAILS TOGETHER</p><h2>Attachments</h2></div><label className="button secondary upload-label">＋ Upload file<input type="file" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ''; }} /></label></div><p className="form-help">Files are private to project members. Uploads may leave a reservation if they fail.</p>
        {pending && <div className="notice warning">Upload incomplete: {pending.file.name} <button className="link-button" disabled={busy} onClick={() => void upload(pending.file, pending.reservation)}>Retry upload</button></div>}
        {download && <div className="notice success"><a href={download.url} rel="noreferrer" target="_blank">Download {download.name} ↗</a> <small>Link expires shortly.</small></div>}
        {loading ? <p role="status" className="form-help">Loading attachments…</p> : !files.length ? <p className="form-help">No attachments yet.</p> : <ul className="file-list">{files.map(file => <li key={file.id}><span>▤ <strong>{file.filename}</strong></span><div><button className="link-button" disabled={busy} onClick={() => void getDownload(file)}>Download</button><button className="link-button danger-text" disabled={busy} onClick={() => setConfirm({ kind:'attachment', id:file.id, name:file.filename })}>Delete</button></div></li>)}</ul>}{cursor && <button className="button secondary" disabled={loading} onClick={() => void load(cursor)}>Load more</button>}
      </div></div>
    {confirm && <Dialog titleId="delete-title" onClose={() => { if (!busy) setConfirm(null); }}><div className="modal-header"><div><p className="eyebrow">CONFIRM DELETION</p><h2 id="delete-title">Delete {confirm.name}?</h2></div></div><p className="form-help">{confirm.kind === 'item' ? 'Items with retained stock movements or attachments cannot be deleted.' : 'The attachment will be removed. Previously issued download links may remain valid briefly.'}</p>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button autoFocus className="button secondary" onClick={() => setConfirm(null)}>Cancel</button><button className="button danger-button" disabled={busy} onClick={() => void remove()}>{busy ? 'Deleting…' : 'Delete'}</button></div></Dialog>}
  </section>;
}
