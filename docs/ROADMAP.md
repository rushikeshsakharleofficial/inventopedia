# Roadmap — Inventopedia

| Milestone | Description | Status |
|-----------|-------------|--------|
| M0 | Repository and backend foundation | ✅ Complete |
| M1 | PostgreSQL control schema | ✅ Complete |
| M2 | Authentication and multi-tenant security | ✅ Complete (local verification) |
| M3 | Subscription limits and project management | ⬚ Not Started |
| M4 | Inventory database schema | ⬚ Not Started |
| M5 | Category API | ⬚ Not Started |
| M6 | Template builder backend | ⬚ Not Started |
| M7 | Inventory CRUD API | ⬚ Not Started |
| M8 | Stock transaction API | ⬚ Not Started |
| M9 | Attachments, audit and dashboard | ⬚ Not Started |
| M10 | Complete API v1 contracts and tests | ⬚ Not Started |
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

Current scope: **M2 only**. M3 and later remain deferred.

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
