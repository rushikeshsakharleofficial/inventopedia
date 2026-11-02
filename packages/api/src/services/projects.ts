import { z } from 'zod';
import type { Project } from '@shared/types/entities.js';
import { getSupabaseAdmin, getSupabaseClient } from '../db/index.js';

const projectRowSchema = z.object({
  id: z.string().uuid(), org_id: z.string().uuid(), name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  created_at: z.string().datetime({ offset: true }), updated_at: z.string().datetime({ offset: true }),
});
const nameSchema = z.string().trim().min(1).max(200);
const descriptionSchema = z.string().max(2000).nullable();
export const createProjectSchema = z.object({ name: nameSchema, description: descriptionSchema.optional() }).strict();
export const updateProjectSchema = createProjectSchema.partial()
  .refine((value) => value.name !== undefined || value.description !== undefined, 'At least one setting is required');

const cursorSchema = z.string().max(100).regex(/^[A-Za-z0-9_-]+$/).transform((value, ctx) => {
  const decoded = Buffer.from(value, 'base64url').toString('utf8');
  if (!z.string().uuid().safeParse(decoded).success || Buffer.from(decoded).toString('base64url') !== value) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid cursor' });
    return z.NEVER;
  }
  return decoded.toLowerCase();
});
export const projectQuerySchema = z.object({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ProjectQuery = z.infer<typeof projectQuerySchema>;

function mapProject(value: unknown): Project {
  const row = projectRowSchema.parse(value);
  return { id: row.id, orgId: row.org_id, name: row.name, description: row.description,
    createdAt: row.created_at, updatedAt: row.updated_at };
}

function notFound(): never {
  throw Object.assign(new Error('Project not found'), { status: 404, code: 'NOT_FOUND' });
}

export async function createProject(
  orgId: string, input: CreateProjectInput, userId: string, accessToken: string
): Promise<Project> {
  const { data, error } = await getSupabaseAdmin().rpc('create_project', {
    p_org_id: orgId, p_name: input.name, p_description: input.description ?? null, p_user_id: userId,
  });
  if (error?.code === 'P0003') {
    throw Object.assign(new Error('Organisation project limit reached'), { status: 409, code: 'PROJECT_QUOTA_EXCEEDED' });
  }
  if (error?.code === '42501') {
    throw Object.assign(new Error('Insufficient organisation permissions'), { status: 403, code: 'FORBIDDEN' });
  }
  if (error) throw new Error('Failed to create project');
  const id = z.string().uuid().parse(data);
  return getProject(orgId, id, accessToken);
}

export async function listProjects(orgId: string, query: ProjectQuery, accessToken: string) {
  let builder = getSupabaseClient(accessToken).from('projects').select('*')
    .eq('org_id', orgId).order('id', { ascending: true }).limit(query.limit + 1);
  if (query.cursor) builder = builder.gt('id', query.cursor);
  const { data, error } = await builder;
  if (error) throw new Error('Failed to list projects');
  const rows = z.array(projectRowSchema).parse(data);
  const hasMore = rows.length > query.limit;
  const page = rows.slice(0, query.limit);
  return { data: page.map(mapProject), pagination: {
    cursor: hasMore ? Buffer.from(page[page.length - 1].id).toString('base64url') : null, hasMore,
  } };
}

export async function getProject(orgId: string, projectId: string, accessToken: string): Promise<Project> {
  const { data, error } = await getSupabaseClient(accessToken).from('projects').select('*')
    .eq('org_id', orgId).eq('id', projectId).maybeSingle();
  if (error) throw new Error('Failed to fetch project');
  if (!data) notFound();
  return mapProject(data);
}

export async function updateProject(
  orgId: string, projectId: string, input: UpdateProjectInput, accessToken: string
): Promise<Project> {
  const { data, error } = await getSupabaseClient(accessToken).from('projects').update(input)
    .eq('org_id', orgId).eq('id', projectId).select('*').maybeSingle();
  if (error) throw new Error('Failed to update project');
  if (!data) notFound();
  return mapProject(data);
}

export async function deleteProject(orgId: string, projectId: string, accessToken: string): Promise<{ id: string }> {
  const { data, error } = await getSupabaseClient(accessToken).from('projects').delete()
    .eq('org_id', orgId).eq('id', projectId).select('id').maybeSingle();
  if (error?.code === '23001' || error?.code === '23503') {
    throw Object.assign(new Error('Project contains retained inventory records'), {
      status: 409, code: 'PROJECT_NOT_EMPTY',
    });
  }
  if (error) throw new Error('Failed to delete project');
  if (!data) notFound();
  return z.object({ id: z.string().uuid() }).parse(data);
}
