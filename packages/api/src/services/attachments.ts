import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSupabaseClient } from '../db/index.js';
import { getItem } from './inventory.js';

export const attachmentInputSchema = z.object({
  filename: z.string().trim().min(1).max(255).regex(/^[^/\\\x00-\x1f\x7f]+$/),
}).strict();
export const attachmentRowSchema = z.object({
  id: z.string().uuid(), project_id: z.string().uuid(), item_id: z.string().uuid(),
  filename: z.string(), created_by: z.string().uuid(), deleted: z.boolean(),
  created_at: z.string().datetime({ offset: true }),
});
export const attachmentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20), cursor: z.string().uuid().optional(),
}).strict();
const bucket = 'inventory-attachments';
type Attachment = z.infer<typeof attachmentRowSchema>;
function objectPath(row: Attachment) { return `${row.project_id}/${row.item_id}/${row.id}`; }
function client(token: string) { return getSupabaseClient(token).schema('inventory').from('attachments'); }
function missing(): never { throw Object.assign(new Error('Attachment not found'), { status: 404, code: 'NOT_FOUND' }); }

export async function reserveAttachment(projectId: string, itemId: string, filename: string, token: string) {
  await getItem(projectId, itemId, token);
  const { data, error } = await client(token).insert({ id: randomUUID(), project_id: projectId, item_id: itemId, filename })
    .select('*').single();
  if (error) throw new Error('Attachment reservation failed');
  const row = attachmentRowSchema.parse(data);
  return { ...row, bucket, path: objectPath(row) };
}

export async function listAttachments(projectId: string, itemId: string, input: z.infer<typeof attachmentQuerySchema>, token: string) {
  await getItem(projectId, itemId, token);
  let query = client(token).select('*').eq('project_id', projectId).eq('item_id', itemId)
    .eq('deleted', false).order('id', { ascending: true }).limit(input.limit + 1);
  if (input.cursor) query = query.gt('id', input.cursor);
  const { data, error } = await query;
  if (error) throw new Error('Attachment listing failed');
  const rows = z.array(attachmentRowSchema).parse(data);
  const hasMore = rows.length > input.limit;
  const page = rows.slice(0, input.limit);
  return { data: page, pagination: { cursor: hasMore ? page[page.length - 1].id : null, hasMore } };
}

async function getAttachment(projectId: string, itemId: string, id: string, token: string) {
  const { data, error } = await client(token).select('*').eq('project_id', projectId).eq('item_id', itemId).eq('id', id).maybeSingle();
  if (error) throw new Error('Attachment query failed');
  if (!data) missing();
  return attachmentRowSchema.parse(data);
}

export async function downloadAttachment(projectId: string, itemId: string, id: string, token: string) {
  const row = await getAttachment(projectId, itemId, id, token);
  if (row.deleted) missing();
  const { data, error } = await getSupabaseClient(token).storage.from(bucket)
    .createSignedUrl(objectPath(row), 60, { download: row.filename });
  if (error || !data) throw Object.assign(new Error('Attachment object unavailable'), { status: 404, code: 'NOT_FOUND' });
  return z.object({ signedUrl: z.string().url() }).parse(data);
}

export async function deleteAttachment(projectId: string, itemId: string, id: string, token: string) {
  const row = await getAttachment(projectId, itemId, id, token);
  const { error } = await client(token).update({ deleted: true }).eq('project_id', projectId).eq('item_id', itemId).eq('id', id);
  if (error) throw new Error('Attachment deletion failed');
  const result = await getSupabaseClient(token).storage.from(bucket).remove([objectPath(row)]);
  if (result.error) throw new Error('Attachment storage cleanup failed; retry deletion');
  return { id };
}
