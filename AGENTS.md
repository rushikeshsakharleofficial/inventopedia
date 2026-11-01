# AGENTS.md — Inventopedia

## Architecture Constraints

- Monorepo: `packages/api`, `packages/web`, `packages/shared`
- Backend: Hono on TypeScript, deployed to Vercel serverless
- Frontend: React + Vite + Tailwind
- Database: Supabase PostgreSQL, JSONB for dynamic attributes
- Auth: Supabase Auth (JWT)
- API: REST under `/api/v1`, OpenAPI 3.1
- No Redis, MongoDB, Kubernetes, or paid infra unless explicitly approved

## Coding Rules

- TypeScript strict mode everywhere
- Zod for all request/response validation
- All DB changes via versioned migrations in `packages/api/migrations/`
- RLS enforced for all tenant data tables
- Consistent error format: `{ error: string, code: string, requestId: string }`
- Use `@shared/` path alias for shared types
- Tests with Vitest; co-locate unit tests as `*.test.ts`
- API integration tests in `packages/api/tests/`
- No `any` types without explicit justification comment
- Prefer named exports
- Keep functions under 50 lines where practical

## Commands

```bash
npm run dev          # Start all dev servers (turbo)
npm run build        # Build all packages
npm run test         # Run all tests
npm run test:api     # Run API tests only
npm run test:web     # Run web tests only
npm run lint         # Lint all packages
npm run typecheck    # TypeScript type checking
```

## Multi-Tenant Model

User → Organisation → Project → (Categories, Templates, Inventory)

- All data queries scoped to project
- RLS enforces org/project isolation
- Subscription limits enforced at org level
- Template versions are immutable once published

## Agent Handoff

- Always read `docs/AI_HANDOFF.md` first
- Update it at every checkpoint
- Trust repo evidence over handoff claims
- One agent modifies working tree at a time
