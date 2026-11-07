import { Hono } from 'hono';
import type { z } from 'zod';
import type { AppEnv } from '../types.js';
import { orgScope } from '../middleware/orgScope.js';
import { projectScope } from '../middleware/projectScope.js';
import { requireProjectRole } from '../middleware/permissions.js';
import { validateQuery } from '../middleware/validation.js';
import { auditQuerySchema, getDashboard, listAuditEvents } from '../services/observability.js';

export const observabilityRoute = new Hono<AppEnv>();
const base = '/:orgId/projects/:projectId';
const scope = [orgScope(), projectScope()] as const;

observabilityRoute.get(`${base}/dashboard`, ...scope, async (c) => {
  const data = await getDashboard(c.get('project').id, c.get('accessToken'));
  return c.json({ data, requestId: c.get('requestId') });
});

observabilityRoute.get(`${base}/audit`, ...scope, requireProjectRole('owner', 'admin'),
  validateQuery(auditQuerySchema), async (c) => {
    const query = c.get('validatedQuery') as z.infer<typeof auditQuerySchema>;
    const page = await listAuditEvents(c.get('project').id, query, c.get('accessToken'));
    return c.json({ ...page, requestId: c.get('requestId') });
  });
