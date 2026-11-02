import { Hono, type MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types.js';
import { orgScope } from '../middleware/orgScope.js';
import { projectScope } from '../middleware/projectScope.js';
import { requireProjectRole } from '../middleware/permissions.js';
import { validateBody, validateQuery } from '../middleware/validation.js';
import { createCategory, deleteCategory, getCategory, listCategories, updateCategory } from '../services/categories.js';
import { assertCategoryCursorScope, categoryIdSchema, categoryQuerySchema, createCategorySchema,
  updateCategorySchema, type CategoryQuery, type CreateCategoryInput, type UpdateCategoryInput } from '../services/categoryValidation.js';

export const categoriesRoute = new Hono<AppEnv>();
const base = '/:orgId/projects/:projectId/categories';
const validateCategoryId: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!categoryIdSchema.safeParse(c.req.param('categoryId')).success) {
    return c.json({ error: 'Invalid category ID', code: 'VALIDATION_ERROR', requestId: c.get('requestId') }, 400);
  }
  await next();
};

// organisationsRoute supplies authentication; these guards bind all queries to a project.
categoriesRoute.post(base, orgScope(), projectScope(), requireProjectRole('owner', 'admin'),
  validateBody(createCategorySchema), async (c) => {
    const data = await createCategory(c.get('project').id, c.get('validatedBody') as CreateCategoryInput, c.get('accessToken'));
    return c.json({ data, requestId: c.get('requestId') }, 201);
  });

categoriesRoute.get(base, orgScope(), projectScope(), validateQuery(categoryQuerySchema), async (c) => {
  const query = c.get('validatedQuery') as CategoryQuery;
  assertCategoryCursorScope(c.get('project').id, query);
  const page = await listCategories(c.get('project').id, query, c.get('accessToken'));
  return c.json({ ...page, requestId: c.get('requestId') });
});

categoriesRoute.get(`${base}/:categoryId`, orgScope(), projectScope(), validateCategoryId, async (c) => {
  const data = await getCategory(c.get('project').id, c.req.param('categoryId').toLowerCase(), c.get('accessToken'));
  return c.json({ data, requestId: c.get('requestId') });
});

categoriesRoute.patch(`${base}/:categoryId`, orgScope(), projectScope(), requireProjectRole('owner', 'admin'),
  validateCategoryId, validateBody(updateCategorySchema), async (c) => {
    const data = await updateCategory(c.get('project').id, c.req.param('categoryId').toLowerCase(),
      c.get('validatedBody') as UpdateCategoryInput, c.get('accessToken'));
    return c.json({ data, requestId: c.get('requestId') });
  });

categoriesRoute.delete(`${base}/:categoryId`, orgScope(), projectScope(), requireProjectRole('owner', 'admin'),
  validateCategoryId, async (c) => {
    const data = await deleteCategory(c.get('project').id, c.req.param('categoryId').toLowerCase(), c.get('accessToken'));
    return c.json({ data, requestId: c.get('requestId') });
  });
