# M5 Category API Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task.

**Goal:** Ship the approved project-scoped category CRUD and paginated listing.
**Architecture:** Mount category routes under existing org authentication; use
org/project role guards, Zod validation and caller-JWT inventory-schema queries.
Reuse migration 005's hierarchy integrity without reimplementing paths in JS.
**Tech Stack:** Hono, TypeScript, Zod, Supabase/PostgREST, Vitest/PGlite.
**Spec:** docs/superpowers/specs/2026-11-02-m5-categories-design.md (approved).

## Global constraints

Main only; preserve uncommitted M4 work. No deps, hosted changes, frontend, full-tree
endpoint, cascade deletion or M6+ features. Do not edit migration 005.

## Review focus

- Tuple cursor ties must neither repeat nor skip rows; numeric values/UUIDs validated before filters.
- Parent IDs are always resolved in the same project, including root moves and post-preflight races.
- Client schema switching must preserve the bearer JWT; no category service-role access.
- Guards hide wrong nested org/project and stale membership; no category identity mutation.
- Cycle/referenced-category failures must remain distinct from unexpected internal DB errors.

## Task 1: HTTP/service contracts and transport tests

Create packages/api/tests/categories.test.ts and packages/api/src/services/categories.test.ts.
- [x] Add failing HTTP tests for CRUD/defaults, role matrix, scope mismatch/revocation,
  body/id/query validation, parent/root moves, paging/filtering, conflict/internal errors.
- [x] Observe absent routes fail before implementation.
- [x] Exercise real Supabase query builders with controlled fetch to verify inventory
  schema headers, caller JWT, explicit project filters, tuple filters, mutation bodies.

## Task 2: Validation, services and routes

Create packages/api/src/services/categoryValidation.ts, categories.ts;
packages/api/src/routes/categories.ts; mount in routes/organisations.ts.
Interfaces: createCategory(projectId,input,token), listCategories(projectId,query,token),
getCategory(projectId,categoryId,token), updateCategory(projectId,categoryId,input,token),
deleteCategory(projectId,categoryId,token). Shared response type: Category.

- [x] Strict Zod schemas: UUIDs canonicalized, names trimmed 1–200, signed int32
  sortOrder; empty PATCH rejected. Cursor is canonical base64url JSON containing
  validated sortOrder/id plus project/parent filter context; reject context mismatches.
- [x] Caller client .schema('inventory'); explicit project_id filters. Map DB columns
  to shared Category, validate every row and id-only delete response.
- [x] Parent lookup through the same project before create/update/list; preserve
  composite FK checks under races. No client-computed paths.
- [x] List order sort_order,id ascending, limit+1; filter direct children or roots.
  Tuple predicate: sort_order.gt.n OR (sort_order.eq.n AND id.gt.uuid).
- [x] CRUD routes reuse scope middleware; writes require owner/admin. Map 23503
  parent disappearance to 404; delete 23001/23503 to 409/CATEGORY_IN_USE; hierarchy
  check conflicts to 409/CATEGORY_CONFLICT; unknown DB errors to 500.
- [x] Run focused API tests/typecheck and refresh code-outline index.

## Task 3: Review, proof and documentation

- [x] Independent read-only review and focused regression fixes if needed.
- [x] Run workspace tests, typecheck, build, lint and diff whitespace checks.
- [x] Update API_V1, DATABASE, FEATURE_MAP, ROADMAP, AI_HANDOFF and design/plan.

## Execution ledger

- User approved design. Execute inline without another approval round.
- Baseline main fca1ca9; M4 changes are uncommitted and must remain intact.
- Ruling: use CATEGORY_CONFLICT for validated hierarchy check violations (23514),
  without depending on localized/private DB messages. No migration needed initially.
- Ruling: cursor includes project/filter context; reject reuse with a different scope
  or parent filter. Concurrent sort-order edits may move rows across pages; document
  that pagination is not a snapshot and clients should refresh after moves/reordering.
- Task 1/2: observed 39 missing-route failures; implemented strict validation,
  caller-scoped inventory services and guarded routes. Initial 42 HTTP +27
  transport tests passed; workspace typecheck passed.
- Review: independent read-only reviewer found no Critical/Important issues.
  Strengthened otherwise-valid injected cursor envelopes and added malformed
  list/delete results plus HTTP cursor-context rejection. Now 43 HTTP +31 transport.
- Task 3: final workspace tests 279 API +1 web pass, typecheck/build pass. Lint
  fails due to existing missing eslint in API/web. git diff --check passes.
- Context7 custom-schema/filter documentation and real Supabase transport tests
  confirm JWT/schema headers and tuple filter syntax. Hosted PostgREST not exercised.
- Reused migration 005 unchanged; no schema correction/migration 006 necessary.
  Existing PGlite RLS/hierarchy tests pass with the combined workspace changes.
- Updated API_V1, DATABASE, FEATURE_MAP, ROADMAP, AI_HANDOFF and design/plan.
  M4/M5 remain local uncommitted on main; no dependencies, deployment or push.
- Outline refresh succeeded; review graph timed out; source/outline fallback used.
