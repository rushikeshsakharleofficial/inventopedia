import type { OrgRole, ProjectRole } from '@shared/types/entities.js';

export interface OrgAccess {
  id: string;
  role: OrgRole;
}

export interface ProjectAccess {
  id: string;
  orgId: string;
  role: ProjectRole;
}

/** Decoded user from Supabase JWT */
export interface AuthUser {
  id: string;
  email: string | null;
}

/** Hono environment type — defines context variables available via c.get/c.set */
export interface AppEnv {
  Variables: {
    requestId: string;
    user: AuthUser;
    accessToken: string;
    org: OrgAccess;
    project: ProjectAccess;
    validatedBody: unknown;
    validatedQuery: unknown;
  };
}
