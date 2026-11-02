# AI Handoff - Inventopedia

CURRENT_MILESTONE: M6 - Template builder backend
CURRENT_TASK: Approved M6 implemented and locally verified
STATUS: M6 complete locally; M4/M5 preserved; lint and hosted/concurrency limitations remain
LAST_VERIFIED_COMMIT: fca1ca91acd6e65a1e3beed6fb1a10164ae430ce (baseline HEAD on main); M4-M6 verified in uncommitted tree
COMPLETED:
  - M0-M3 foundation, tenant security, project CRUD and atomic subscription quotas
  - M4 inventory schema 005; M5 category CRUD and pagination
  - M6 template metadata CRUD, typed fields, draft lifecycle and paginated versions
  - Migration 006: caller-scoped invoker RPCs for atomic allocation/publication;
    direct-publication schema validation, immutable versions and transactional pointer
  - Shared field types, strict inputs/results/cursors and caller-JWT inventory access
FILES_CHANGED:
  - packages/api/migrations/006_template_builder.sql
  - packages/api/src/routes/{templates,organisations}.ts
  - packages/api/src/services/{templates,templateVersions,templateValidation}.ts
  - packages/api/src/services/{templates,templateValidation}.test.ts
  - packages/api/tests/{templates,template-lifecycle}.test.ts
  - packages/shared/src/{index.ts,types/entities.ts,types/templates.ts}
  - docs/{API_V1,DATABASE,FEATURE_MAP,ROADMAP,AI_HANDOFF}.md
  - docs/superpowers/{specs/2026-11-02-m6-templates-design,plans/2026-11-02-m6-templates}.md
  - Pre-existing M4/M5 dirty files and generated tracked index sidecar remain
TESTS_PASSED: Fresh 2026-11-02: 402 workspace tests (401 API, 1 web); typecheck/build pass. M6: 30 validation, 27 transport, 34 HTTP, 31 SQL lifecycle tests. Whitespace check passes.
TESTS_FAILED: No application tests failed in final run; npm run lint fails because eslint is not installed
UNCOMMITTED_CHANGES: M4/M5/M6 implementation/tests/docs plus generated index state; local-only, no commit or push
BLOCKERS: Missing ESLint dependency/config; hosted PostgREST unverified; Docker daemon unavailable for genuine concurrent DB sessions
NEXT_EXACT_ACTION: Review/commit local M4-M6 work as logical changes when desired; await M7 scope. Hosted use requires migrations 001-006 and control/inventory exposure, never private.
IMPORTANT_WARNINGS: Repository previously reported PUBLIC; visibility not rechecked. Confirm privacy before proprietary-code push. No hosted migration/deployment authorised or executed. Historical checkpoints below describe earlier states.

M6_EXECUTION_CHECKPOINT (2026-11-02):
  - User approved the typed-field design; executed inline on main, preserving M4/M5.
  - Observed missing validation/service modules, missing migration and 30 absent-route
    test failures before implementation. Final M6 focused coverage: 122 tests.
  - Independent read-only review found no Critical/Important issues. Added SQL
    regressions for same-project wrong-template version, publication order and
    integer exhaustion; all pass. Review graph stalled; outline/source fallback used.
  - Final full suite: 401 API + 1 web pass; workspace typecheck/build pass. Lint
    remains blocked by missing ESLint. Logs: ignored .m6-{test,build,lint}-results.log.
  - Code outline refreshed successfully. SQL tests are serialized PGlite; transport
    tests use real Supabase builders with controlled fetch, not hosted PostgREST.
  - No new dependencies, quotas, frontend, item/stock API, hosted actions or push.
    No commit: existing M4/M5 share mount/docs; do not accidentally bundle their work.

M5_EXECUTION_CHECKPOINT (2026-11-02):
  - User approved design; executed inline on main, preserving M4. No new migration,
    dependency, environment variable, stock/template API, frontend or hosted change.
  - Observed 39 missing-route failures before implementation; 43 route tests now pass.
    Added 31 real-Supabase-builder tests with controlled fetch: inventory schema,
    JWT retention, scoped query/body emission, tuple paging, parents and error mapping.
  - Reused M4 hierarchy triggers/RLS; caller preflight does not replace DB checks.
    Cursors bind validated numeric/UUID tuples to project and parent filter; paging
    is not a snapshot during concurrent moves/reordering (documented in API_V1).
  - Independent read-only review: no Critical/Important findings. Fixed weak cursor
    injection fixture and added malformed list/delete response cases plus HTTP
    cursor-scope rejection coverage; final full suite passes 279 API + 1 web.
  - Workspace typecheck/build pass; lint fails in API/web because eslint is missing.
    Ignored .m5-{test,build}-results.log retain command output. Outline refresh passes;
    review graph timed out and outline/source fallback was used.
  - Hosted PostgREST/schema exposure and genuine concurrent DB sessions remain
    unverified; no commit, push, deployment or hosted migration executed.

