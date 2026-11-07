# Roadmap — Inventopedia

| Milestone | Description | Status |
|-----------|-------------|--------|
| M0 | Repository and backend foundation | ✅ Complete |
| M1 | PostgreSQL control schema | ✅ Complete |
| M2 | Authentication and multi-tenant security | ✅ Complete (local verification) |
| M3 | Subscription limits and project management | ✅ Complete (local backend verification) |
| M4 | Inventory database schema | ✅ Complete (local schema verification) |
| M5 | Category API | ✅ Complete (local API verification) |
| M6 | Template builder backend | ✅ Complete (local backend verification) |
| M7 | Inventory CRUD API | ✅ Complete |
| M8 | Stock transaction API | ✅ Complete |
| M9 | Attachments, audit and dashboard | ✅ Complete (local backend verification) |
| M10 | Complete API v1 contracts and tests | ✅ Complete (local contract verification) |
| M11 | Security, performance and CI | ⬚ Not Started |
| M12 | Vercel deployment integration | ⬚ Not Started |
| M13 | Billing (when approved) | ⬚ Not Started |
| M14 | Enterprise dedicated DB (when needed) | ⬚ Not Started |
| M15 | Docker/on-prem migration (when needed) | ⬚ Not Started |

## M0 — Repository and Backend Foundation

- [x] Initialize monorepo structure
- [x] Create shared documentation
- [ ] Set up Hono API package with TypeScript
- [ ] Set up React + Vite + Tailwind frontend shell
- [ ] Health check endpoint with test
- [ ] Verify builds and tests pass

## M2 — Authentication and Multi-Tenant Security

M2 is complete. Subsequent local backend work now extends through M10.

- [x] Validate Supabase access tokens and attach authenticated user context
- [x] Resolve organisation membership for the authenticated caller
- [x] Enforce project membership and matching nested organisation scope
- [x] Add explicit organisation and project role guards
- [x] Use caller JWT database clients in the control schema
- [x] Harden recursive RLS, role escalation, tenant identity updates, and privileged RPC grants
- [x] Test HTTP access checks and executable PostgreSQL RLS policies
- [x] Verify workspace tests, typecheck, and production build

Migration `003_tenant_security.sql` follows existing migrations 001/002. It has
been tested locally on ephemeral PostgreSQL (PGlite), not applied to a hosted
Supabase database. Expose `control` through the Data API and keep `private`
unexposed when configuring Supabase. Lint is unavailable until the repository's
missing ESLint dependency/configuration is supplied.

## M3 — Subscription Limits and Project Management

- [x] Project create/list/read/update/delete API with org/project role guards
- [x] Caller-scoped project reads/edits and deterministic cursor pagination
- [x] Owner/admin subscription usage endpoint
- [x] Atomic per-org Free 2 / Starter 5 / Business 10 / Enterprise custom quotas
- [x] Forward migration 004 with fixed-tier constraints and locked actor checks
- [x] HTTP/service tests and executable quota, rollback and RLS tests
- [x] Workspace tests (140), typecheck and build; independent review
- [x] API/database/feature-map/handoff documentation

M3 is complete locally within the approved backend scope. Lint remains blocked by
the existing missing ESLint setup. Hosted Supabase migration/setup and genuine
multi-session PostgreSQL concurrency testing remain unverified. Billing, frontend
UI and project membership-management endpoints were outside this milestone.

## M4 — Inventory Database Schema

- [x] Migration 005: categories, templates, versions, items and stock movements
- [x] RLS role matrix and same-project composite foreign keys
- [x] Derived category paths, subtree moves and cycle protection
- [x] Published-version references and immutable publication/stock history
- [x] JSONB object validation, indexes and tenant stock-write restrictions
- [x] Inventory retention and 409 / PROJECT_NOT_EMPTY compatibility response
- [x] 63 executable inventory tests; 206 workspace tests, typecheck and build pass
- [x] Independent review and database/API/feature-map/handoff updates

M4 is verified locally. Hosted migrations and concurrent PostgreSQL sessions remain
unverified; lint still fails because ESLint is missing. Category API is implemented
in M5; template/item/stock APIs and transactional stock writes now exist through M10.
Frontend feature UI remains deferred.

## M5 — Category API

- [x] Project-scoped category create/list/read/update/delete
- [x] Owner/admin writes, all project-member reads, revoked/wrong-scope guards
- [x] Caller-JWT inventory queries and explicit project/parent filters
- [x] Root/direct-parent listing and sortOrder/UUID cursor pagination
- [x] Strict body/ID/cursor/result validation and documented hierarchy/retention errors
- [x] 43 route tests and 31 real-client transport tests; M4 SQL protections reused
- [x] 280 workspace tests, typecheck and production build pass; independent review
- [x] API/database/feature-map/handoff documentation

M5 adds no migration and preserves M4. Lint remains unavailable (missing ESLint).
Network-mocked transport tests verify emitted requests, not hosted PostgREST;
hosted schema exposure and concurrent hierarchy transactions remain unverified.

## M6 - Template Builder Backend

- [x] Project-scoped template metadata CRUD and paginated template/version reads
- [x] Strict text/number/boolean/date/select field definitions and shared types
- [x] Editable draft versions with atomic numbering and publication RPCs
- [x] Forward migration 006; database publication validation, RLS and immutability
- [x] HTTP role/input tests, real-client transport tests and executable SQL lifecycle tests
- [x] Workspace tests, typecheck/build, independent review and documentation

M6 is committed in the existing baseline. Missing ESLint still blocks lint.
Hosted PostgREST and true concurrent PostgreSQL sessions remain unverified.
The foundation stability gate remains subject to explicit user approval.

## M9 — Attachments, Audit and Dashboard

- [x] Private attachment metadata, authenticated direct upload, signed download and retryable deletion
- [x] Project/item Storage isolation and role policies; retained deletion tombstones
- [x] Transactional project audit triggers and administrator-only paginated audit API
- [x] Caller-scoped dashboard counts with project role checks
- [x] Executable SQL role/isolation tests, HTTP tests and real-client transport tests
- [x] Final workspace tests, typecheck, build and documentation review (lint unavailable)

## M10 — API v1 Contracts and Tests

- [x] OpenAPI 3.1 artifact and public endpoint, derived from runtime request/response contracts
- [x] Method/path parity and formal OpenAPI validation tests
- [x] Successful response Zod validation and common unknown-route errors
- [x] Validation middleware exception boundaries
- [x] Stock RPC schema fix and direct-database actor/role authorization regression tests
- [x] Final workspace tests, typecheck, build and documentation review (lint unavailable)

M9/M10 are local backend work. Hosted Supabase Storage and migrations are not
applied or verified. M11 dependency/security/CI work and M12 deployment remain
separate. The foundation stability gate has not been approved.
