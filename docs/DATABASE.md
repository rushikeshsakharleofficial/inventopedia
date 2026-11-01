# Database — Inventopedia

## Overview

Single Supabase PostgreSQL instance (shared tenancy).
Enterprise dedicated DB is a future feature (M14).

## Schemas

- `public` — Supabase Auth tables (managed)
- `control` — Organisations, memberships, subscriptions, audit logs
- `inventory` — Projects, categories, templates, items, stock movements

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

### inventory schema
- `projects` — org-scoped project
- `categories` — nested categories (materialized path)
- `templates` — template definitions
- `template_versions` — immutable published versions
- `items` — inventory items with JSONB attributes
- `stock_movements` — transactional stock changes

*Detailed DDL will be added as migrations are created.*
