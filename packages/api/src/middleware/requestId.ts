import type { MiddlewareHandler } from 'hono';

/** Generate or forward X-Request-Id header */
export function requestId(): MiddlewareHandler {
  return async (c, next) => {
    const id = c.req.header('x-request-id') || crypto.randomUUID();
    c.set('requestId', id);
    c.header('X-Request-Id', id);
    await next();
  };
}
