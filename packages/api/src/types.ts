/** Decoded user from Supabase JWT */
export interface AuthUser {
  id: string;
  email: string;
}

/** Hono environment type — defines context variables available via c.get/c.set */
export interface AppEnv {
  Variables: {
    requestId: string;
    user: AuthUser;
    accessToken: string;
    validatedBody: unknown;
    validatedQuery: unknown;
  };
}
