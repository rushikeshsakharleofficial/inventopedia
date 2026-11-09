# AI Handoff — Inventopedia

## Frontend checkpoint

CURRENT_MILESTONE: Frontend implementation with frontend-design-premium.
CURRENT_TASK: Complete the inventory workspace and verify the live Vercel deployment.
STATUS: Frontend deployed; targeted tests and production HTTP checks pass. Hosted attachment upload/download and email recovery remain unverified.
LAST_VERIFIED_COMMIT: 682ba7c on main, matching origin/main at inspection.
COMPLETED: Frontend includes Supabase authentication and recovery, organisation/project management, inventory, categories, templates, stock, attachments and activity. Vercel production deployment dpl_FZtN3qTR2DQwcpxb1wXJ5o1766bC is READY. The earlier signed-in browser smoke test verified an empty workspace, mobile navigation, unsaved-change confirmation and cleanup; authenticated API list queries passed. Production auth site and redirect URL point to inventopedia.vercel.app.
FILES_CHANGED: packages/web/index.html, packages/web/public/icon.svg, packages/web/src/components/Workspace.tsx, packages/web/src/components/Workspace.test.tsx, docs/AI_HANDOFF.md. Frontend implementation was committed in earlier commits through 682ba7c.
TESTS_PASSED: Web tests 14/14, typecheck, lint, production build and frontend-design-premium strict audit (zero findings). Earlier full workspace run passed 515 API and 12 web tests, typecheck, build and lint. Current production homepage and icon return HTTP 200; API health returns ok.
TESTS_FAILED: None in the latest checks. The previous browser task space was unavailable during final verification; prior browser tests used an earlier frontend deployment.
UNCOMMITTED_CHANGES: This checkpoint includes the icon and workspace fixes; inspect Git status for subsequent work. The frontend changes were deployed directly to Vercel.
BLOCKERS: No deployment blocker; hosted upload/download and recovery email need safe end-to-end verification.
NEXT_EXACT_ACTION: Verify authenticated attachment upload/download and password recovery using an approved disposable environment; reconcile manual migration history before future automated migrations.
IMPORTANT_WARNINGS: Browser uses only the Supabase public key. The service-role key remains server-side. Authenticated Storage upload/download and real recovery emails were not exercised. Project migration history remains manual as documented in docs/HOSTED_MIGRATIONS.md.

## Hosted deployment checkpoint

CURRENT_MILESTONE: M12 — deployment in progress
CURRENT_TASK: Deploy existing local application to Supabase and Vercel.
STATUS: Migrations and Vercel production deployment applied; core hosted auth and tenant-isolation smoke checks passed. Full Storage workflow and automated migration history remain unverified.
LAST_VERIFIED_COMMIT: 824e4cc (main; local changes remain uncommitted).
COMPLETED: User selected existing Supabase project pzwmftssvadaruwplsdi in inventopedia organisation and explicitly approved migration 003 policy replacement. Applied migrations 001–010 through SQL Editor. Verified all 6 control and 7 inventory tables have RLS, and the inventory-attachments bucket is private. Exposed control and inventory through the Data API; private remains unexposed. Created Vercel project inventopedia and deployed local source directly; https://inventopedia.vercel.app displays the placeholder and reports API health ok.
FILES_CHANGED: .gitignore, api/handler.mjs, packages/api/src/vercel.ts, packages/api/tests/vercel.test.ts, tsconfig.json, vercel.json, docs/CREDENTIAL_ROTATION.md, docs/HOSTED_MIGRATIONS.md, docs/AI_HANDOFF.md, README.md, docs/FEATURE_MAP.md; pre-existing M11 working-tree changes remain.
TESTS_PASSED: Vercel production deployment dpl_8HgB2ZmQorhY42PD2dDr359JKHEc is READY. Hosted smoke test created two temporary users, authenticated both, created and read an organisation, created a project, denied cross-tenant organisation/project reads, denied anonymous database access, and denied public bucket access; removed test organisation and users successfully. RLS enabled on all 13 application tables; attachment bucket private. Focused security and Vercel tests (27), root typecheck, frontend build, locally bundled API health and outline update passed.
TESTS_FAILED: Earlier hosted API attempts returned 404/500; corrected in the latest deployment. Authenticated Storage upload/download and CI remain untested.
UNCOMMITTED_CHANGES: Existing M11 changes and this checkpoint are local only; nothing pushed.
BLOCKERS: None confirmed; hosted integration verification remains.
NEXT_EXACT_ACTION: Verify authenticated Storage upload/download and reconcile manual migration history with the chosen migration tooling before future migrations.
IMPORTANT_WARNINGS: 001–010 were applied manually via SQL Editor, not recorded in Supabase CLI migration history; see docs/HOSTED_MIGRATIONS.md and do not rerun blindly. SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are active in Vercel production. Supabase dashboard warns legacy JWT-based API keys retire in early 2027; migrate and verify modern keys as documented in docs/CREDENTIAL_ROTATION.md. The Vercel connector was forbidden from creating production variables; the authorized browser session succeeded. GitHub repository confirmed public; do not push proprietary changes. Frontend is only a health-check placeholder; runtime currently Node 26 due to root engines range.

