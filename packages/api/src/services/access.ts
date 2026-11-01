import { z } from 'zod';
import { getSupabaseClient } from '../db/index.js';
import type { OrgAccess, ProjectAccess } from '../types.js';

export const orgRoleSchema = z.enum(['owner', 'admin', 'member']);
export const projectRoleSchema = z.enum(['owner', 'admin', 'editor', 'viewer']);
const membershipSchema = z.object({ org_id: z.string().uuid(), role: orgRoleSchema });
const projectSchema = z.object({ id: z.string().uuid(), org_id: z.string().uuid() });

export async function resolveOrgAccess(
  orgId: string, userId: string, accessToken: string
): Promise<OrgAccess | null> {
  const { data, error } = await getSupabaseClient(accessToken)
    .from('org_members').select('org_id, role')
    .eq('org_id', orgId).eq('user_id', userId).maybeSingle();
  if (error) throw new Error('Failed to resolve organisation membership');
  if (!data) return null;
  const membership = membershipSchema.parse(data);
  return { id: membership.org_id, role: membership.role };
}

export async function resolveProjectAccess(
  projectId: string, userId: string, accessToken: string
): Promise<ProjectAccess | null> {
  const client = getSupabaseClient(accessToken);
  const { data, error } = await client.from('projects').select('id, org_id')
    .eq('id', projectId).maybeSingle();
  if (error) throw new Error('Failed to resolve project');
  if (!data) return null;
  const project = projectSchema.parse(data);
  const org = await resolveOrgAccess(project.org_id, userId, accessToken);
  if (!org) return null;
  if (org.role === 'owner' || org.role === 'admin') {
    return { id: project.id, orgId: org.id, role: org.role };
  }
  const { data: membership, error: memberError } = await client
    .from('project_members').select('role')
    .eq('project_id', projectId).eq('user_id', userId).maybeSingle();
  if (memberError) throw new Error('Failed to resolve project membership');
  if (!membership) return null;
  const { role } = z.object({ role: projectRoleSchema }).parse(membership);
  return { id: project.id, orgId: org.id, role };
}
