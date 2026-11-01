import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types.js';

/** Generate or forward X-Request-Id header */
export function requestId(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const id = c.req.header('x-request-id') || crypto.randomUUID();
    c.set('requestId', id);
    c.header('X-Request-Id', id);
    await next();
  };
}
