import { z } from 'zod';
import { getSupabaseClient } from '../db/index.js';

const count = z.number().int().nonnegative();
export const dashboardSchema = z.object({
  items: count, categories: count, templates: count, movements: count, outOfStockItems: count,
}).strict();
export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
}).strict();
export const auditEventSchema = z.object({
  id: z.string().uuid(), project_id: z.string().uuid(), actor_id: z.string().uuid().nullable(),
  action: z.enum(['insert', 'update', 'delete']), entity_type: z.string(),
  entity_id: z.string().uuid(), created_at: z.string().datetime({ offset: true }),
});

export async function getDashboard(projectId: string, token: string) {
  const { data, error } = await getSupabaseClient(token).schema('public').rpc('project_dashboard', { p_project_id: projectId });
  if (error) throw new Error('Dashboard query failed');
  return dashboardSchema.parse(data);
}

export async function listAuditEvents(projectId: string, input: z.infer<typeof auditQuerySchema>, token: string) {
  let query = getSupabaseClient(token).schema('inventory').from('audit_events')
    .select('id,project_id,actor_id,action,entity_type,entity_id,created_at')
    .eq('project_id', projectId).order('id', { ascending: true }).limit(input.limit + 1);
  if (input.cursor) query = query.gt('id', input.cursor);
  const { data, error } = await query;
  if (error) throw new Error('Audit query failed');
  const rows = z.array(auditEventSchema).parse(data);
  const hasMore = rows.length > input.limit;
  const page = rows.slice(0, input.limit);
  return { data: page, pagination: { cursor: hasMore ? page[page.length - 1].id : null, hasMore } };
}
