import type { MiddlewareHandler } from 'hono';
import { getSupabaseAdmin } from '../db/index.js';
import type { AppEnv, AuthUser } from '../types.js';

/**
 * Auth middleware — validates Supabase JWT and attaches user to context.
 * Returns 401 if token is missing or invalid.
 */
export function authMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const authHeader = c.req.header('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json(
        {
          error: 'Missing or invalid Authorization header',
          code: 'UNAUTHORIZED',
          requestId: c.get('requestId') || 'unknown',
        },
        401
      );
    }

    const token = authHeader.slice(7);

    try {
      const supabase = getSupabaseAdmin();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !user) {
        return c.json(
          {
            error: 'Invalid or expired token',
            code: 'UNAUTHORIZED',
            requestId: c.get('requestId') || 'unknown',
          },
          401
        );
      }

      c.set('user', { id: user.id, email: user.email! } satisfies AuthUser);
      c.set('accessToken', token);
      await next();
    } catch {
      return c.json(
        {
          error: 'Authentication failed',
          code: 'UNAUTHORIZED',
          requestId: c.get('requestId') || 'unknown',
        },
        401
      );
    }
  };
}
