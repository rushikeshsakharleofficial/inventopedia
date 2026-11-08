import type { MiddlewareHandler } from 'hono';
import { ZodSchema, ZodError } from 'zod';
import type { AppEnv } from '../types.js';

/**
 * Validates request body against a Zod schema.
 * Attaches parsed body to context as 'validatedBody'.
 */
export function validateBody<T extends ZodSchema>(schema: T): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    try {
      const body = await c.req.json();
      const parsed = schema.parse(body);
      c.set('validatedBody', parsed);
    } catch (err) {
      if (err instanceof ZodError) {
        return c.json(
          {
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            requestId: c.get('requestId') || 'unknown',
            details: err.issues.map((e) => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
          400
        );
      }
      return c.json(
        {
          error: 'Invalid request body',
          code: 'VALIDATION_ERROR',
          requestId: c.get('requestId') || 'unknown',
        },
        400
      );
    }
    await next();
  };
}

/**
 * Validates query parameters against a Zod schema.
 * Attaches parsed params to context as 'validatedQuery'.
 */
export function validateQuery<T extends ZodSchema>(schema: T): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    try {
      const query = c.req.query();
      const parsed = schema.parse(query);
      c.set('validatedQuery', parsed);
    } catch (err) {
      if (err instanceof ZodError) {
        return c.json(
          {
            error: 'Invalid query parameters',
            code: 'VALIDATION_ERROR',
            requestId: c.get('requestId') || 'unknown',
            details: err.issues.map((e) => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
          400
        );
      }
      throw err;
    }
    await next();
  };
}
