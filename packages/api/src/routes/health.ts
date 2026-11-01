import { Hono } from 'hono';
import type { AppEnv } from '../types.js';

export const healthRoute = new Hono<AppEnv>();

healthRoute.get('/', (c) => {
  return c.json({
    status: 'ok',
    service: 'inventopedia-api',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
});
