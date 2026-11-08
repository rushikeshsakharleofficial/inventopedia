import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { z } from 'zod';
import { orgSchema, projectSchema, request, supabase } from '../lib/client.js';
import { ProjectView, type Section } from './ProjectView.js';
import { Dialog } from './Dialog.js';

type Org = z.infer<typeof orgSchema>;
type Project = z.infer<typeof projectSchema>;
const navigation: { id: Section; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '◫' }, { id: 'items', label: 'Inventory', icon: '▧' },
  { id: 'categories', label: 'Categories', icon: '⊞' }, { id: 'templates', label: 'Templates', icon: '▤' },
  { id: 'movements', label: 'Stock movements', icon: '↗' },
];

export function Workspace({ session }: { session: Session }) {
  const token = session.access_token;
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsCursor, setProjectsCursor] = useState<string | null>(null);
  const [moreProjectsLoading, setMoreProjectsLoading] = useState(false);
  const [section, setSection] = useState<Section>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [create, setCreate] = useState<'organisation' | 'project' | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const activeOrg = useRef(orgId);
  activeOrg.current = orgId;
  const [projectSettings, setProjectSettings] = useState(false);
  const [confirmProject, setConfirmProject] = useState(false);
  const [projectName, setProjectName] = useState('');
  const loadOrgs = useCallback(async () => {
    const result = await request(token, '/organisations', z.array(orgSchema));
    setOrgs(result.data); setOrgId(current => result.data.some(org => org.id === current) ? current : result.data[0]?.id ?? '');
  }, [token]);
  useEffect(() => { let active = true; setLoading(true); loadOrgs().catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [loadOrgs]);
  useEffect(() => {
    if (!orgId) { setProjects([]); setProjectId(''); setProjectsCursor(null); setProjectsLoading(false); return; }
    let active = true; setProjects([]); setProjectId(''); setProjectsCursor(null); setProjectsLoading(true);
    request(token, `/organisations/${orgId}/projects?limit=100`, z.array(projectSchema))
      .then(result => { if (active) { setProjects(result.data); setProjectId(result.data[0]?.id ?? ''); setProjectsCursor(result.pagination?.hasMore ? result.pagination.cursor : null); } })
      .catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setProjectsLoading(false); });
    return () => { active = false; };
  }, [orgId, token]);
  async function loadMoreProjects() {
    if (!projectsCursor || moreProjectsLoading) return; setMoreProjectsLoading(true); setError('');
    const requestedOrg = orgId;
    try { const result = await request(token, `/organisations/${requestedOrg}/projects?limit=100&cursor=${encodeURIComponent(projectsCursor)}`, z.array(projectSchema)); if (activeOrg.current === requestedOrg) { setProjects(current => [...current, ...result.data]); setProjectsCursor(result.pagination?.hasMore ? result.pagination.cursor : null); } }
    catch (cause) { if (activeOrg.current === requestedOrg) setError(cause instanceof Error ? cause.message : 'Unable to load more projects.'); } finally { setMoreProjectsLoading(false); }
  }
  async function submitCreate(event: FormEvent) {
    event.preventDefault(); if (!create || busy) return;
    if (!name.trim() || (create === 'organisation' && !/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug))) { setError('Enter a name and a valid organisation slug (3–64 lowercase letters, numbers or hyphens).'); return; }
    setBusy(true); setError('');
    try {
      if (create === 'organisation') {
        const result = await request(token, '/organisations', orgSchema, { method: 'POST', body: JSON.stringify({ name: name.trim(), slug }) });
        await loadOrgs(); setOrgId(result.data.id);
      } else {
        const result = await request(token, `/organisations/${orgId}/projects`, projectSchema, { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
        setProjects(current => [...current, result.data]); setProjectId(result.data.id);
      }
      setCreate(null); setName(''); setSlug('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create. Try again.'); }
    finally { setBusy(false); }
  }
  async function saveProject(event: FormEvent) {
    event.preventDefault(); if (busy || !projectName.trim()) { if (!projectName.trim()) setError('Enter a project name.'); return; }
    setBusy(true); setError('');
    try { const result = await request(token, `/organisations/${orgId}/projects/${projectId}`, projectSchema, { method: 'PATCH', body: JSON.stringify({ name: projectName.trim() }) }); setProjects(current => current.map(value => value.id === projectId ? result.data : value)); setProjectSettings(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save project.'); } finally { setBusy(false); }
  }
  async function deleteProject() {
    if (busy) return; setBusy(true); setError('');
    try { await request(token, `/organisations/${orgId}/projects/${projectId}`, z.unknown(), { method: 'DELETE' }); const remaining = projects.filter(value => value.id !== projectId); setProjects(remaining); setProjectId(remaining[0]?.id ?? ''); setConfirmProject(false); setProjectSettings(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete project.'); } finally { setBusy(false); }
  }
  const org = orgs.find(value => value.id === orgId);
  const project = projects.find(value => value.id === projectId);
  return <div className="app-shell"><aside className="sidebar">
    <a className="brand" href="/"><span className="brand-mark">in<span>.</span></span><span>inventopedia<small>INVENTORY, IN ORDER</small></span></a>
    <div className="side-label">WORKSPACE</div><div className="scope-picker"><label htmlFor="org-select">Organisation</label><select id="org-select" value={orgId} onChange={e => setOrgId(e.target.value)} disabled={!orgs.length}><option value="" disabled>Select organisation</option>{orgs.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></div>
    <button className="side-add" onClick={() => { setError(''); setCreate('organisation'); }}>＋ <span>New organisation</span></button>
    <div className="side-label navigation-label">MANAGE</div><nav className="side-nav" aria-label="Main navigation">{navigation.map(entry => <button key={entry.id} className={section === entry.id ? 'nav-item active' : 'nav-item'} onClick={() => setSection(entry.id)} aria-current={section === entry.id ? 'page' : undefined}><span aria-hidden="true" className="nav-icon">{entry.icon}</span>{entry.label}{section === entry.id && <span className="nav-dot" />}</button>)}</nav>
    <div className="sidebar-bottom"><div className="side-note"><span className="side-note-icon">✳</span><strong>Room to grow.</strong><p>Keep every item and movement in one organised place.</p></div><div className="side-user"><span className="avatar">{session.user.email?.[0].toUpperCase() ?? 'U'}</span><div><strong>My account</strong><small title={session.user.email}>{session.user.email}</small></div><button onClick={() => void supabase?.auth.signOut()} aria-label="Sign out" title="Sign out">↪</button></div></div>
  </aside><div className="main-column"><header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span>/</span><strong>{org?.name ?? 'Your organisation'}</strong>{project && <><span>/</span><strong>{project.name}</strong></>}</div><div className="top-actions"><span className="status-pill"><i /> Workspace</span><span className="top-avatar">{session.user.email?.[0].toUpperCase() ?? 'U'}</span></div></header>
    <main className="main-content" id="main-content"><div className="page-heading"><div><div className="breadcrumb-label">{org?.name ?? 'YOUR WORKSPACE'} <span> / </span> {navigation.find(value => value.id === section)?.label.toUpperCase()}</div><h1>{section === 'overview' ? 'Your inventory, at a glance.' : navigation.find(value => value.id === section)?.label}</h1><p>{section === 'overview' ? 'A clearer picture of everything in your project.' : 'Keep the details that matter close at hand.'}</p></div><div className="project-select"><label htmlFor="project-select">CURRENT PROJECT</label><select id="project-select" value={projectId} onChange={e => setProjectId(e.target.value)} disabled={!projects.length}><option value="" disabled>Select a project</option>{projects.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select><button className="icon-button" onClick={() => { setError(''); setProjectName(project?.name ?? ''); setProjectSettings(true); }} disabled={!projectId} aria-label="Project settings" title="Project settings">⚙</button><button className="icon-button" onClick={() => { setError(''); setCreate('project'); }} disabled={!orgId} aria-label="Create project" title="Create project">＋</button></div></div>
    {projectsCursor && <button className="link-button more-projects" disabled={moreProjectsLoading} onClick={() => void loadMoreProjects()}>{moreProjectsLoading ? 'Loading projects…' : 'Load more projects'}</button>}{error && <div className="notice error" role="alert">{error}<button className="dismiss" onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
    {loading || projectsLoading ? <div className="empty-state" role="status">Loading your workspace…</div> : !orgId ? <div className="empty-state"><span className="empty-icon">◫</span><h2>Start with an organisation</h2><p>Bring your projects together in one workspace.</p><button className="button primary" onClick={() => setCreate('organisation')}>Create organisation <span>→</span></button></div> : !projectId ? <div className="empty-state"><span className="empty-icon">▧</span><h2>Create your first project</h2><p>Projects keep your inventory and activity organised.</p><button className="button primary" onClick={() => setCreate('project')}>Create project <span>→</span></button></div> : <ProjectView key={`${orgId}:${projectId}:${section}`} token={token} orgId={orgId} projectId={projectId} projectName={project?.name ?? 'Project'} section={section} onNavigate={setSection} />}
    </main><footer className="app-footer"><span>INVENTOPEDIA <span className="footer-dot">●</span> YOUR INVENTORY WORKSPACE</span><span>Made for the details.</span></footer></div>
    {create && <Dialog titleId="create-title" onClose={() => { if (!busy) setCreate(null); }}><div className="modal-header"><div><p className="eyebrow">GET ORGANISED</p><h2 id="create-title">New {create}</h2></div><button className="icon-button" aria-label="Close" onClick={() => setCreate(null)}>×</button></div><form noValidate onSubmit={submitCreate} className="form-stack"><label>Name<input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder={create === 'organisation' ? 'Your organisation' : 'Your project'} maxLength={200} /></label>{create === 'organisation' && <label>Organisation slug<input value={slug} onChange={e => setSlug(e.target.value)} placeholder="your-organisation" /><small>Lowercase letters, numbers and hyphens.</small></label>}{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={() => setCreate(null)}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Creating…' : `Create ${create}`}</button></div></form></Dialog>}
    {projectSettings && !confirmProject && <Dialog titleId="project-settings-title" onClose={() => { if (!busy) setProjectSettings(false); }}><div className="modal-header"><div><p className="eyebrow">YOUR WORKSPACE</p><h2 id="project-settings-title">Project settings</h2></div><button className="icon-button" aria-label="Close" onClick={() => setProjectSettings(false)}>×</button></div><form noValidate onSubmit={saveProject} className="form-stack"><label>Project name<input autoFocus value={projectName} onChange={e => setProjectName(e.target.value)} maxLength={200} /></label>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary danger-text" onClick={() => setConfirmProject(true)}>Delete project</button><button className="button primary" disabled={busy}>Save changes</button></div></form></Dialog>}
    {confirmProject && <Dialog titleId="delete-project-title" onClose={() => { if (!busy) setConfirmProject(false); }}><div className="modal-header"><div><p className="eyebrow">CONFIRM DELETION</p><h2 id="delete-project-title">Delete {project?.name}?</h2></div></div><p className="form-help">This permanently deletes an empty project. Projects with retained inventory cannot be deleted.</p>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button autoFocus className="button secondary" onClick={() => setConfirmProject(false)}>Cancel</button><button className="button danger-button" disabled={busy} onClick={() => void deleteProject()}>Delete project</button></div></Dialog>}
  </div>;
}
