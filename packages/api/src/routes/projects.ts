import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { orgScope } from '../middleware/orgScope.js';
import { projectScope } from '../middleware/projectScope.js';
import { requireOrgRole, requireProjectRole } from '../middleware/permissions.js';
import { validateBody, validateQuery } from '../middleware/validation.js';
import {
  createProject, createProjectSchema, deleteProject, getProject, listProjects,
  projectQuerySchema, updateProject, updateProjectSchema,
  type CreateProjectInput, type ProjectQuery, type UpdateProjectInput,
} from '../services/projects.js';
import { getSubscriptionUsage } from '../services/subscriptions.js';

// Mounted inside organisationsRoute, after its authentication middleware.
export const projectsRoute = new Hono<AppEnv>();

projectsRoute.post('/:orgId/projects', orgScope(), requireOrgRole('owner', 'admin'),
  validateBody(createProjectSchema), async (c) => {
    const data = await createProject(c.get('org').id, c.get('validatedBody') as CreateProjectInput,
      c.get('user').id, c.get('accessToken'));
    return c.json({ data, requestId: c.get('requestId') }, 201);
  });

projectsRoute.get('/:orgId/projects', orgScope(), validateQuery(projectQuerySchema), async (c) => {
  const page = await listProjects(c.get('org').id, c.get('validatedQuery') as ProjectQuery, c.get('accessToken'));
  return c.json({ ...page, requestId: c.get('requestId') });
});

projectsRoute.get('/:orgId/projects/:projectId', orgScope(), projectScope(), async (c) => {
  const data = await getProject(c.get('org').id, c.get('project').id, c.get('accessToken'));
  return c.json({ data, requestId: c.get('requestId') });
});

projectsRoute.patch('/:orgId/projects/:projectId', orgScope(), projectScope(), requireProjectRole('owner', 'admin'),
  validateBody(updateProjectSchema), async (c) => {
    const data = await updateProject(c.get('org').id, c.get('project').id,
      c.get('validatedBody') as UpdateProjectInput, c.get('accessToken'));
    return c.json({ data, requestId: c.get('requestId') });
  });

projectsRoute.delete('/:orgId/projects/:projectId', orgScope(), projectScope(), requireOrgRole('owner'), async (c) => {
  const data = await deleteProject(c.get('org').id, c.get('project').id, c.get('accessToken'));
  return c.json({ data, requestId: c.get('requestId') });
});

projectsRoute.get('/:orgId/subscription', orgScope(), requireOrgRole('owner', 'admin'), async (c) => {
  const data = await getSubscriptionUsage(c.get('org').id, c.get('accessToken'));
  return c.json({ data, requestId: c.get('requestId') });
});
