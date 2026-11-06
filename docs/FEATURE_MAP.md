# Feature Map — Inventopedia

Maps features to implementation files for targeted navigation.

## API Routes

| Feature | Route File | Service | Migration |
|---------|-----------|---------|-----------|
| Health check | `packages/api/src/routes/health.ts` | — | — |
| Auth | `packages/api/src/routes/auth.ts` | `services/auth.ts` | — |
| Organisations | `packages/api/src/routes/organisations.ts` | `services/organisations.ts` | `001_control_schema.sql` |
| Projects | `packages/api/src/routes/projects.ts` | `services/projects.ts` | `002_projects.sql`, `003_tenant_security.sql`, `004_project_management.sql` |
| Subscription usage | `packages/api/src/routes/projects.ts` | `services/subscriptions.ts` | `001_control_schema.sql`, `004_project_management.sql` |
| Categories | `packages/api/src/routes/categories.ts` | `services/categories.ts`, `services/categoryValidation.ts` | `005_inventory_schema.sql` |
| Templates | `packages/api/src/routes/templates.ts` | `services/templates.ts`, `services/templateVersions.ts` | `005_inventory_schema.sql`, `006_template_builder.sql` |
| Inventory | `packages/api/src/routes/inventory.ts` | `services/inventory.ts`, `services/inventoryValidation.ts` | `005_inventory_schema.sql` |
| Stock (API planned M8) | `packages/api/src/routes/stock.ts` | `services/stock.ts` | `005_inventory_schema.sql` |
| Audit | `packages/api/src/routes/audit.ts` | `services/audit.ts` | `001_control_schema.sql` |

## Middleware

| Middleware | File |
|-----------|------|
| Auth | `packages/api/src/middleware/auth.ts` |
| Validation | `packages/api/src/middleware/validation.ts` |
| Error handler | `packages/api/src/middleware/error.ts` |
| Request ID | `packages/api/src/middleware/requestId.ts` |
| Project scope | `packages/api/src/middleware/projectScope.ts` |

## M2 security implementation

- JWT validation: `packages/api/src/middleware/auth.ts`
- Org membership: `packages/api/src/middleware/orgScope.ts`
- Project access: `packages/api/src/middleware/projectScope.ts`
- Explicit role guards: `packages/api/src/middleware/permissions.ts`
- Caller-scoped membership queries: `packages/api/src/services/access.ts`
- RLS hardening: `packages/api/migrations/003_tenant_security.sql`
- HTTP security integration tests: `packages/api/tests/security.test.ts`
- Executable PostgreSQL RLS tests: `packages/api/tests/rls.test.ts`

## M3 project management implementation

- Project CRUD and subscription usage routes: `packages/api/src/routes/projects.ts`
  (mounted by `routes/organisations.ts` under its existing authentication middleware).
- Caller-scoped CRUD, pagination and validation: `packages/api/src/services/projects.ts`.
- Organisation subscription usage: `packages/api/src/services/subscriptions.ts`.
- Fixed-tier constraints and authorized quota transaction: `packages/api/migrations/004_project_management.sql`.
- HTTP/service boundary tests: `packages/api/tests/projects.test.ts`.
- Executable quota/rollback tests: `packages/api/tests/project-quota.test.ts`.

Auth route/service, inventory, stock and audit route entries
above describe planned files. Authentication currently lives in M2 middleware.

## M4 inventory schema implementation

- Five tables, project RLS, explicit column grants, integrity triggers, publication
  composite foreign keys and indexes: `packages/api/migrations/005_inventory_schema.sql`.
- Full-chain executable schema/security tests: `packages/api/tests/inventory-schema.test.ts`.
- Project retention response: `deleteProject` in `packages/api/src/services/projects.ts`,
  regression tests in `packages/api/tests/projects.test.ts`.
- Category paths are database-derived; published versions and stock histories are
  immutable. Tenant quantity/movement writes remain closed pending M8.

## M5 Category API implementation

- Nested project category routes: `packages/api/src/routes/categories.ts`, mounted
  under authentication in `packages/api/src/routes/organisations.ts`.
- Caller-scoped CRUD, parent validation and tuple pagination:
  `packages/api/src/services/categories.ts`.
- Strict request/result schemas and context-bound cursors:
  `packages/api/src/services/categoryValidation.ts`.
- HTTP permission/input/envelope tests: `packages/api/tests/categories.test.ts`.
- Real Supabase builder with controlled fetch (schema/JWT/filters/bodies/errors):
  `packages/api/src/services/categories.test.ts`.
- Hierarchy/RLS SQL proof remains in `packages/api/tests/inventory-schema.test.ts`;
  M5 reuses migration 005 and adds no new migration.

## Shared Types

| Type | File |
|------|------|
| API responses | `packages/shared/src/types/api.ts` |
| Entities | `packages/shared/src/types/entities.ts` |
| Subscriptions | `packages/shared/src/types/subscriptions.ts` |

*Updated as implementation progresses.*

## M6 Template builder backend

- Metadata/version/publication routes: `packages/api/src/routes/templates.ts`.
- Caller-JWT metadata and version services: `services/templates.ts`,
  `services/templateVersions.ts`; strict typed fields/cursors: `services/templateValidation.ts`.
- Shared field contract: `packages/shared/src/types/templates.ts`; reusable Zod
  schema is exported from the API validation module for M7.
- Atomic version allocation/publication and direct-publication validation:
  `packages/api/migrations/006_template_builder.sql`.
- HTTP access/input tests: `packages/api/tests/templates.test.ts`; real-builder
  transport tests: `packages/api/src/services/templates.test.ts`; typed-field
  tests: `packages/api/src/services/templateValidation.test.ts`; executable SQL
  lifecycle/RLS tests: `packages/api/tests/template-lifecycle.test.ts`.

## M7 Inventory CRUD API

- Project-scoped item routes: `packages/api/src/routes/inventory.ts`, mounted
  under authentication in `packages/api/src/routes/organisations.ts`.
- Caller-JWT CRUD, template-schema attribute validation and cursor pagination:
  `packages/api/src/services/inventory.ts`.
- Strict input/result schemas, attribute-vs-template validation, cursor scope:
  `packages/api/src/services/inventoryValidation.ts`.
- Editor+ writes, all project-member reads; filters by categoryId, templateId, search.
- Attribute validation against published template version typed fields (text/number/
  boolean/date/select). Partial updates merge with existing then revalidate.
- Template version enforcement: only published versions accepted. Version immutable.
- Item deletion blocked when stock movements exist (FK restrict → 409 ITEM_IN_USE).
- Validation unit tests: `packages/api/src/services/inventoryValidation.test.ts`.
- HTTP auth/route tests: `packages/api/tests/inventory.test.ts`.
- M7 adds no new migration; reuses tables from 005_inventory_schema.sql.
