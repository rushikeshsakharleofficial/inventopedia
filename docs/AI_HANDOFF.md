# AI Handoff — Inventopedia

CURRENT_MILESTONE: M1 — PostgreSQL Control Schema (complete), starting M2
CURRENT_TASK: M1 complete, M2 auth + multi-tenant security next
STATUS: M1 Complete
LAST_VERIFIED_COMMIT: 8a8f817 (M0), M1 about to commit
COMPLETED:
  - M0: monorepo, docs, Hono API, React frontend, shared types
  - M1: control schema migration (001_control_schema.sql)
    - Tables: organisations, org_members, subscriptions, audit_logs
    - RLS policies for all tables
    - Helper function: control.create_organisation
    - updated_at triggers
  - Auth middleware (Supabase JWT validation)
  - Validation middleware (Zod body + query)
  - Organisation service + routes (CRUD)
  - Audit service (non-blocking writes)
  - Supabase DB client (admin + user-scoped)
  - AppEnv type for Hono context
  - Auth guard tests (5 tests)
FILES_CHANGED:
  - packages/api/migrations/001_control_schema.sql
  - packages/api/src/types.ts
  - packages/api/src/db/client.ts, index.ts
  - packages/api/src/middleware/auth.ts, validation.ts, requestId.ts, error.ts
  - packages/api/src/services/organisations.ts, audit.ts
  - packages/api/src/routes/organisations.ts, organisations.test.ts, health.ts
  - packages/api/src/app.ts
  - packages/api/package.json (added @supabase/supabase-js)
TESTS_PASSED: 8 total (3 health, 5 org auth guard)
TESTS_FAILED: None
UNCOMMITTED_CHANGES: All M1 files
BLOCKERS: None
NEXT_EXACT_ACTION: Commit M1, then begin M2 — org membership resolution middleware, project-scoped auth, role-based access helpers
IMPORTANT_WARNINGS: Repository is PUBLIC — do not push secrets
