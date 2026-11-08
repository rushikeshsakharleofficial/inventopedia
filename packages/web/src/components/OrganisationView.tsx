import { useEffect, useState } from 'react';
import { z } from 'zod';
import { request, RequestError } from '../lib/client.js';

const member = z.object({ id: z.string(), userId: z.string(), role: z.string(), createdAt: z.string() });
const usage = z.object({ tier: z.string(), maxProjects: z.number().nullable(), projectsUsed: z.number(), projectsRemaining: z.number().nullable() });

export function OrganisationView({ token, orgId }: { token: string; orgId: string }) {
  const [members, setMembers] = useState<z.infer<typeof member>[]>([]);
  const [subscription, setSubscription] = useState<z.infer<typeof usage> | null>(null);
  const [usageDenied, setUsageDenied] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await request(token, `/organisations/${orgId}/members`, z.array(member));
        if (active) setMembers(result.data);
        try { const plan = await request(token, `/organisations/${orgId}/subscription`, usage); if (active) setSubscription(plan.data); }
        catch (cause) { if (active && cause instanceof RequestError && cause.status === 403) setUsageDenied(true); else throw cause; }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load organisation.'); }
      finally { if (active) setLoading(false); }
    }
    void load(); return () => { active = false; };
  }, [orgId, token]);
  return <><section className="content-card"><div className="card-heading"><div><p className="eyebrow">WORKSPACE ACCESS</p><h2>Organisation members</h2><p>People with access to this organisation.</p></div></div>{error && <div className="notice error" role="alert">{error}</div>}{loading ? <div className="table-message" role="status">Loading organisation…</div> : !members.length ? <div className="table-message">No members found.</div> : <div className="table-scroll"><table><thead><tr><th>MEMBER ID</th><th>ROLE</th><th>JOINED</th></tr></thead><tbody>{members.map(value => <tr key={value.id}><td className="mono">{value.userId}</td><td><span className="tag capitalize">{value.role}</span></td><td>{new Date(value.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}</section><section className="content-card"><div className="card-heading"><div><p className="eyebrow">YOUR PLAN</p><h2>Project usage</h2><p>Limits apply across the organisation.</p></div></div><div className="detail-body">{subscription ? <p className="form-help"><strong className="capitalize">{subscription.tier}</strong> · {subscription.projectsUsed} of {subscription.maxProjects ?? 'unlimited'} projects used{subscription.projectsRemaining !== null ? ` · ${subscription.projectsRemaining} remaining` : ''}</p> : <p className="form-help">{usageDenied ? 'Project usage is available to organisation owners and admins.' : loading ? 'Loading usage…' : 'Usage is currently unavailable.'}</p>}</div></section></>;
}
