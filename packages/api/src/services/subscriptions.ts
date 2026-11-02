import { z } from 'zod';
import { getSupabaseClient } from '../db/index.js';
import { TIER_LIMITS } from '@inventopedia/shared';

const subscriptionRowSchema = z.object({
  tier: z.enum(['free', 'starter', 'business', 'enterprise']),
  max_projects: z.number().int().nonnegative().nullable(),
}).refine((row) => row.tier === 'enterprise' || row.max_projects === TIER_LIMITS[row.tier].maxProjects,
  'Invalid tier limit');

export async function getSubscriptionUsage(orgId: string, accessToken: string) {
  const client = getSupabaseClient(accessToken);
  const { data, error } = await client.from('subscriptions').select('tier, max_projects')
    .eq('org_id', orgId).maybeSingle();
  if (error) throw new Error('Failed to fetch subscription');
  const subscription = subscriptionRowSchema.parse(data);
  // Only org owner/admin routes call this: RLS gives those roles all org projects.
  const { count, error: countError } = await client.from('projects')
    .select('id', { count: 'exact', head: true }).eq('org_id', orgId);
  if (countError) throw new Error('Failed to count projects');
  const used = z.number().int().nonnegative().parse(count);
  return {
    tier: subscription.tier, maxProjects: subscription.max_projects, projectsUsed: used,
    projectsRemaining: subscription.max_projects === null ? null : Math.max(0, subscription.max_projects - used),
  };
}
