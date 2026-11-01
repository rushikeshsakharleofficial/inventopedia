import { getSupabaseAdmin, getSupabaseClient } from '../db/index.js';
import { z } from 'zod';
import { orgRoleSchema, resolveOrgAccess } from './access.js';
import type { Organisation, OrgMember, OrgRole } from '@shared/types/entities.js';

const orgRowSchema = z.object({
  id: z.string().uuid(), name: z.string(), slug: z.string(),
  created_at: z.string(), updated_at: z.string(),
});
const orgWithRoleSchema = z.object({ role: orgRoleSchema, organisations: orgRowSchema });
const memberRowSchema = z.object({
  id: z.string().uuid(), org_id: z.string().uuid(), user_id: z.string().uuid(),
  role: orgRoleSchema, created_at: z.string(),
});

export interface CreateOrgInput {
  name: string;
  slug: string;
}

export interface OrgWithRole extends Organisation {
  userRole: OrgRole;
}

/**
 * Create a new organisation with the given user as owner.
 * Uses the admin client to call the control.create_organisation function.
 */
export async function createOrganisation(
  input: CreateOrgInput,
  userId: string
): Promise<Organisation> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc('create_organisation', {
    p_name: input.name,
    p_slug: input.slug,
    p_user_id: userId,
  });

  if (error) {
    if (error.code === '23505') {
      throw Object.assign(new Error('Organisation slug already exists'), {
        status: 409,
        code: 'SLUG_CONFLICT',
      });
    }
    throw new Error(`Failed to create organisation: ${error.message}`);
  }

  // Fetch the created organisation
  const { data: org, error: fetchError } = await supabase
    .from('organisations')
    .select('*')
    .eq('id', data)
    .single();

  if (fetchError || !org) {
    throw new Error('Organisation created but could not be fetched');
  }

  return mapOrg(org);
}

/**
 * List organisations the user belongs to.
 */
export async function listUserOrganisations(
  userId: string,
  accessToken: string
): Promise<OrgWithRole[]> {
  const supabase = getSupabaseClient(accessToken);

  const { data: memberships, error } = await supabase
    .from('org_members')
    .select(`
      role,
      organisations:org_id (
        id, name, slug, created_at, updated_at
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list organisations: ${error.message}`);
  }

  return z.array(orgWithRoleSchema).parse(memberships ?? []).map((m) => ({
    ...mapOrg(m.organisations),
    userRole: m.role,
  }));
}

/**
 * Get a single organisation by ID (user must be a member).
 */
export async function getOrganisation(
  orgId: string,
  userId: string,
  accessToken: string
): Promise<OrgWithRole | null> {
  const supabase = getSupabaseClient(accessToken);

  const { data: membership, error } = await supabase
    .from('org_members')
    .select(`
      role,
      organisations:org_id (
        id, name, slug, created_at, updated_at
      )
    `)
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error('Failed to fetch organisation');
  if (!membership) return null;
  const parsed = orgWithRoleSchema.parse(membership);

  return {
    ...mapOrg(parsed.organisations),
    userRole: parsed.role,
  };
}

/**
 * Get user's role in an organisation.
 */
export async function getUserOrgRole(
  orgId: string,
  userId: string,
  accessToken: string
): Promise<OrgRole | null> {
  return (await resolveOrgAccess(orgId, userId, accessToken))?.role ?? null;
}

/**
 * List members of an organisation.
 */
export async function listOrgMembers(
  orgId: string,
  accessToken: string
): Promise<OrgMember[]> {
  const supabase = getSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from('org_members')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to list org members: ${error.message}`);
  }

  return (data || []).map(mapMember);
}

// ---- Mappers ----

function mapOrg(value: unknown): Organisation {
  const row = orgRowSchema.parse(value);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMember(value: unknown): OrgMember {
  const row = memberRowSchema.parse(value);
  return {
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    role: row.role,
    createdAt: row.created_at,
  };
}

