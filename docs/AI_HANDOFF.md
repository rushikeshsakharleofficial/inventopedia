# AI Handoff — Inventopedia

CURRENT_MILESTONE: M3 — Subscription limits and project management
CURRENT_TASK: Approved M3 backend scope implemented and locally verified
STATUS: M3 complete locally; lint unavailable, hosted setup and multi-session concurrency unverified
LAST_VERIFIED_COMMIT: d95561d5814f1edc57cd226829ee3aca6e521b57 (baseline HEAD on main); M3 verified in uncommitted working tree
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
  - M2 tenant scope, role guards and RLS security (merged before this session)
  - M3 project CRUD, cursor pagination, subscription usage and atomic 2/5/10/custom quotas
  - Migration 004: fixed-tier constraints, Enterprise null limit, locked actor authorization
FILES_CHANGED:
  - packages/api/migrations/004_project_management.sql
  - packages/api/src/routes/{organisations,projects}.ts
  - packages/api/src/services/{projects,subscriptions}.ts
  - packages/api/tests/{projects,project-quota,rls}.test.ts
  - docs/{API_V1,DATABASE,FEATURE_MAP,ROADMAP,AI_HANDOFF}.md
  - docs/superpowers/{specs/2026-11-02-m3-projects-design,plans/2026-11-02-m3-projects}.md
  - Generated tracked .code-outline-graph/index.db-{shm,wal} changed during indexing
TESTS_PASSED: Fresh 2026-11-02: 140 total (139 API, 1 web), including 42 executable SQL tests; workspace typecheck/build and git diff --check pass
TESTS_FAILED: No application tests failed in final run; npm run lint fails because eslint is not installed
UNCOMMITTED_CHANGES: All M3 implementation/docs local-only plus generated tracked index sidecars; no commits or pushes
BLOCKERS: Missing ESLint dependency/config; hosted setup unverified; Docker daemon unavailable for multi-session PostgreSQL test
NEXT_EXACT_ACTION: Review/commit the local M3 change when desired; do not begin M4 without user instruction.
  Hosted setup requires separate authorization; apply 001/002/003/004 in order and expose control, never private.
IMPORTANT_WARNINGS: Repository previously reported PUBLIC; visibility not rechecked. Confirm privacy before any proprietary-code push. Historical checkpoints below describe earlier states, not the current tree.

M3_EXECUTION_CHECKPOINT (2026-11-02):
  - User approved design. Implemented inline on main; no dependencies installed.
  - HTTP tests observed absent routes fail, then 53 pass. SQL tests observed missing
    protections fail, then 22 pass; prior 20 RLS tests also run with migration 004.
  - Tested owner-only SQL deletion with RETURNING, membership cascade, freed capacity,
    and denied admin/member deletion. Creation/member/audit rollback tested together.
  - Independent read-only review: no Critical/Important findings; coverage suggestion
    implemented. Graph review stalled; terminated orchestration and used outline/source.
  - Fresh final workspace tests/build/typecheck pass. Lint fails (missing eslint).
    Local ignored .m3-{test,build}-results.log retain test/build command output.
  - Outline update succeeds with PYTHONIOENCODING=utf-8; initial default-encoding
    attempt failed. Tracked index sidecars are generated artifacts, not source edits.
  - No psql/server available; Docker engine unavailable. Serialized PGlite checks do
    not prove concurrent sessions; locking analysis assumes Data API READ COMMITTED.
  - No hosted migrations, deployment, commit, push or foundation stability declaration.

M3_DESIGN_CHECKPOINT (2026-11-02):
  - User authorised moving to M3. Existing project schema and quota-locking RPC
    inspected; proposed backend CRUD, subscription usage, and quota enforcement.
  - Added proposed design at docs/superpowers/specs/2026-11-02-m3-projects-design.md.
  - Local-only documentation edits; no source changes, new tests, commit or push.
  - M2 results remain historical. Prior M3 deferral is superseded by this request.

RESUME_CHECKPOINT (2026-11-02):
  - Read AGENTS.md, AI_HANDOFF.md, FEATURE_MAP.md, M2 plan, and ROADMAP.md.
  - Git confirms main at d95561d; clean starting tree; local main matches the
    cached origin/main ref (no fetch performed). History includes M2 merge 0406b06.
  - M2 plan has every step checked off; ROADMAP retains M2-only scope and defers M3.
    No unfinished in-scope implementation task exists to resume.
  - Confirmed RLS test and migration 003 are tracked; machine-local MCP configs
    and generated index are untracked by Git. Earlier dirty-tree notes are historical.
  - Changed only this handoff; no application tests repeated, commits, pushes,
    hosted migrations, or M3 work. Documentation diff/whitespace checked this session.
  - NEXT_EXACT_ACTION remains awaiting user scope; hosted setup and missing lint
    setup remain recorded follow-ups, not unfinished approved M2 plan steps.

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
