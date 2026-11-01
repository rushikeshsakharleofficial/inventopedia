# Architecture — Inventopedia

## Overview

Inventopedia is a multi-tenant inventory management SaaS with organisation-based tenancy.

## Tenant Hierarchy

```
User (Supabase Auth)
└── Organisation (tenant boundary)
    └── Project (data isolation unit)
        ├── Categories (nested, project-scoped)
        ├── Templates (versioned, project-scoped)
        │   └── Template Versions (immutable once published)
        └── Inventory Items (template-based, JSONB attributes)
            └── Stock Movements (transactional, immutable)
```

## Monorepo Layout

```
packages/
├── api/          Hono REST API
│   ├── src/
│   │   ├── routes/       Route handlers by domain
│   │   ├── middleware/    Auth, validation, error handling
│   │   ├── services/     Business logic
│   │   ├── db/           Database client, queries
│   │   └── index.ts      App entry
│   ├── migrations/       Versioned SQL migrations
│   └── tests/            Integration tests
├── web/          React SPA (Vite + Tailwind)
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── hooks/
│       ├── api/          API client
│       └── store/        State management
└── shared/       Shared TypeScript types
    └── src/
        ├── types/
        └── constants/
```

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| API framework | Hono | Lightweight, Vercel-compatible, TypeScript-first |
| DB | Supabase PostgreSQL | Managed, includes Auth, RLS built-in |
| Dynamic fields | JSONB | Flexible schema per template, indexed via GIN |
| Template versioning | Immutable versions | Audit trail, prevents retroactive changes |
| Stock changes | Movements table | Full audit, no direct quantity updates |
| Multi-tenancy | Shared DB + RLS | Cost-effective, strong isolation |

## Security Model

- Supabase JWT auth on every API request
- Middleware extracts user, resolves org membership + role
- RLS on all tenant tables as defense-in-depth
- Application-level permission checks before DB queries
- Project-level roles: owner, admin, editor, viewer
