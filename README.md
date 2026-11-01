# Inventopedia

Inventopedia is being rebuilt from a clean architecture.

The previous Go/Caddy/frontend implementation has been removed from the current `main` tree. Historical commits remain available in Git history.

## Rebuild direction

- Frontend: React, TypeScript, Vite, Tailwind CSS
- Backend: TypeScript + Hono, versioned `/api/v1`
- Database: PostgreSQL (structured relational tables + JSONB custom fields)
- Multi-tenancy: Users → Organisations → Projects
- Subscriptions: Free (2 projects), Starter (5), Business (10), Enterprise (custom)
- Enterprise hosting: shared or dedicated PostgreSQL database
- Authentication, permissions, quota enforcement and database isolation are mandatory

## Privacy prerequisite

**Make this existing repository private before importing the new frontend source and rebuild package.**

GitHub → Settings → General → Danger Zone → Change repository visibility → Make private.

The replacement source package is prepared separately; no credentials should ever be committed.
