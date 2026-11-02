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
| Categories | `packages/api/src/routes/categories.ts` | `services/categories.ts` | `002_inventory_schema.sql` |
| Templates | `packages/api/src/routes/templates.ts` | `services/templates.ts` | `002_inventory_schema.sql` |
| Inventory | `packages/api/src/routes/inventory.ts` | `services/inventory.ts` | `002_inventory_schema.sql` |
| Stock | `packages/api/src/routes/stock.ts` | `services/stock.ts` | `002_inventory_schema.sql` |
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

Auth route/service, categories, templates, inventory, stock and audit route entries
above describe planned files. Authentication currently lives in M2 middleware.

## Shared Types

| Type | File |
|------|------|
| API responses | `packages/shared/src/types/api.ts` |
| Entities | `packages/shared/src/types/entities.ts` |
| Subscriptions | `packages/shared/src/types/subscriptions.ts` |

*Updated as implementation progresses.*
