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

```bash
npm install
npm run dev        # Start API + Web dev servers
npm run test       # Run all tests
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [API Contracts](docs/API_V1.md)
- [Database](docs/DATABASE.md)
- [AI Handoff](docs/AI_HANDOFF.md)
- [Feature Map](docs/FEATURE_MAP.md)
