import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types.js';
import { contracts } from '../contracts.js';

const matchers = contracts.map((contract) => ({ contract,
  pattern: new RegExp(`^${contract.path.replace(/\{[^}]+\}/g, '[^/]+')}/?$`),
}));

/** Validate successful wire responses before returning them to clients. */
export function responseContract(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await next();
    if (c.res.status >= 400 || c.req.method === 'HEAD') return;
    const match = matchers.find(({ contract, pattern }) => contract.method === c.req.method && pattern.test(c.req.path));
    if (!match) return;
    if (c.res.status !== match.contract.status) throw new Error('Unexpected response status');
    match.contract.response.parse(await c.res.clone().json());
  };
}
