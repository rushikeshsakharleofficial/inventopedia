import type { MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { resolveOrgAccess } from '../services/access.js';
import type { AppEnv } from '../types.js';

/** Must run after authMiddleware. Scope comes only from the route parameter. */
export function orgScope(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const parsed = z.string().uuid().safeParse(c.req.param('orgId'));
    if (!parsed.success) {
      return c.json({ error: 'Invalid organisation ID', code: 'VALIDATION_ERROR', requestId: c.get('requestId') }, 400);
    }
    const org = await resolveOrgAccess(parsed.data.toLowerCase(), c.get('user').id, c.get('accessToken'));
    if (!org) {
      return c.json({ error: 'Organisation not found', code: 'NOT_FOUND', requestId: c.get('requestId') }, 404);
    }
    c.set('org', org);
    await next();
  };
}
