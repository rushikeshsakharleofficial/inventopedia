# Database — Inventopedia

## Overview

Single Supabase PostgreSQL instance (shared tenancy).
Enterprise dedicated DB is a future feature (M14).

## Schemas

- `public` — Supabase Auth tables (managed)
- `control` — Organisations, org/project memberships, projects, subscriptions, audit logs
- `private` — Caller-bound RLS helpers; never expose this schema through the Data API
- `inventory` — Categories, templates, template versions, items and stock movements (migration 005)

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

## Key Tables

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

Detailed DDL lives in versioned migrations. Category/template APIs are implemented
in M5/M6; item/stock APIs follow in M7/M8.

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

## M3 project management migration

Apply `004_project_management.sql` after 001/002/003 as the database owner.
It permits a null Enterprise project limit and constrains fixed-tier limits to
Free 2, Starter 5, Business 10. Enterprise accepts a configured nonnegative integer
or null (unlimited). Existing inconsistent subscriptions cause migration failure;
the migration does not silently rewrite subscription data.

The service-only `control.create_project` RPC locks the subscription row, then
checks and share-locks the actor's org owner/admin membership. Under the Data API's
READ COMMITTED isolation, its subsequent project count sees committed creation
from the preceding lock holder. Project insertion, owner membership, and audit
insertion commit or roll back together. Other client writes cannot bypass this
creation path. Project reads/edits/deletes continue using caller JWTs and M2 RLS.

`packages/api/tests/project-quota.test.ts` executes quota boundaries, actor checks,
constraints, grants, and rollback on isolated PGlite PostgreSQL. These are serialized
tests, not a multi-session concurrency proof. No local PostgreSQL CLI/server was
available and Docker's engine was unavailable during M3 execution. Hosted migration
application and PostgREST integration remain unverified and were not executed.

## M4 inventory schema

Apply `005_inventory_schema.sql` after 001–004 as the database owner. It creates
the `inventory` schema and five RLS-enabled tables. Existing API clients still
target `control`; future inventory API clients must explicitly target `inventory`.
When enabling hosted inventory Data API access, expose `inventory` alongside
`control`, never `private`. No hosted configuration was changed in M4.

| Table | Key protections |
|-------|-----------------|
| categories | Same-project parent FK, derived UUID materialized path, cycle rejection |
| templates | Current version must be published and belong to the same project/template |
| template_versions | Unique positive version per template, JSONB object schema, published immutability |
| items | Published pinned version, optional same-project category, JSONB attributes, zero initial quantity |
| stock_movements | Same-project item, immutable history, project-scoped optional reference uniqueness |

All project links restrict deletion, including organisation deletion that would
cascade to a populated project. Referenced categories/templates/items cannot be
deleted. Published versions and movement rows cannot be updated or deleted even
by the service role. Tenant purge/retention workflows are outside M4.

Composite foreign keys and stored publication markers enforce project/template
and publication boundaries without relying on a separate application read.
Identity triggers prevent changing row/project IDs, version numbering/template
ownership, and an item's pinned version. Normal item/category assignment can change
within the project; client grants expose only the intended editable columns.

Category paths are slash-delimited UUID paths, including the category itself.
The database derives them, rejects cycles and updates descendants when a parent
changes. Hierarchy mutations serialize on the containing project row under
READ COMMITTED. Indexes cover project/parent/path lookups, version/category/item
foreign keys and stock actors; item attributes have a GIN index. Multi-session
hierarchy locking was not exercised by the serialized PGlite tests.

Project viewers can read inventory. Project owner/admin can manage categories,
templates and draft versions and publish versions. Owner/admin/editor can manage
item metadata. Org owner/admin inherit project access; other users require both
org and project membership. Revoked org membership removes inventory access.
Anonymous clients have no inventory access.

Tenant clients cannot insert movements, edit item quantity or truncate tables.
Service-role grants allow DML but exclude TRUNCATE; immutability triggers still
apply. Numeric quantities must be finite. M4 does not define movement sign rules,
negative-stock policy or a transactional stock writer; those belong to M8.
Trusted service writes must not be treated as an implemented stock-adjustment API.

`packages/api/tests/inventory-schema.test.ts` applies the full migration chain on
isolated PGlite and runs 63 schema/access/integrity cases. It uses stub Supabase
roles/Auth identity; hosted grants/schema exposure and real concurrent sessions
remain unverified. Existing M2/M3 suites continue to verify their historical
migration boundaries; the inventory suite verifies the combined 001–005 chain.