M5_DESIGN_CHECKPOINT (2026-11-02):
  - User requested M5. Read handoff, feature map, roadmap and relevant category
    schema/client/route evidence. Graph search empty; outline/source fallback used.
  - Main remains at fca1ca9 with M4 uncommitted changes preserved. Do not repeat M4.
  - Proposed category CRUD, parent-filtered pagination, role guards and caller-JWT
    inventory queries in docs/superpowers/specs/2026-11-02-m5-categories-design.md.
  - Only design/handoff documentation changed this checkpoint; no source edits,
    test reruns, commit, push or hosted actions. Prior M4 verification stays historical.

M4_EXECUTION_CHECKPOINT (2026-11-02):
  - User approved design. Implemented inline on main; no dependencies added.
  - Added 005 inventory schema, five RLS tables, composite same-project/publication
    FKs, explicit column grants, hierarchy/path and identity/immutability triggers.
  - Stock tenant writes remain closed; no inventory API, stock writer or UI added.
  - Populated project deletion maps 23001/23503 to 409 PROJECT_NOT_EMPTY. Empty
    project deletion retains M3 behavior. Published/stock retention has no purge API.
  - Observed missing-schema test fail, then schema suite pass. Observed both new
    project-conflict mappings return 500 before fix and 409 after fix.
  - Independent read-only review found no Critical/Important issues; suggested
    same-project/different-template current-version regression added and passed.
  - Final npm.cmd run test: 205 API + 1 web pass; typecheck/build pass. Lint fails
    because eslint is missing. Logs: ignored .m4-{test,build}-results.log.
  - Outline index refreshed successfully with PYTHONIOENCODING=utf-8. Graph
    tests_for timed out; reviewer graph lacked SQL nodes; outline/source fallback used.
  - PGlite checks are serialized. Hosted schema exposure/grants and concurrent
    hierarchy moves remain unverified; no hosted setup, commit, push or deployment.

M4_DESIGN_CHECKPOINT (2026-11-02):
  - User requested M4. Read handoff, feature map, roadmap, architecture, database
    docs and shared inventory entities; graph search empty, outline/source used.
  - Git main at fca1ca9, clean starting tree. M3 is already committed; do not repeat it.
  - Prepared proposed 005 inventory schema, RLS/integrity tests, and a narrow
    project-delete conflict response for inventory retention. No product code yet.
  - Changed documentation only; application tests not rerun; no commits/pushes.

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

M6_DISCOVERY_CHECKPOINT (2026-11-02):
  - User requested M6 (Template builder backend). Read current roadmap, feature
    map, handoff, shared types and migration 005 template/version constraints.
  - Main at fca1ca9; existing local M4/M5 changes preserved. Graph template
    search returned no nodes; outline and targeted source fallback used.
  - Existing schema supports draft versions, immutable publication and a
    same-template published current-version pointer; field-definition contract
    remains unspecified. Clarify typed builder versus arbitrary JSON schema.
  - No product code, tests, commits, pushes or hosted actions in this checkpoint.
  - NEXT_EXACT_ACTION: settle M6 field contract, propose approach and write design
    for approval before implementation; previous test results remain historical.

M6_DESIGN_CHECKPOINT (2026-11-02):
  - User accepted recommended typed fields. Proposed full M6 design at
    docs/superpowers/specs/2026-11-02-m6-templates-design.md.
  - Covers metadata CRUD, typed draft versions, atomic allocation/publication,
    database publication validation, caller-JWT RLS and focused verification.
  - Read-only builder review: nothing important left unanswered before planning.
  - Design awaits approval; product implementation not started. Documentation
    whitespace check passes; no application tests rerun, commit, push or hosted work.
  - NEXT_EXACT_ACTION: obtain design approval, then writing-plans and implementation.
