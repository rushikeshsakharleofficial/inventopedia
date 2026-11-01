import { getSupabaseAdmin, getSupabaseClient } from '../db/index.js';
import type { Organisation, OrgMember, OrgRole } from '@inventopedia/shared';

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
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list organisations: ${error.message}`);
  }

  return (memberships || []).map((m: any) => ({
    ...mapOrg(m.organisations),
    userRole: m.role as OrgRole,
  }));
}

/**
 * Get a single organisation by ID (user must be a member).
 */
export async function getOrganisation(
  orgId: string,
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
    .single();

  if (error || !membership) {
    return null;
  }

  return {
    ...mapOrg((membership as any).organisations),
    userRole: (membership as any).role as OrgRole,
  };
}

/**
 * Get user's role in an organisation.
 */
export async function getUserOrgRole(
  orgId: string,
  userId: string
): Promise<OrgRole | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data.role as OrgRole;
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

function mapOrg(row: any): Organisation {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMember(row: any): OrgMember {
  return {
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    role: row.role,
    createdAt: row.created_at,
  };
}
