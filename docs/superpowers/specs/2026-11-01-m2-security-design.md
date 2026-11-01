# M2 authentication and tenant security

Approved scope: M2 only, confirmed in chat on 2026-11-01.

Extend Supabase JWT authentication with organisation membership resolution,
project scope, and explicit role guards. Keep Hono, Zod, Supabase PostgreSQL,
strict TypeScript, and the existing error envelope. No project CRUD, quota API,
billing, frontend auth UI, deployment, or paid infrastructure.

## Approach

Extend the existing middleware and user-scoped database clients. Using only RLS
would omit the required application checks; using admin queries for tenant reads
would bypass defense in depth. Membership lookups must filter by the validated
user ID and use the caller JWT. Parse database responses with Zod.

Organisation members may read their organisation and its membership list.
Organisation owners/admins inherit project owner/admin access respectively.
Ordinary organisation members need explicit project membership. Project roles
are owner, admin, editor, viewer; role guards take explicit allowed-role lists.
Revoked organisation membership invalidates project access even if a stale
project membership remains. Nested org/project IDs must agree.

Return 401 for invalid credentials, 400 for malformed scope IDs, 404 for invisible
scope, 403 for insufficient roles, and 500 for database failures. Every error
includes error, code, requestId. Downstream errors must not become auth failures.

Use a forward migration after the existing 001/002 migrations to remove recursive
membership RLS, constrain role escalation and tenant moves, and restrict privileged
RPC execution to the service role. Preserve existing migration files, including
the pre-existing project/quota SQL in 002; no M3 endpoints are added.

## Proof

Exercise real Hono requests against mocked Supabase boundaries for JWT and scope
checks. Run migrations against an isolated PostgreSQL-compatible test instance
with auth.uid and Supabase roles, and execute RLS reads/writes as authenticated
users. Cover cross-tenant IDs, all roles, revoked membership, malformed data,
database errors, and direct RPC bypass attempts. Run typecheck, tests, and build.
