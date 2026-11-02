# M4 Inventory Schema Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task.

**Goal:** Implement the approved five-table inventory schema and project retention safeguard.
**Architecture:** Migration 005 adds inventory tables, composite foreign keys, caller-bound RLS,
column grants and integrity triggers. Existing project deletion maps FK retention to 409.
**Tech Stack:** PostgreSQL, TypeScript/Hono, Vitest/PGlite.
**Spec:** docs/superpowers/specs/2026-11-02-m4-inventory-schema-design.md (approved).

## Global constraints

Work on main. Preserve 001–004. No inventory endpoints, UI, quotas, dependencies,
hosted execution or deployment. M5+ remain deferred. Tenant quantity/movement writes
remain closed. Published versions and movements immutable, including service-role writes.

## Review focus

- Same-org sibling projects are separate tenant boundaries for all references.
- Publication references need real database constraints, including concurrent writes.
- Hierarchy path changes must propagate; cycles and concurrent moves must be serialized.
- Published content cannot be deleted through cascading ancestor deletion.
- Stock quantity and immutable row identity must resist column-grant bypasses.

## Task 1: Executable schema/security tests

Create packages/api/tests/inventory-schema.test.ts.
- [x] Apply 001–005 to isolated PGlite and seed two orgs and sibling projects.
- [x] Test role matrix, read isolation, revoked membership, cross-project FKs,
  hierarchy path derivation/moves/cycles, JSONB checks, publication/version invariants,
  quantity and movement write denial, immutable histories, idempotency, retention.
- [x] Run focused tests and observe missing inventory schema fail.

## Task 2: Forward inventory migration

Create packages/api/migrations/005_inventory_schema.sql.
- [x] Create five tables with UUIDs and immutable project identity; composite FKs
  bind category parents, template versions, item versions/categories and movements.
- [x] Use stored publication marker columns and composite FKs to require published
  versions for current pointers/items; retain immutable item version references.
- [x] Derive slash-delimited UUID category paths with project-row locking and
  propagate child path updates. Reject cycles and project/ID changes.
- [x] Add publication/stock immutability triggers, RLS, explicit column grants,
  indexes and restricted trigger-function execution privileges.
- [x] Run focused SQL tests, then refresh outline index.

## Task 3: Project-delete compatibility

Modify packages/api/src/services/projects.ts and packages/api/tests/projects.test.ts.
- [x] Add failing test: PostgreSQL 23503 maps to 409/PROJECT_NOT_EMPTY, private
  error details hidden. Other errors stay 500; empty deletion stays successful.
- [x] Implement error-code mapping; run focused HTTP suite and refresh index.

## Task 4: Verification/documentation

Modify docs/{DATABASE,FEATURE_MAP,ROADMAP,API_V1,AI_HANDOFF}.md and approved spec/plan.
- [x] Independent read-only review; resolve important findings with focused proof.
- [x] Run workspace tests, typecheck, build and lint; report exact limitations.
- [x] Document migration, grants, retention, stock boundary and tests; update handoff.

## Execution ledger

- User approved M4 design. Execute inline without a second permission round.
- Baseline main fca1ca9, only M4 design/handoff documentation edits present.
- Ruling: numeric stock values preserve future fractional/signed policy choices;
  only finite values allowed; tenant inserts start at zero and cannot write quantity.
- Ruling: publication marker composite FKs enforce published references without
  race-prone trigger-only checks. Versions/items keep immutable relationship identity.
- Ruling: materialized paths use slash-delimited UUIDs. Reparenting is serialized
  on the project row; paths are derived, never accepted as client input.
- Ruling: no shared entity API changes until M5–M8; schema-only project/publication
  marker columns need not become client fields.
- Task 1/2: observed empty table metadata fail the schema preflight; migration 005
  then passed 61/62 initial SQL cases. PostgreSQL RESTRICT returned 23001 rather
  than expected 23503; corrected expectation to the observed restrictive-FK code.
- Task 3: both 23001/23503 conflict response tests failed with 500 before mapping;
  all 56 HTTP tests pass afterward. Unexpected delete failures remain 500.
- Review: independent read-only reviewer found no Critical/Important issues;
  optional same-project/different-template publication-pointer test added. All
  63 inventory SQL tests pass; no code change was needed for that additional case.
- Task 4: final workspace tests 205 API + 1 web pass; workspace typecheck/build
  pass. Lint fails in API/web because eslint is missing. No deps installed.
- Outline refresh succeeded. Graph tests_for timed out and SQL graph nodes were
  absent; outline/source fallback used for review. No hosted or multi-session proof.
- Updated DATABASE, FEATURE_MAP, ROADMAP, API_V1, AI_HANDOFF and this design/plan.
  Changes stay local on main with generated tracked index WAL; no commit or push.
