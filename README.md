# Inventopedia

Universal multi-tenant inventory management SaaS.

## Stack

- **Frontend**: React + TypeScript + Vite + Tailwind
- **Backend**: TypeScript + Hono
- **API**: REST `/api/v1`, OpenAPI 3.1
- **Database**: Supabase PostgreSQL + JSONB
- **Auth**: Supabase Auth
- **Testing**: Vitest

## Structure

```
packages/
  api/     — Hono REST API server
  web/     — React SPA
  shared/  — Shared types and utilities
docs/      — Architecture, handoff, and API docs
```

## Getting Started

Use Node.js `^20.19.0`, `^22.13.0`, or `>=24`.

```bash
npm ci
npm run dev        # Start API + Web dev servers
npm run test       # Run all tests
npm run lint       # Lint source, API tests, and scripts
```

## Deployment

`vercel.json` builds the Vite frontend and bundles the Hono API into a Vercel
Function. The frontend calls the API on the same origin under `/api/v1`.
The server requires `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY`; the service-role key must remain server-side.
Apply the versioned database migrations and configure the required Supabase
Data API schemas before enabling database-backed features. Never expose the
`private` schema. See the handoff for the current hosted migration status.

The current frontend is a health-check placeholder, not the inventory UI.
The [credential rotation checklist](docs/CREDENTIAL_ROTATION.md) covers the
credentials used during deployment.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [API Contracts](docs/API_V1.md)
- [Database](docs/DATABASE.md)
- [AI Handoff](docs/AI_HANDOFF.md)
- [Feature Map](docs/FEATURE_MAP.md)
