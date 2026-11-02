# M6 Template Backend Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans, task by task. Execution is inline, preserving one working-tree writer.

**Goal:** Deliver the approved project-scoped typed-template lifecycle.
**Architecture:** Caller-JWT inventory services and nested Hono routes reuse M5 access guards. Migration 006 adds invoker RPCs and publication validation without editing 005.
**Tech Stack:** TypeScript, Hono, Zod 3, Supabase PostgreSQL, Vitest/PGlite.
**Spec:** `docs/superpowers/specs/2026-11-02-m6-templates-design.md`

## Global Constraints

- Work on main; preserve local M4/M5. No hosted changes, push or new dependencies.
- Readers: project members; writers: owner/admin. Never use service-role inventory access.
- Strict typed schemas, immutable publications, atomic allocation/publication.
- Do not bundle earlier uncommitted work into an M6 commit; leave local if isolation cannot be assured.

## Review Focus

- Direct authenticated publication must reject malformed schemas (Task 2 SQL tests).
- A published version cannot be edited/deleted or republished (Tasks 2–3).
- Same-org sibling template/version IDs must be invisible (Tasks 2–3).
- Cursor timestamps/numbers cannot inject filters or cross scopes (Tasks 1 and 3).
- Publication pointer failure must roll back publication (Task 2).

### Task 1: Typed contract and validation

Files: shared `src/types/templates.ts`, `src/index.ts`, `src/types/entities.ts`;
API `src/services/templateValidation.ts`, `templateValidation.test.ts`.
Produces: `templateSchema`, `createTemplateSchema`, `updateTemplateSchema`,
`versionInputSchema`, `templateQuerySchema`, `versionQuerySchema` and inferred inputs.

- [x] Write failing validation tests: five field types, required=false, options rules,
  duplicate/reserved keys, unknown fields, empty fields, body limits and cursor scope.
- [x] Run `npm.cmd exec --workspace=packages/api -- vitest run src/services/templateValidation.test.ts`; observe missing implementation.
- [x] Implement typed shared definitions and API Zod schemas, strict canonical cursors.
- [x] Re-run focused tests and typecheck. Expected all green.

### Task 2: Database lifecycle

Files: `packages/api/migrations/006_template_builder.sql`, `packages/api/tests/template-lifecycle.test.ts`.
Consumes: exact typed schema contract. Produces inventory RPCs
`create_template_version(p_project_id uuid,p_template_id uuid,p_schema jsonb)` and
`publish_template_version(p_project_id uuid,p_template_id uuid,p_version_id uuid)`
returning one template_versions composite row.

- [x] Write executable SQL tests for allocation, roles/RLS, wrong scope, valid/invalid
  direct publication, publication/pointer rollback, immutable versions and deletion.
- [x] Run focused SQL test; observe absent migration/RPC failure.
- [x] Add SQL schema validator/publication trigger and invoker RPCs with scoped row
  locks, explicit actor checks, pinned search paths and narrow execution grants.
- [x] Run lifecycle and existing inventory tests; expected green. Record concurrency limits.

### Task 3: Services and HTTP lifecycle

Files: `src/services/templates.ts`, `templateVersions.ts`, their transport tests;
`src/routes/templates.ts`, `src/routes/organisations.ts`, `tests/templates.test.ts`.
Consumes: Task 1 validators and Task 2 RPC signatures.
Produces: metadata CRUD/list, version CRUD/list/publish service functions and the
11 approved nested endpoints. Lists return existing data/pagination envelopes.

- [x] Write route tests for endpoint lifecycle, role matrix, auth/revocation, IDs,
  strict bodies/queries, requestId and error envelopes; observe missing routes fail.
- [x] Write real-builder transport tests for JWT/schema, project/template filters,
  pagination, RPC arguments, scoped 404s and malformed/error DB responses.
- [x] Implement services and routes, using locked RPCs for allocation/publication,
  filtered direct draft mutations and DB-enforced publication immutability.
- [x] Run route/transport/validation/lifecycle tests; expected all green.

### Task 4: Verification and documentation

Files: `docs/{API_V1,DATABASE,FEATURE_MAP,ROADMAP,AI_HANDOFF}.md`, approved spec/plan.

- [x] Run full workspace tests, typecheck/build, lint and whitespace checks. Report
  missing ESLint if unchanged; distinguish mock/PGlite proof from hosted concurrency.
- [x] Refresh indexes; independent read-only review of M6 diff and tests; fix any
  important finding with a failing regression before changing code.
- [x] Update contracts, feature map, roadmap and handoff with exact fresh evidence,
  local-only state, blockers and next action. No push or hosted migrations.

Execution: inline on main. All steps verified locally; no commit because M4/M5
share modified documentation/mount files and remain uncommitted. Preserve them.
