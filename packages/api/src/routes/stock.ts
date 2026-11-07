import { Hono, type MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types.js';
import { orgScope } from '../middleware/orgScope.js';
import { projectScope } from '../middleware/projectScope.js';
import { requireProjectRole } from '../middleware/permissions.js';
import { validateBody, validateQuery } from '../middleware/validation.js';
import { recordStockMovement, getMovement, listMovements } from '../services/stock.js';
import {
  assertMovementCursorScope,
  createMovementSchema,
  movementIdSchema,
  movementQuerySchema,
  type CreateMovementInput,
  type MovementQuery,
} from '../services/stockValidation.js';

export const stockRoute = new Hono<AppEnv>();
const base = '/:orgId/projects/:projectId/stock';
const movements = `${base}/movements`;
const movement = `${movements}/:movementId`;
const scope = [orgScope(), projectScope()] as const;
const write = requireProjectRole('owner', 'admin', 'editor');
const validateMovementId: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!movementIdSchema.safeParse(c.req.param('movementId')).success) {
    return c.json({ error: 'Invalid movement ID', code: 'VALIDATION_ERROR', requestId: c.get('requestId') }, 400);
  }
  await next();
};

// POST /:orgId/projects/:projectId/stock/movements — record a stock movement
stockRoute.post(movements, ...scope, write, validateBody(createMovementSchema), async (c) => {
  const input = c.get('validatedBody') as CreateMovementInput;
  const result = await recordStockMovement(
    c.get('project').id,
    input,
    c.get('user').id,
    c.get('accessToken'),
  );
  return c.json({ data: result, requestId: c.get('requestId') }, 201);
});

// GET /:orgId/projects/:projectId/stock/movements — list movements
stockRoute.get(movements, ...scope, validateQuery(movementQuerySchema), async (c) => {
  const query = c.get('validatedQuery') as MovementQuery;
  assertMovementCursorScope(c.get('project').id, query);
  const page = await listMovements(c.get('project').id, query, c.get('accessToken'));
  return c.json({ ...page, requestId: c.get('requestId') });
});

// GET /:orgId/projects/:projectId/stock/movements/:movementId — get single movement
stockRoute.get(movement, ...scope, validateMovementId, async (c) => {
  const data = await getMovement(
    c.get('project').id,
    c.req.param('movementId').toLowerCase(),
    c.get('accessToken'),
  );
  return c.json({ data, requestId: c.get('requestId') });
});

