import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { orgScope } from '../middleware/orgScope.js';
import { validateBody } from '../middleware/validation.js';
import {
  createOrganisation,
  listUserOrganisations,
  getOrganisation,
  listOrgMembers,
} from '../services/organisations.js';
import type { AppEnv } from '../types.js';

export const organisationsRoute = new Hono<AppEnv>();

// All organisation routes require authentication
organisationsRoute.use('*', authMiddleware());

const createOrgSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/, 'Invalid slug format'),
});

// POST /organisations — create a new organisation
organisationsRoute.post('/', validateBody(createOrgSchema), async (c) => {
  const user = c.get('user');
  const body = c.get('validatedBody') as z.infer<typeof createOrgSchema>;

  const org = await createOrganisation(body, user.id);

  return c.json(
    { data: org, requestId: c.get('requestId') },
    201
  );
});

// GET /organisations — list user's organisations
organisationsRoute.get('/', async (c) => {
  const accessToken = c.get('accessToken');

  const orgs = await listUserOrganisations(c.get('user').id, accessToken);

  return c.json({
    data: orgs,
    requestId: c.get('requestId'),
  });
});

// GET /organisations/:orgId — get a single organisation
organisationsRoute.get('/:orgId', orgScope(), async (c) => {
  const accessToken = c.get('accessToken');
  const orgId = c.get('org').id;

  const org = await getOrganisation(orgId, c.get('user').id, accessToken);

  if (!org) {
    return c.json(
      {
        error: 'Organisation not found',
        code: 'NOT_FOUND',
        requestId: c.get('requestId'),
      },
      404
    );
  }

  return c.json({ data: org, requestId: c.get('requestId') });
});

// GET /organisations/:orgId/members — list org members
organisationsRoute.get('/:orgId/members', orgScope(), async (c) => {
  const accessToken = c.get('accessToken');
  const orgId = c.get('org').id;

  const members = await listOrgMembers(orgId, accessToken);

  return c.json({
    data: members,
    requestId: c.get('requestId'),
  });
});
