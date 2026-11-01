# AI Handoff — Inventopedia

CURRENT_MILESTONE: M2 — Authentication and multi-tenant security only
CURRENT_TASK: M2 complete locally; M3 and later deferred by user
STATUS: M2 Complete (local verification; hosted migration not applied)
LAST_VERIFIED_COMMIT: 951fe07 (HEAD); M2 changes verified in working tree, not committed
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
TESTS_PASSED: 65 total (64 API, 1 web), including 20 executable PostgreSQL RLS tests
TESTS_FAILED: None
UNCOMMITTED_CHANGES: M2 implementation/docs/test dependency plus pre-existing unrelated edits
BLOCKERS: No M2 code blocker; lint unavailable because ESLint is missing; hosted setup unverified
NEXT_EXACT_ACTION: Await the user's next instruction. Do not begin M3. For hosted setup,
  apply migrations 001/002/003 and expose control (not private) through Supabase Data API.
IMPORTANT_WARNINGS: Repository is PUBLIC — do not push secrets

M2_CHECKPOINT (2026-11-01):
  - Branch: feat/m2-security; existing dirty-tree edits preserved, no commits/pushes.
  - Approved design/plan: docs/superpowers/{specs,plans}/2026-11-01-m2-security*.md
  - Added org/project scope middleware and explicit role guards; protected org reads.
  - Caller-filtered membership lookups; Zod DB result parsing; control-schema clients.
  - JWT parsing tightened; nullable email; Hono onError returns consistent failures.
  - 003_tenant_security.sql fixes recursive RLS, project isolation, role escalation,
    tenant moves, quota/audit writes, and publicly executable privileged RPCs.
  - Final verification: 64 API tests (including 20 executable PostgreSQL RLS tests)
    + 1 web test pass; workspace typecheck and production build pass.
  - Review found no Critical/Important issues; minor UUID casing edge fixed with a
    failing/passing regression test. Graph review stalled; outline/source fallback used.
  - Lint unavailable: eslint is not installed/configured in the existing repository.
  - M3 project CRUD/quota APIs are deferred. Pre-existing untracked 002_projects.sql
    is unchanged and required before 003. No migration applied to hosted Supabase.
  - Added PGlite as dev-only dependency for executable SQL tests without credentials.
  - Existing unrelated EOF blank lines were preserved; git diff --check flags them.

RESUME_CHECKPOINT (2026-11-01):
  - Read AGENTS.md and this handoff; checked Git status, branch, and recent commits.
  - Confirmed branch feat/m2-security at 951fe07; M2 changes remain uncommitted
    alongside pre-existing edits and generated code-outline index files.
  - Checked the M2 implementation plan and ROADMAP: all M2 steps are checked off;
    there is no unfinished in-scope implementation task to resume.
  - No completed implementation or verification repeated; the 65-test/typecheck/build
    results above are from the prior execution, not a fresh run at this checkpoint.
  - Updated handoff only. No commits, pushes, hosted migrations, or M3 work performed.
  - Remaining items are unchanged: missing ESLint setup and hosted Supabase setup;
    neither is an unfinished step in the approved local M2 implementation plan.

GIT_HYGIENE_CHECKPOINT (2026-11-01):
  - User requested ignore rules to prevent accidental inclusion of local files.
  - Expanded .gitignore for credentials/env files, build/cache/deployment state,
    generated agent indexes, worktrees, logs, and machine-local MCP configuration.
  - Preserve .env.example / .env.*.example, source, SQL migrations, lockfile,
    shared agent hooks/skills, and project documentation as trackable files.
  - Remove .code-outline-graph/index.db, .mcp.json, and .cursor/mcp.json from the
    Git index only; local copies remain. The MCP configs contain machine paths.
  - This stages repository removals for those three previously tracked files;
    no commit/push and no history rewriting. Existing history remains unchanged.
  - .gitignore controls file inclusion; it does not block git commit/git push or
    protect files force-added with git add -f.
  - Verified 14 representative local/generated paths are ignored and 9 project/
    template paths stay trackable; all three removed-from-index local files exist.
    git ls-files confirms those paths are no longer tracked. Ignore-file whitespace
    check passes. No application code changed; application tests were not repeated.
