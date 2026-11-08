import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { categorySchema, dashboardSchema, itemSchema, request, RequestError } from '../lib/client.js';
import { Dialog } from './Dialog.js';
import { TemplateDetail } from './TemplateDetail.js';
import { ItemDetail } from './ItemDetail.js';
import { CategoryDetail } from './CategoryDetail.js';
import { useGuardedNavigation, useUnsaved } from './Unsaved.js';

export type Section = 'overview' | 'items' | 'categories' | 'templates' | 'movements' | 'audit';
type Row = Record<string, unknown>;
const rows = z.array(z.record(z.string(), z.unknown()));
const fieldsSchema = z.object({ schema: z.object({ fields: z.array(z.object({ key: z.string(), label: z.string(), type: z.string(), required: z.boolean(), options: z.array(z.string()).optional() })) }) });
const labels: Record<Exclude<Section, 'overview'>, string> = { items: 'item', categories: 'category', templates: 'template', movements: 'movement', audit: 'event' };
const paths: Record<Exclude<Section, 'overview'>, string> = { items: 'items', categories: 'categories', templates: 'templates', movements: 'stock/movements', audit: 'audit' };
const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '—';

export function ProjectView({ token, orgId, projectId, projectName, section, onNavigate }: { token: string; orgId: string; projectId: string; projectName: string; section: Section; onNavigate: (section: Section) => void }) {
  const base = `/organisations/${orgId}/projects/${projectId}`;
  const [data, setData] = useState<Row[]>([]);
  const [dashboard, setDashboard] = useState<z.infer<typeof dashboardSchema> | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [create, setCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [selected, setSelected] = useState('');
  const [type, setType] = useState('receive');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [choices, setChoices] = useState<Row[]>([]);
  const [choicesCursor, setChoicesCursor] = useState<string | null>(null);
  const [choicesLoading, setChoicesLoading] = useState(false);
  const [itemCategories, setItemCategories] = useState<Row[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [categoryCursor, setCategoryCursor] = useState<string | null>(null);
  const [template, setTemplate] = useState<{ id: string; name: string } | null>(null);
  const [item, setItem] = useState<z.infer<typeof itemSchema> | null>(null);
  const [category, setCategory] = useState<z.infer<typeof categorySchema> | null>(null);
  const [fields, setFields] = useState<z.infer<typeof fieldsSchema>['schema']['fields']>([]);
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldsReady, setFieldsReady] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [composing, setComposing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const navigate = useGuardedNavigation();
  useUnsaved(Boolean(create && (name || sku || selected || categoryId || reason || quantity !== '1' || type !== 'receive' || Object.keys(attributes).length)));

  const load = useCallback(async (next?: string) => {
    const currentRequest = ++requestId.current;
    setLoading(true); setError('');
    if (!next) { setData([]); setCursor(null); }
    try {
      if (section === 'overview') {
        const [summary, recent] = await Promise.all([request(token, `${base}/dashboard`, dashboardSchema), request(token, `${base}/items?limit=5`, rows)]);
        if (requestId.current === currentRequest) { setDashboard(summary.data); setData(recent.data); }
      } else {
        const result = await request(token, `${base}/${paths[section]}?limit=20${next ? `&cursor=${encodeURIComponent(next)}` : ''}${section === 'items' && query ? `&search=${encodeURIComponent(query)}` : ''}`, rows);
        if (requestId.current === currentRequest) { setData(current => next ? [...current, ...result.data] : result.data); setCursor(result.pagination?.hasMore ? result.pagination.cursor : null); }
      }
    } catch (cause) { if (requestId.current === currentRequest) setError(cause instanceof Error ? cause.message : 'Unable to load this project.'); }
    finally { if (requestId.current === currentRequest) setLoading(false); }
  }, [base, query, section, token]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (composing) return; const timer = window.setTimeout(() => setQuery(search.trim()), 300); return () => window.clearTimeout(timer); }, [search, composing]);
  useEffect(() => {
    if (section !== 'items' || !create || !selected) { setFields([]); setAttributes({}); setFieldsReady(false); return; }
    const choice = choices.find(value => value.currentVersionId === selected);
    if (!choice) return;
    let active = true; setFields([]); setAttributes({}); setFieldsLoading(true); setFieldsReady(false);
    request(token, `${base}/templates/${text(choice.id)}/versions/${selected}`, fieldsSchema)
      .then(result => { if (active) { setFields(result.data.schema.fields); setFieldsReady(true); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load template fields.'); })
      .finally(() => { if (active) setFieldsLoading(false); });
    return () => { active = false; };
  }, [base, choices, create, section, selected, token]);

  async function openCreate() {
    setError(''); setNotice(''); setName(''); setSku(''); setSelected(''); setCategoryId(''); setReason(''); setQuantity('1'); setType('receive'); if (section === 'movements') setReferenceId(crypto.randomUUID());
    if (section === 'items' || section === 'movements' || section === 'categories') {
      try { const result = await request(token, `${base}/${section === 'items' ? 'templates' : section === 'categories' ? 'categories' : 'items'}?limit=100`, rows); setChoices(result.data); setChoicesCursor(result.pagination?.hasMore ? result.pagination.cursor : null); if (section === 'items') { const categories = await request(token, `${base}/categories?limit=100`, rows); setItemCategories(categories.data); setCategoryCursor(categories.pagination?.hasMore ? categories.pagination.cursor : null); } }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load options.'); return; }
    }
    setCreate(true);
  }
  async function loadMoreChoices() {
    if (!choicesCursor || choicesLoading || section === 'overview' || section === 'templates') return;
    setChoicesLoading(true); setError('');
    try { const choicePath = section === 'items' ? 'templates' : section === 'categories' ? 'categories' : 'items'; const result = await request(token, `${base}/${choicePath}?limit=100&cursor=${encodeURIComponent(choicesCursor)}`, rows); setChoices(current => [...current, ...result.data]); setChoicesCursor(result.pagination?.hasMore ? result.pagination.cursor : null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load more options.'); } finally { setChoicesLoading(false); }
  }
  async function loadMoreCategories() {
    if (!categoryCursor || choicesLoading) return; setChoicesLoading(true);
    try { const result = await request(token, `${base}/categories?limit=100&cursor=${encodeURIComponent(categoryCursor)}`, rows); setItemCategories(current => [...current, ...result.data]); setCategoryCursor(result.pagination?.hasMore ? result.pagination.cursor : null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load categories.'); } finally { setChoicesLoading(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (section === 'overview' || busy) return;
    if ((section === 'items' || section === 'movements') && !selected) { setError(`Choose ${section === 'items' ? 'a published template' : 'an item'}.`); return; }
    if (section === 'items' && !fieldsReady) { setError('Wait for the template fields to load.'); return; }
    if (section !== 'movements' && !name.trim()) { setError('Enter a name.'); return; }
    if (section === 'movements' && (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0)) { setError('Enter a quantity greater than zero.'); return; }
    if (section === 'items' && fields.some(field => field.required && !attributes[field.key])) { setError('Complete the required template fields.'); return; }
    const itemAttributes = Object.fromEntries(fields.filter(field => attributes[field.key] !== undefined && attributes[field.key] !== '').map(field => [field.key, field.type === 'number' ? Number(attributes[field.key]) : field.type === 'boolean' ? attributes[field.key] === 'true' : attributes[field.key]]));
    if (section === 'items' && Object.values(itemAttributes).some(value => typeof value === 'number' && !Number.isFinite(value))) { setError('Enter a valid number for each number field.'); return; }
    const body = section === 'items' ? { name: name.trim(), templateVersionId: selected, ...(sku.trim() ? { sku: sku.trim() } : {}), ...(categoryId ? { categoryId } : {}), attributes: itemAttributes }
      : section === 'movements' ? { itemId: selected, type, quantity: Number(quantity), referenceId, ...(reason.trim() ? { reason: reason.trim() } : {}) }
      : section === 'categories' ? { name: name.trim(), parentId: selected || null } : { name: name.trim() };
    setBusy(true); setError('');
    try {
      await request(token, `${base}/${paths[section]}`, z.unknown(), { method: 'POST', body: JSON.stringify(body) });
      setCreate(false); setNotice(`${labels[section][0].toUpperCase()}${labels[section].slice(1)} created.`); await load();
    } catch (cause) {
      if (section === 'movements' && cause instanceof RequestError && cause.code === 'DUPLICATE_REFERENCE') setError('This movement may already have been recorded. Check movement history before recording another.');
      else if (section === 'movements' && (!(cause instanceof RequestError) || cause.status >= 500)) setError('The result is uncertain. Check movement history before recording another; retrying this form uses the same reference.');
      else setError(cause instanceof Error ? cause.message : 'Unable to save. Try again.');
    }
    finally { setBusy(false); }
  }

  if (template) return <TemplateDetail token={token} base={base} template={template} onBack={() => { setTemplate(null); void load(); }} />;
  if (item) return <ItemDetail token={token} base={base} item={item} onBack={() => { setItem(null); void load(); }} />;
  if (category) return <CategoryDetail token={token} base={base} category={category} categories={data.flatMap(row => { const parsed = categorySchema.safeParse(row); return parsed.success ? [parsed.data] : []; })} nextCursor={cursor} onBack={() => { setCategory(null); void load(); }} />;
  return <>
    {error && <div className="notice error" role="alert">{error}<button className="dismiss" aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}
    {notice && <div className="notice success" role="status">{notice}</div>}
    {section === 'overview' && <><div className="welcome-band"><div><span className="eyebrow light">YOUR PROJECT AT A GLANCE</span><h2>Good things are<br />well organised.</h2><p>Everything in <strong>{projectName}</strong>, in one place.</p><button className="button light-button" onClick={() => onNavigate('items')}>Explore inventory <span>→</span></button></div><div className="welcome-art" aria-hidden="true"><div className="art-grid"><span>INV.</span><strong>IN<br />ORDER</strong><small>YOUR SPACE FOR STOCK</small><div className="barcode" /></div></div></div>
      <div className="section-heading"><div><p className="eyebrow">THE BIG PICTURE</p><h2>Project overview</h2></div><span className="micro-label">LIVE PROJECT DATA</span></div>
      <div className="stat-grid">{[{ label: 'Total items', value: dashboard?.items, icon: '▧', sub: 'Across your inventory' }, { label: 'Categories', value: dashboard?.categories, icon: '⊞', sub: 'Ways to stay organised' }, { label: 'Templates', value: dashboard?.templates, icon: '▤', sub: 'Item structures' }, { label: 'Out of stock', value: dashboard?.outOfStockItems, icon: '◌', sub: 'Items at zero quantity' }].map(card => <article className="stat-card" key={card.label}><div className="stat-top"><span>{card.label}</span><span className="stat-icon">{card.icon}</span></div><strong>{loading ? '—' : card.value ?? '—'}</strong><small>{card.sub}</small></article>)}</div></>}
    <section className="content-card"><div className="card-heading"><div><p className="eyebrow">{section === 'overview' ? 'A CLOSER LOOK' : 'YOUR PROJECT'}</p><h2>{section === 'overview' ? 'Recent inventory' : section === 'items' ? 'All items' : section === 'categories' ? 'All categories' : section === 'templates' ? 'All templates' : section === 'audit' ? 'Activity history' : 'Movement history'}</h2><p>{section === 'overview' ? 'Your latest items, all in one place.' : section === 'audit' ? 'Recorded changes are visible to project administrators.' : 'Showing the records you have access to.'}</p></div>{section === 'overview' ? <button className="button secondary" onClick={() => onNavigate('items')}>View all <span>→</span></button> : section !== 'audit' && <button className="button primary" onClick={() => void openCreate()}>＋ {section === 'movements' ? 'Record movement' : `New ${labels[section]}`}</button>}</div>
      {section === 'items' && <div className="search-bar"><label htmlFor="item-search">Search inventory</label><div><input id="item-search" ref={searchRef} type="search" value={search} onChange={e => setSearch(e.target.value)} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onKeyDown={e => { if (e.key === 'Enter' && !composing) setQuery(search.trim()); }} placeholder="Search by name or SKU" />{search && <button type="button" aria-label="Clear search" onClick={() => { setSearch(''); setQuery(''); searchRef.current?.focus(); }}>×</button>}</div></div>}
      {loading && !data.length ? <div className="table-message" role="status">Loading records…</div> : !data.length ? <div className="table-message"><span className="empty-icon small">▧</span><strong>{error ? 'Unable to load records' : query ? 'No matching items' : 'Nothing here yet'}</strong><span>{error ? 'Check the message above and try again.' : query ? 'Try another name or SKU.' : section === 'overview' ? 'Items you add will appear here.' : section === 'audit' ? 'Recorded changes will appear here.' : `Add your first ${labels[section]} to get started.`}</span>{error && <button className="button secondary" onClick={() => void load()}>Retry</button>}</div> : <div className="table-scroll"><table><thead><tr>{section === 'movements' ? <><th>TYPE</th><th>ITEM</th><th>QUANTITY</th><th>DATE</th></> : section === 'audit' ? <><th>ACTION</th><th>ENTITY</th><th>REFERENCE</th><th>DATE</th></> : <><th>NAME</th><th>{section === 'items' || section === 'overview' ? 'SKU' : 'DETAILS'}</th><th>{section === 'items' || section === 'overview' ? 'QUANTITY' : 'STATUS'}</th><th>REFERENCE</th></>}</tr></thead><tbody>{data.map(row => <tr key={text(row.id)}>{section === 'movements' ? <><td><span className="table-icon">↗</span><strong className="capitalize">{text(row.type)}</strong></td><td className="mono">{text(row.itemId).slice(0, 8)}</td><td>{text(row.quantity)}</td><td>{typeof row.createdAt === 'string' ? new Date(row.createdAt).toLocaleDateString() : '—'}</td></> : section === 'audit' ? <><td className="capitalize">{text(row.action)}</td><td>{text(row.entity_type)}</td><td className="mono">{text(row.entity_id).slice(0, 8)}</td><td>{typeof row.created_at === 'string' ? new Date(row.created_at).toLocaleString() : '—'}</td></> : <><td><span className="table-icon">{section === 'categories' ? '⊞' : section === 'templates' ? '▤' : '▧'}</span><strong>{text(row.name)}</strong></td><td>{section === 'categories' ? text(row.path) : section === 'templates' ? text(row.description) : text(row.sku)}</td><td>{section === 'items' || section === 'overview' ? <span className="quantity">{text(row.quantity)} <small>units</small></span> : <span className="tag">{section === 'templates' ? row.currentVersionId ? 'Published' : 'Draft' : 'Active'}</span>}</td><td className="mono">{text(row.id).slice(0, 8)}</td></>}</tr>)}</tbody></table></div>}
      {(section === 'items' || section === 'overview') && data.length > 0 && <div className="template-actions"><span>View item</span>{data.map(row => <button key={text(row.id)} className="button secondary" onClick={() => { const result = itemSchema.safeParse(row); if (result.success) setItem(result.data); else setError('This item could not be displayed. Refresh and try again.'); }}>{text(row.name)} <span>→</span></button>)}</div>}
      {section === 'categories' && data.length > 0 && <div className="template-actions"><span>Manage category</span>{data.map(row => <button key={text(row.id)} className="button secondary" onClick={() => { const result = categorySchema.safeParse(row); if (result.success) setCategory(result.data); else setError('This category could not be displayed. Refresh and try again.'); }}>{text(row.name)} <span>→</span></button>)}</div>}
      {section === 'templates' && data.length > 0 && <div className="template-actions"><span>Manage versions</span>{data.map(row => <button key={text(row.id)} className="button secondary" onClick={() => setTemplate({ id: text(row.id), name: text(row.name) })}>{text(row.name)} <span>→</span></button>)}</div>}
      {cursor && <div className="table-footer"><span>Showing {data.length} records</span><button className="button secondary" disabled={loading} onClick={() => void load(cursor)}>{loading ? 'Loading…' : 'Load more'}</button></div>}
    </section>
    {create && section !== 'overview' && <Dialog titleId="record-title" onClose={() => { if (!busy) navigate(() => setCreate(false)); }}><div className="modal-header"><div><p className="eyebrow">{projectName.toUpperCase()}</p><h2 id="record-title">{section === 'movements' ? 'Record movement' : `New ${labels[section]}`}</h2></div><button className="icon-button" aria-label="Close" onClick={() => navigate(() => setCreate(false))}>×</button></div><form noValidate onSubmit={submit} className="form-stack">
      {section !== 'movements' && <label>Name<input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={200} placeholder={`Name your ${labels[section]}`} /></label>}
      {section === 'categories' && <label>Parent category<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">No parent</option>{choices.map(choice => <option key={text(choice.id)} value={text(choice.id)}>{text(choice.name)}</option>)}</select><small>Optional.</small></label>}
      {section === 'items' && <><label>Published template<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">Select a template</option>{choices.filter(choice => typeof choice.currentVersionId === 'string').map(choice => <option key={text(choice.id)} value={text(choice.currentVersionId)}>{text(choice.name)}</option>)}</select><small>Only published templates can be used for items.</small></label><label>SKU <small>Optional</small><input value={sku} onChange={e => setSku(e.target.value)} placeholder="e.g. PART-001" /></label>{fields.map(field => <label key={field.key}>{field.label} {field.required && <small>Required</small>}{field.type === 'select' || field.type === 'boolean' ? <select value={attributes[field.key] ?? ''} onChange={e => setAttributes(current => ({ ...current, [field.key]: e.target.value }))}><option value="">Select an option</option>{(field.type === 'boolean' ? ['true', 'false'] : field.options ?? []).map(option => <option key={option} value={option}>{option === 'true' ? 'Yes' : option === 'false' ? 'No' : option}</option>)}</select> : <input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} value={attributes[field.key] ?? ''} onChange={e => setAttributes(current => ({ ...current, [field.key]: e.target.value }))} />}</label>)}</>}
      {section === 'items' && <><label>Category <small>Optional</small><select value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">No category</option>{itemCategories.map(choice => <option key={text(choice.id)} value={text(choice.id)}>{text(choice.name)}</option>)}</select></label>{categoryCursor && <button type="button" className="button secondary" disabled={choicesLoading} onClick={() => void loadMoreCategories()}>Load more categories</button>}</>}
      {section === 'movements' && <><label>Item<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">Select an item</option>{choices.map(choice => <option key={text(choice.id)} value={text(choice.id)}>{text(choice.name)}</option>)}</select></label><label>Movement type<select value={type} onChange={e => setType(e.target.value)}><option value="receive">Receive</option><option value="ship">Ship</option><option value="adjust">Adjust (increase)</option><option value="transfer">Transfer (outbound)</option><option value="return">Return</option></select></label><label>Quantity<input type="number" min="0" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} /></label><label>Reason <small>Optional</small><input value={reason} onChange={e => setReason(e.target.value)} /></label></>}
      {choicesCursor && (section === 'items' || section === 'movements' || section === 'categories') && <button type="button" className="button secondary" disabled={choicesLoading} onClick={() => void loadMoreChoices()}>{choicesLoading ? 'Loading options…' : 'Load more options'}</button>}{fieldsLoading && section === 'items' && <p className="form-help" role="status">Loading template fields…</p>}{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={() => navigate(() => setCreate(false))}>Cancel</button><button className="button primary" disabled={busy || (section === 'items' && fieldsLoading)}>{busy ? 'Saving…' : section === 'movements' ? 'Record movement' : `Create ${labels[section]}`}</button></div></form></Dialog>}
  </>;
}
