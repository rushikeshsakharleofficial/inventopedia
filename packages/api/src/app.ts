import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { requestId } from './middleware/requestId.js';
import { errorHandler } from './middleware/error.js';
import { healthRoute } from './routes/health.js';
import { organisationsRoute } from './routes/organisations.js';
import { API_PREFIX } from '@inventopedia/shared';
import type { AppEnv } from './types.js';
import { createOpenApiDocument } from './contracts.js';
import { responseContract } from './middleware/responseContract.js';

export function createApp() {
  const app = new Hono<AppEnv>();

  // Global middleware
  app.use('*', logger());
  app.use('*', requestId());
  app.use('*', responseContract());
  app.onError(errorHandler());

  // Routes
  app.route(`${API_PREFIX}/health`, healthRoute);
  app.route(`${API_PREFIX}/organisations`, organisationsRoute);
  app.get(`${API_PREFIX}/openapi.json`, (c) => c.json(createOpenApiDocument()));
  app.notFound((c) => c.json({ error: 'Route not found', code: 'NOT_FOUND', requestId: c.get('requestId') }, 404));

  return app;
}

export const app = createApp();
