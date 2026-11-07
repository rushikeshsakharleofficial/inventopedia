# AI Handoff — Inventopedia

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
