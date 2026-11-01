import type { MiddlewareHandler } from 'hono';
import type { ApiError } from '@inventopedia/shared';
import type { AppEnv } from '../types.js';

/** Global error handler — catches unhandled errors and returns consistent format */
export function errorHandler(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    try {
      await next();
    } catch (err) {
      const requestId = c.get('requestId') || 'unknown';
      const status = (err as { status?: number }).status || 500;
      const message = err instanceof Error ? err.message : 'Internal server error';

      console.error(`[${requestId}] Error ${status}: ${message}`);

      const body: ApiError = {
        error: status === 500 ? 'Internal server error' : message,
        code: status === 500 ? 'INTERNAL_ERROR' : ((err as { code?: string }).code || 'REQUEST_ERROR'),
        requestId,
      };

      return c.json(body, status as 400);
    }
  };
}
