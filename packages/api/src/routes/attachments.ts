import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types.js';
import { orgScope } from '../middleware/orgScope.js';
import { projectScope } from '../middleware/projectScope.js';
import { requireProjectRole } from '../middleware/permissions.js';
import { validateBody, validateQuery } from '../middleware/validation.js';
import { attachmentInputSchema, attachmentQuerySchema, reserveAttachment, listAttachments,
  downloadAttachment, deleteAttachment } from '../services/attachments.js';

export const attachmentsRoute = new Hono<AppEnv>();
const base = '/:orgId/projects/:projectId/items/:itemId/attachments';
const validateIds: MiddlewareHandler<AppEnv> = async (c, next) => {
  const ids = [c.req.param('itemId'), c.req.param('attachmentId')].filter((id) => id !== undefined);
  if (!ids.every((id) => z.string().guid().safeParse(id).success)) {
    return c.json({ error: 'Invalid attachment scope', code: 'VALIDATION_ERROR', requestId: c.get('requestId') }, 400);
  }
  await next();
};
const scope = [orgScope(), projectScope(), validateIds] as const;
const write = requireProjectRole('owner', 'admin', 'editor');
attachmentsRoute.post(base, ...scope, write, validateBody(attachmentInputSchema), async (c) => {
  const body = c.get('validatedBody') as z.infer<typeof attachmentInputSchema>;
  const data = await reserveAttachment(c.get('project').id, c.req.param('itemId').toLowerCase(), body.filename, c.get('accessToken'));
  return c.json({ data, requestId: c.get('requestId') }, 201);
});
attachmentsRoute.get(base, ...scope, validateQuery(attachmentQuerySchema), async (c) => {
  const query = c.get('validatedQuery') as z.infer<typeof attachmentQuerySchema>;
  const page = await listAttachments(c.get('project').id, c.req.param('itemId').toLowerCase(), query, c.get('accessToken'));
  return c.json({ ...page, requestId: c.get('requestId') });
});
attachmentsRoute.get(`${base}/:attachmentId/download`, ...scope, async (c) => {
  const data = await downloadAttachment(c.get('project').id, c.req.param('itemId').toLowerCase(), c.req.param('attachmentId').toLowerCase(), c.get('accessToken'));
  return c.json({ data, requestId: c.get('requestId') });
});
attachmentsRoute.delete(`${base}/:attachmentId`, ...scope, write, async (c) => {
  const data = await deleteAttachment(c.get('project').id, c.req.param('itemId').toLowerCase(), c.req.param('attachmentId').toLowerCase(), c.get('accessToken'));
  return c.json({ data, requestId: c.get('requestId') });
});