CURRENT_MILESTONE: M11 — complete locally
CURRENT_TASK: Security, performance and CI verified locally
STATUS: Local changes uncommitted; GitHub CI and hosted deployment not verified.
LAST_VERIFIED_COMMIT: 824e4cc (main, one commit ahead of origin)
COMPLETED: Upgraded dependencies and Zod contracts; preserved legacy UUID-shaped IDs; added ESLint, CI and OpenAPI caching. Updated roadmap, feature map and README.
FILES_CHANGED: Root package manifests, eslint.config.mjs, .github/workflows/ci.yml, package manifests, API schemas/middleware/services/app and contract tests, docs/openapi.json, docs/{ROADMAP,FEATURE_MAP,AI_HANDOFF}.md, README.md.
TESTS_PASSED: Clean npm ci, audit (zero advisories), lint, typecheck, 515 tests, build, OpenAPI freshness, Node server health, git diff --check, code-outline update. Local 20-request OpenAPI sample: 243 ms before caching, 89 ms after.
TESTS_FAILED: Earlier sandbox test startup failed; clean final test run passed.
UNCOMMITTED_CHANGES: M11 changes are local only; tracked graph database sidecars had pre-existing modifications and are currently deleted by the graph process.
BLOCKERS: No local M11 blocker. Hosted CI verification requires a permitted push.
NEXT_EXACT_ACTION: Review local M11 diff; confirm repository privacy before any push. M12 is not started.
IMPORTANT_WARNINGS: GitHub CI has not run; local timing is not a load test. Node requires ^20.19.0, ^22.13.0 or >=24. Scoped minimatch 11 overrides bypass vulnerable transitive versions; reassess after upstream updates. Repository was public at last check; do not push proprietary code without confirming privacy. Existing hosted-database and Storage limitations below remain applicable.

## Previous checkpoint (historical)

CURRENT_MILESTONE: M9/M10 — complete locally
CURRENT_TASK: M11 work reverted at user request; deliver completed M8–M10 baseline
STATUS: M8–M10 validated for local commit; push blocked by public repository
LAST_VERIFIED_COMMIT: 3989d16 (HEAD on main; no new commit)
COMPLETED:
  - Preserved pre-existing M8 working-tree changes.
  - M9 private attachment reservations/direct uploads, signed downloads and retryable tombstone deletion.
  - Project audit triggers and administrator-only reads; project dashboard aggregates.
  - M10 generated OpenAPI 3.1 artifact/endpoint, route parity, formal validation and successful-response Zod checks.
  - Stock RPC inventory schema selection; forward migration 010 prevents actor impersonation and unauthorized direct RPC writes.
  - Storage operation-aware policies prevent cleanup SELECT grants from enabling deleted-object downloads or signed-upload tokens.
  - Updated roadmap, API/database docs and feature map.
FILES_CHANGED:
  - packages/api/migrations/008_project_observability.sql, 009_attachments.sql, 010_stock_authorization.sql.
  - packages/api/src/routes/{attachments,observability}.ts and services/{attachments,observability}.ts.
  - packages/api/src/contracts.ts, middleware/responseContract.ts, scripts/generate-openapi.ts.
  - packages/api/src/{app.ts,routes/organisations.ts,middleware/validation.ts,services/inventory.ts,services/stock.ts}.
  - packages/api/tests/{m9-routes,observability-schema,contracts}.test.ts, src/services/attachments.test.ts.
  - packages/api/package.json, package-lock.json, docs/{API_V1,DATABASE,FEATURE_MAP,ROADMAP,AI_HANDOFF}.md, docs/openapi.json.
  - Existing uncommitted M8 files include migration 007, stock route/service/validation/tests.
TESTS_PASSED:
  - Final workspace tests: 514 (513 API + 1 web), 24 files, zero failures.
  - Workspace typecheck and production build.
  - OpenAPI generation freshness check; Swagger Parser formal 3.1 validation; registered route/method parity.
  - Full 001–010 migration chain on ephemeral PGlite with minimal Storage helper/schema fixture.
  - SQL tenant isolation, actor/role authorization, immutable audit permissions, tombstone/upload/download/cleanup restrictions.
  - HTTP role/input/failure checks and real Supabase client transport assertions.
  - git diff --check; code-outline refresh with PYTHONIOENCODING=utf-8.
TESTS_FAILED: npm run lint cannot run: existing missing ESLint dependency/configuration.
UNCOMMITTED_CHANGES: This checkpoint records the M8–M10 baseline for local commit. Push pending privacy requirement; generated graph cache remains outside the commit.
BLOCKERS: No local M9/M10 implementation blocker. Missing lint setup and dependency advisories prevent claiming the foundation stability gate.
NEXT_EXACT_ACTION: Confirm repository private before pushing baseline. M11–M15 remain paused until user resumes them.
IMPORTANT_WARNINGS:
  - No hosted migration, deployment, bucket creation or push performed. GitHub connector confirmed repository PUBLIC on 2026-11-07; AGENTS.md forbids proprietary pushes while public.
  - Migration 009 requires existing Supabase Storage and operation-aware helper functions. Existing permissive Storage policies require deployment review.
  - SQL tests prove local policies, not hosted Storage behavior or genuine concurrent PostgreSQL sessions.
  - Attachments use reservations; listings may include not-yet-uploaded metadata. Tombstones retain items; failed Storage cleanup is retryable.
  - In-flight uploads may leave inaccessible orphan bytes; reconcile through Storage API. Issued download URLs remain valid until expiry.
  - Audit covers metadata changes from migration 008 onward; no backfill or byte-access audit.
  - Existing stock semantics preserved: adjust adds, transfer subtracts without destination credit.
  - Restored pre-M11 dependency versions. Current audit reports 10 advisories (6 moderate, 2 high, 2 critical). M11 dependency/lint/security changes were explicitly undone.
  - Graph change review stalled and was terminated; targeted source/diff review used instead. Outline refresh succeeded.
  - Stay on main. Foundation stability/Phase B approval was not requested or granted.
