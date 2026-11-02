import { Hono, type MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types.js';
import { orgScope } from '../middleware/orgScope.js';
import { projectScope } from '../middleware/projectScope.js';
import { requireProjectRole } from '../middleware/permissions.js';
import { validateBody, validateQuery } from '../middleware/validation.js';
import { createTemplate, deleteTemplate, getTemplate, listTemplates, updateTemplate } from '../services/templates.js';
import { createTemplateVersion, deleteTemplateVersion, getTemplateVersion, listTemplateVersions,
  publishTemplateVersion, updateTemplateVersion } from '../services/templateVersions.js';
import { assertTemplateCursorScope, createTemplateSchema, templateIdSchema, templateQuerySchema,
  updateTemplateSchema, versionInputSchema, versionQuerySchema, type CreateTemplateInput,
  type TemplateQuery, type UpdateTemplateInput, type VersionInput, type VersionQuery } from '../services/templateValidation.js';

export const templatesRoute = new Hono<AppEnv>();
const base = '/:orgId/projects/:projectId/templates';
const item = `${base}/:templateId`, versions = `${item}/versions`, version = `${versions}/:versionId`;
const scope = [orgScope(), projectScope()] as const;
const write = requireProjectRole('owner', 'admin');
const ids: MiddlewareHandler<AppEnv> = async (c, next) => {
  for (const key of ['templateId', 'versionId']) {
    const value = c.req.param(key);
    if (value !== undefined && !templateIdSchema.safeParse(value).success) {
      return c.json({ error: 'Invalid template/version ID', code: 'VALIDATION_ERROR', requestId: c.get('requestId') }, 400);
    }
  }
  await next();
};
const noBody: MiddlewareHandler<AppEnv> = async (c, next) => {
  if ((await c.req.text()).length > 0) return c.json({ error: 'Publication accepts no body', code: 'VALIDATION_ERROR', requestId: c.get('requestId') }, 400);
  await next();
};

templatesRoute.post(base, ...scope, write, validateBody(createTemplateSchema), async (c) => {
  const data = await createTemplate(c.get('project').id, c.get('validatedBody') as CreateTemplateInput, c.get('accessToken'));
  return c.json({ data, requestId: c.get('requestId') }, 201);
});
templatesRoute.get(base, ...scope, validateQuery(templateQuerySchema), async (c) => {
  const query = c.get('validatedQuery') as TemplateQuery;
  assertTemplateCursorScope(c.get('project').id, query);
  return c.json({ ...await listTemplates(c.get('project').id, query, c.get('accessToken')), requestId: c.get('requestId') });
});
templatesRoute.get(item, ...scope, ids, async (c) => {
  const data = await getTemplate(c.get('project').id, c.req.param('templateId').toLowerCase(), c.get('accessToken'));
  return c.json({ data, requestId: c.get('requestId') });
});
templatesRoute.patch(item, ...scope, write, ids, validateBody(updateTemplateSchema), async (c) => {
  const data = await updateTemplate(c.get('project').id, c.req.param('templateId').toLowerCase(), c.get('validatedBody') as UpdateTemplateInput, c.get('accessToken'));
  return c.json({ data, requestId: c.get('requestId') });
});
templatesRoute.delete(item, ...scope, write, ids, async (c) => {
  const data = await deleteTemplate(c.get('project').id, c.req.param('templateId').toLowerCase(), c.get('accessToken'));
  return c.json({ data, requestId: c.get('requestId') });
});
templatesRoute.post(versions, ...scope, write, ids, validateBody(versionInputSchema), async (c) => {
  const data = await createTemplateVersion(c.get('project').id, c.req.param('templateId').toLowerCase(), c.get('validatedBody') as VersionInput, c.get('accessToken'));
  return c.json({ data, requestId: c.get('requestId') }, 201);
});
templatesRoute.get(versions, ...scope, ids, validateQuery(versionQuerySchema), async (c) => {
  const query = c.get('validatedQuery') as VersionQuery, templateId = c.req.param('templateId').toLowerCase();
  assertTemplateCursorScope(c.get('project').id, query, templateId);
  return c.json({ ...await listTemplateVersions(c.get('project').id, templateId, query, c.get('accessToken')), requestId: c.get('requestId') });
});
templatesRoute.get(version, ...scope, ids, async (c) => {
  const data = await getTemplateVersion(c.get('project').id, c.req.param('templateId').toLowerCase(), c.req.param('versionId').toLowerCase(), c.get('accessToken'));
  return c.json({ data, requestId: c.get('requestId') });
});
templatesRoute.patch(version, ...scope, write, ids, validateBody(versionInputSchema), async (c) => {
  const data = await updateTemplateVersion(c.get('project').id, c.req.param('templateId').toLowerCase(), c.req.param('versionId').toLowerCase(), c.get('validatedBody') as VersionInput, c.get('accessToken'));
  return c.json({ data, requestId: c.get('requestId') });
});
templatesRoute.delete(version, ...scope, write, ids, async (c) => {
  const data = await deleteTemplateVersion(c.get('project').id, c.req.param('templateId').toLowerCase(), c.req.param('versionId').toLowerCase(), c.get('accessToken'));
  return c.json({ data, requestId: c.get('requestId') });
});
templatesRoute.post(`${version}/publish`, ...scope, write, ids, noBody, async (c) => {
  const data = await publishTemplateVersion(c.get('project').id, c.req.param('templateId').toLowerCase(), c.req.param('versionId').toLowerCase(), c.get('accessToken'));
  return c.json({ data, requestId: c.get('requestId') });
});
