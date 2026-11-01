import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiError } from '@shared/types/api.js';
import type { AppEnv } from '../types.js';

/** Register with app.onError: Hono handles route errors before next() returns. */
export function errorHandler(): ErrorHandler<AppEnv> {
  return (err, c) => {
    const requestId = c.get('requestId') || 'unknown';
    const requestedStatus = (err as { status?: number }).status;
    const status = requestedStatus && requestedStatus >= 400 && requestedStatus < 600
      ? requestedStatus as ContentfulStatusCode : 500;
    const internal = status >= 500;
    console.error(`[${requestId}] Error ${status}: ${err.message}`);
    const body: ApiError = {
      error: internal ? 'Internal server error' : err.message,
      code: internal ? 'INTERNAL_ERROR' : ((err as { code?: string }).code || 'REQUEST_ERROR'),
      requestId,
    };
    return c.json(body, status);
  };
}
