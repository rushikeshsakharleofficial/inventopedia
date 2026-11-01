# Database — Inventopedia

## Overview

Single Supabase PostgreSQL instance (shared tenancy).
Enterprise dedicated DB is a future feature (M14).

## Schemas

- `public` — Supabase Auth tables (managed)
- `control` — Organisations, org/project memberships, projects, subscriptions, audit logs
- `private` — Caller-bound RLS helpers; never expose this schema through the Data API
- `inventory` — Planned categories, templates, items, stock movements

## Migration Strategy

- Versioned SQL files in `packages/api/migrations/`
- Naming: `NNN_description.sql`
- Applied in order; never modify applied migrations
- Each migration is idempotent where possible

## Subscription Tiers

| Tier | Max Projects | Notes |
|------|-------------|-------|
| free | 2 | Default |
| starter | 5 | — |
| business | 10 | — |
| enterprise | custom | Manual config |

Other quotas (items, users, storage) are configurable and not yet decided.

## RLS Strategy

All tenant tables have RLS enabled. Policies check:
1. JWT `sub` → user ID
2. User → org membership (via `control.org_members`)
3. Org → project ownership
4. Project-level role for write operations

## Key Tables (planned)

### control schema
- `organisations` — tenant boundary
- `org_members` — user-org membership + role
- `subscriptions` — org subscription tier + limits
- `audit_logs` — all significant actions
- `projects` — org-scoped project (migration 002)
- `project_members` — explicit project roles (migration 002)

### inventory schema
- `categories` — nested categories (materialized path)
- `templates` — template definitions
- `template_versions` — immutable published versions
- `items` — inventory items with JSONB attributes
- `stock_movements` — transactional stock changes

*Detailed DDL will be added as migrations are created.*

## M2 security migrations and setup

Apply `001_control_schema.sql`, `002_projects.sql`, then `003_tenant_security.sql`
as the database owner. Migration 003 is a forward fix; earlier files are retained.
In Supabase Data API settings, expose `control`, and keep `private` unexposed.
The API clients explicitly use `control`; no tenant queries run in `public`.

Membership policies use `private.org_role` and `private.project_role` to avoid
recursive RLS. Both derive the actor from `auth.uid()` and pin `search_path`.
Org owners/admins inherit project owner/admin access. Other org members require
explicit project membership. Losing org membership revokes access even if a
project membership remains. Project owner/admin may update project settings;
viewer/editor roles cannot. Only org owners may delete projects.

Only org owners may grant or change elevated org roles and project ownership.
Org admins may manage ordinary org members. Project owners/admins may manage
non-owner memberships for users who already belong to the project's org.
Tenant/member identity columns cannot be changed by authenticated clients.
Subscription writes, audit inserts, and project creation are server-only.
Both creation RPCs execute only as `service_role`; backend callers must validate
the JWT and permissions before supplying the actor ID.

`npm run test:api` executes the migration/RLS suite on ephemeral PGlite PostgreSQL,
with stub Supabase roles and `auth.uid()`. It needs no credentials or hosted DB.
It does not verify hosted PostgREST schema exposure or Supabase Auth configuration.
