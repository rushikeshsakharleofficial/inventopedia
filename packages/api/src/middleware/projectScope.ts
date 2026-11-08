import type { MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { resolveProjectAccess } from '../services/access.js';
import type { AppEnv } from '../types.js';

/** Require org membership and project membership (or org owner/admin access). */
export function projectScope(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const parsed = z.string().guid().safeParse(c.req.param('projectId'));
    const orgId = c.req.param('orgId')?.toLowerCase();
    if (!parsed.success || (orgId && !z.string().guid().safeParse(orgId).success)) {
      return c.json({ error: 'Invalid project scope', code: 'VALIDATION_ERROR', requestId: c.get('requestId') }, 400);
    }
    const project = await resolveProjectAccess(parsed.data.toLowerCase(), c.get('user').id, c.get('accessToken'));
    if (!project || (orgId && project.orgId !== orgId) || (c.get('org') && project.orgId !== c.get('org').id)) {
      return c.json({ error: 'Project not found', code: 'NOT_FOUND', requestId: c.get('requestId') }, 404);
    }
    c.set('project', project);
    await next();
  };
}