## M5 category access

The Category API switches each caller-scoped Supabase client to `inventory` while
retaining its bearer JWT. It explicitly filters every category query by project_id;
parent preflight queries use the same scope. Reads permit all project roles;
creation, editing, moving and deletion require owner/admin. No service-role client
is used for category data.

M5 reuses migration 005 unchanged. Its composite parent FK and hierarchy triggers
remain authoritative after application preflight and under races. Listing orders
by sort_order then id, with strict tuple cursors and optional direct-parent/root
filters. PostgreSQL 23503 parent failures map to 404; deletion 23001/23503 maps to
CATEGORY_IN_USE; hierarchy check violations map to CATEGORY_CONFLICT. Unexpected
database errors remain internal failures.

Real Supabase transport tests verify schema headers, JWT retention, editable
mutation fields and scoped filters; they mock the network, not a hosted PostgREST
server. Hosted `inventory` exposure and multi-session hierarchy behavior remain
unverified. Existing executable SQL tests cover the actual path/RLS constraints.

## M6 template lifecycle (migration 006)

Apply `006_template_builder.sql` after 001–005. It adds no tables and does not
rewrite existing drafts/publications. Keep inventory/control exposed in hosted
PostgREST and private unexposed. No hosted migration was executed for M6.

- `inventory.create_template_version(p_project_id,p_template_id,p_schema)` returns
  one template_versions row. It authorizes owner/admin, locks the scoped template,
  validates schema and allocates max(existing version)+1 atomically.
- `inventory.publish_template_version(p_project_id,p_template_id,p_version_id)`
  returns one template_versions row. It authorizes owner/admin, locks template
  then scoped version, publishes and changes the current pointer atomically.
- Both RPCs use SECURITY INVOKER, pinned search paths, caller RLS and authenticated
  execution only. No service-role client is used by the API.
- `private.valid_template_schema` validates the strict typed-field contract;
  `private.template_trim` matches ECMAScript trimming whitespace. Pure helpers
  have narrowly granted execution for invoker functions/triggers.
- A publication trigger rejects invalid schema on INSERT/UPDATE with non-null
  published_at, including direct authenticated writes. Existing M4 immutability,
  same-project/template FKs and retention remain authoritative.

Version-row locks serialize draft update/delete against publication: an earlier
edit is validated when publishing; a later edit sees published immutability.
The parent lock serializes RPC allocation/publication. Direct SQL version inserts
still rely on the unique version constraint and can cause allocation conflicts.
Draft numbering may reuse the highest deleted number; it is not an audit sequence.
The current version follows publication order, which may differ from number order.

Executable tests in `packages/api/tests/template-lifecycle.test.ts` apply the full
migration chain and prove roles, revoked access, schema validation, lifecycle,
rollback and grants on PGlite. These are serialized tests, not evidence of actual
concurrent PostgreSQL sessions; Docker daemon was unavailable during M6 checks.

## M9/M10 migrations and Storage

Apply migrations 008, 009 and 010 after 001–007 in order, as database owner.
008 creates `inventory.audit_events` and public caller-scoped `project_dashboard`.
009 requires Supabase's existing `storage.buckets` and `storage.objects`; it
creates the private `inventory-attachments` bucket and operation-specific object
policies. Do not expose `private` through PostgREST. Expose `inventory`, `control`
and `public` to use the documented RPCs and tables. Existing broad Storage
policies must be reviewed because permissive PostgreSQL policies combine with OR.
Storage must provide `storage.allow_only_operation` and `storage.allow_any_operation`.
Upload policies allow authenticated standard uploads only; signed-upload-token
creation is denied. Tombstoned object SELECT access applies only during Storage
delete/delete_many operations, preventing cleanup grants from enabling downloads.

Attachment metadata binds project/item composite keys to UUID-only object paths.
Metadata deletion is a one-way tombstone; object removal uses Storage API. Audit
and metadata retain their project/item references. Audit triggers record metadata
mutations without copying sensitive row contents. No historical backfill occurs.
010 wraps the original stock transaction with JWT actor and writer role checks,
locks caller memberships against revocation, and revokes access to the internal
transaction function. Both stock functions live in the inventory schema.

Executable migration tests use ephemeral PGlite and a minimal Storage schema.
They prove SQL policies and transactional behavior, not hosted Storage service
behavior or multi-session PostgreSQL races. Hosted migrations, upload/download
smoke tests and Storage orphan reconciliation remain deployment checks.
