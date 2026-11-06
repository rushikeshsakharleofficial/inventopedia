import { Hono, type MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types.js';
import { orgScope } from '../middleware/orgScope.js';
import { projectScope } from '../middleware/projectScope.js';
import { requireProjectRole } from '../middleware/permissions.js';
import { validateBody, validateQuery } from '../middleware/validation.js';
import { createItem, deleteItem, getItem, listItems, updateItem } from '../services/inventory.js';
import {
  assertItemCursorScope,
  createItemSchema,
  itemIdSchema,
  itemQuerySchema,
  updateItemSchema,
  type CreateItemInput,
  type ItemQuery,
  type UpdateItemInput,
} from '../services/inventoryValidation.js';

export const inventoryRoute = new Hono<AppEnv>();
const base = '/:orgId/projects/:projectId/items';
const item = `${base}/:itemId`;
const scope = [orgScope(), projectScope()] as const;
const write = requireProjectRole('owner', 'admin', 'editor');
const validateItemId: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!itemIdSchema.safeParse(c.req.param('itemId')).success) {
    return c.json({ error: 'Invalid item ID', code: 'VALIDATION_ERROR', requestId: c.get('requestId') }, 400);
  }
  await next();
};

// POST /:orgId/projects/:projectId/items — create an inventory item
inventoryRoute.post(base, ...scope, write, validateBody(createItemSchema), async (c) => {
  const data = await createItem(
    c.get('project').id,
    c.get('validatedBody') as CreateItemInput,
    c.get('accessToken'),
  );
  return c.json({ data, requestId: c.get('requestId') }, 201);
});

// GET /:orgId/projects/:projectId/items — list items with pagination and filters
inventoryRoute.get(base, ...scope, validateQuery(itemQuerySchema), async (c) => {
  const query = c.get('validatedQuery') as ItemQuery;
  assertItemCursorScope(c.get('project').id, query);
  const page = await listItems(c.get('project').id, query, c.get('accessToken'));
  return c.json({ ...page, requestId: c.get('requestId') });
});

// GET /:orgId/projects/:projectId/items/:itemId — get a single item
inventoryRoute.get(item, ...scope, validateItemId, async (c) => {
  const data = await getItem(
    c.get('project').id,
    c.req.param('itemId').toLowerCase(),
    c.get('accessToken'),
  );
  return c.json({ data, requestId: c.get('requestId') });
});

// PATCH /:orgId/projects/:projectId/items/:itemId — update an item
inventoryRoute.patch(item, ...scope, write, validateItemId, validateBody(updateItemSchema), async (c) => {
  const data = await updateItem(
    c.get('project').id,
    c.req.param('itemId').toLowerCase(),
    c.get('validatedBody') as UpdateItemInput,
    c.get('accessToken'),
  );
  return c.json({ data, requestId: c.get('requestId') });
});

// DELETE /:orgId/projects/:projectId/items/:itemId — delete an item
inventoryRoute.delete(item, ...scope, write, validateItemId, async (c) => {
  const data = await deleteItem(
    c.get('project').id,
    c.req.param('itemId').toLowerCase(),
    c.get('accessToken'),
  );
  return c.json({ data, requestId: c.get('requestId') });
});

