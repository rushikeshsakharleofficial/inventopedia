import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { requestId } from './middleware/requestId.js';
import { errorHandler } from './middleware/error.js';
import { healthRoute } from './routes/health.js';
import { API_PREFIX } from '@inventopedia/shared';

export function createApp() {
  const app = new Hono();

  // Global middleware
  app.use('*', logger());
  app.use('*', requestId());
  app.use('*', errorHandler());

  // Routes
  app.route(`${API_PREFIX}/health`, healthRoute);

  return app;
}

export const app = createApp();
