import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { request } from '../lib/client.js';
import { Dialog } from './Dialog.js';

const versionSchema = z.object({ id: z.string(), version: z.number(), publishedAt: z.string().nullable(), schema: z.object({ fields: z.array(z.object({ key: z.string(), label: z.string(), type: z.string(), required: z.boolean(), options: z.array(z.string()).optional() })) }) });
type Field = { key: string; label: string; type: string; required: boolean; options: string };
const emptyField = (): Field => ({ key: '', label: '', type: 'text', required: false, options: '' });

export function TemplateDetail({ token, base, template, onBack }: { token: string; base: string; template: { id: string; name: string }; onBack: () => void }) {
  const [versions, setVersions] = useState<z.infer<typeof versionSchema>[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ kind: 'template' | 'version'; id: string } | null>(null);
  const [templateName, setTemplateName] = useState(template.name);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const path = `${base}/templates/${template.id}/versions`;
  const load = useCallback(async () => { setLoading(true); try { const result = await request(token, `${path}?limit=100`, z.array(versionSchema)); setVersions(result.data); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load versions.'); } finally { setLoading(false); } }, [path, token]);
  useEffect(() => { void load(); }, [load]);
  function update(index: number, patch: Partial<Field>) { setFields(current => current.map((field, i) => i === index ? { ...field, ...patch } : field)); }
  async function createVersion(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    const keys = fields.map(field => field.key);
    if (fields.some(field => !/^[a-z][a-z0-9_]{0,63}$/.test(field.key) || ['constructor', 'prototype', '__proto__'].includes(field.key) || !field.label.trim() || (field.type === 'select' && !field.options.trim())) || new Set(keys).size !== keys.length) { setError('Give each field a unique lowercase key and label. Select fields need options.'); return; }
    setBusy(true); setError('');
    try {
      const schema = { fields: fields.map(field => ({ key: field.key, label: field.label.trim(), type: field.type, required: field.required, ...(field.type === 'select' ? { options: field.options.split(',').map(option => option.trim()).filter(Boolean) } : {}) })) };
      await request(token, path, versionSchema, { method: 'POST', body: JSON.stringify({ schema }) });
      setCreating(false); setFields([]); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create version.'); } finally { setBusy(false); }
  }
  async function publish() {
    if (!publishing || busy) return; setBusy(true); setError('');
    try { await request(token, `${path}/${publishing}/publish`, versionSchema, { method: 'POST' }); setPublishing(null); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to publish.'); } finally { setBusy(false); }
  }
  async function saveTemplate(event: FormEvent) {
    event.preventDefault(); if (busy || !templateName.trim()) { if (!templateName.trim()) setError('Enter a template name.'); return; }
    setBusy(true); setError('');
    try { await request(token, `${base}/templates/${template.id}`, z.unknown(), { method: 'PATCH', body: JSON.stringify({ name: templateName.trim() }) }); setNotice('Template saved.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save template.'); } finally { setBusy(false); }
  }
  async function remove() {
    if (!confirmDelete || busy) return; setBusy(true); setError('');
    try { await request(token, confirmDelete.kind === 'template' ? `${base}/templates/${template.id}` : `${path}/${confirmDelete.id}`, z.unknown(), { method: 'DELETE' }); const kind = confirmDelete.kind; setConfirmDelete(null); if (kind === 'template') onBack(); else { setNotice('Draft deleted.'); await load(); } }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete.'); } finally { setBusy(false); }
  }
  return <section className="content-card"><div className="card-heading"><div><button className="link-button back-link" onClick={onBack}>← All templates</button><p className="eyebrow">TEMPLATE</p><h2>{template.name}</h2><p>Create a version, then publish it to use this template for items.</p></div><button className="button primary" onClick={() => { setError(''); setCreating(true); }}>＋ New version</button></div>
    {error && <div className="notice error" role="alert">{error}</div>}{notice && <div className="notice success" role="status">{notice}</div>}
    <form noValidate className="template-settings" onSubmit={saveTemplate}><label>Template name<input value={templateName} onChange={e => setTemplateName(e.target.value)} maxLength={200} /></label><button className="button secondary" disabled={busy}>Save name</button><button type="button" className="button secondary danger-text" onClick={() => setConfirmDelete({ kind:'template', id:template.id })}>Delete template</button></form>
    {loading ? <div className="table-message" role="status">Loading versions…</div> : !versions.length ? <div className="table-message"><strong>No versions yet</strong><span>Create a version to define the fields for this template.</span></div> : <div className="version-list">{versions.map(version => <article className="version-card" key={version.id}><div><strong>Version {version.version}</strong><p>{version.schema.fields.length} {version.schema.fields.length === 1 ? 'field' : 'fields'} · {version.publishedAt ? 'Published' : 'Draft'}</p><div className="field-tags">{version.schema.fields.map(field => <span className="tag" key={field.key}>{field.label} · {field.type}</span>)}</div></div>{!version.publishedAt && <div className="version-actions"><button className="button secondary" onClick={() => setPublishing(version.id)}>Publish version</button><button className="button secondary danger-text" onClick={() => setConfirmDelete({ kind:'version', id:version.id })}>Delete draft</button></div>}</article>)}</div>}
    {creating && <Dialog titleId="version-title" onClose={() => { if (!busy) setCreating(false); }}><div className="modal-header"><div><p className="eyebrow">{template.name}</p><h2 id="version-title">New template version</h2></div><button className="icon-button" aria-label="Close" onClick={() => setCreating(false)}>×</button></div><form onSubmit={createVersion} noValidate className="form-stack"><p className="form-help">Define the information you want to keep for each item. You can also create a version with no custom fields.</p>{fields.map((field, index) => <fieldset className="field-block" key={index}><legend>Field {index + 1}</legend><label>Label<input value={field.label} onChange={e => update(index, { label: e.target.value })} placeholder="e.g. Colour" /></label><label>Key<input value={field.key} onChange={e => update(index, { key: e.target.value })} placeholder="e.g. colour" /><small>Lowercase letters, numbers and underscores.</small></label><label>Type<select value={field.type} onChange={e => update(index, { type: e.target.value })}><option value="text">Text</option><option value="number">Number</option><option value="boolean">Yes / no</option><option value="date">Date</option><option value="select">Select</option></select></label>{field.type === 'select' && <label>Options<input value={field.options} onChange={e => update(index, { options: e.target.value })} placeholder="Small, Medium, Large" /><small>Separate options with commas.</small></label>}<label className="check-label"><input type="checkbox" checked={field.required} onChange={e => update(index, { required: e.target.checked })} /> Required field</label><button type="button" className="link-button danger-text" onClick={() => setFields(current => current.filter((_, i) => i !== index))}>Remove field</button></fieldset>)}<button type="button" className="button secondary" onClick={() => setFields(current => [...current, emptyField()])}>＋ Add field</button>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={() => setCreating(false)}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Creating…' : 'Create draft'}</button></div></form></Dialog>}
    {publishing && <Dialog titleId="publish-title" onClose={() => { if (!busy) setPublishing(null); }}><div className="modal-header"><div><p className="eyebrow">TEMPLATE VERSION</p><h2 id="publish-title">Publish this version?</h2></div></div><p className="form-help">This version becomes available for new items. Published versions cannot be edited or deleted.</p>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button autoFocus className="button secondary" onClick={() => setPublishing(null)}>Cancel</button><button className="button primary" disabled={busy} onClick={() => void publish()}>{busy ? 'Publishing…' : 'Publish version'}</button></div></Dialog>}
    {confirmDelete && <Dialog titleId="delete-template-title" onClose={() => { if (!busy) setConfirmDelete(null); }}><div className="modal-header"><div><p className="eyebrow">CONFIRM DELETION</p><h2 id="delete-template-title">Delete {confirmDelete.kind === 'template' ? template.name : 'draft version'}?</h2></div></div><p className="form-help">{confirmDelete.kind === 'template' ? 'Templates with retained versions cannot be deleted.' : 'This draft version will be permanently deleted.'}</p>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button autoFocus className="button secondary" onClick={() => setConfirmDelete(null)}>Cancel</button><button className="button danger-button" disabled={busy} onClick={() => void remove()}>Delete</button></div></Dialog>}
  </section>;
}
