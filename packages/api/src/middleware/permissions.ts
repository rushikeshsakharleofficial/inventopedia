import type { MiddlewareHandler } from 'hono';
import type { OrgRole, ProjectRole } from '@shared/types/entities.js';
import type { AppEnv } from '../types.js';

export function requireOrgRole(...allowed: OrgRole[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const org = c.get('org');
    if (!org || !allowed.includes(org.role)) {
      return c.json({ error: 'Insufficient organisation permissions', code: 'FORBIDDEN', requestId: c.get('requestId') }, 403);
    }
    await next();
  };
}

export function requireProjectRole(...allowed: ProjectRole[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const project = c.get('project');
    if (!project || !allowed.includes(project.role)) {
      return c.json({ error: 'Insufficient project permissions', code: 'FORBIDDEN', requestId: c.get('requestId') }, 403);
    }
    await next();
  };
}
