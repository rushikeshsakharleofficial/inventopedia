# AGENTS.md â€” Inventopedia

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

User â†’ Organisation â†’ Project â†’ (Categories, Templates, Inventory)

- All data queries scoped to project
- RLS enforces org/project isolation
- Subscription limits enforced at org level
- Template versions are immutable once published

## Agent Handoff

- Always read `docs/AI_HANDOFF.md` first
- Update it at every checkpoint
- Trust repo evidence over handoff claims
- One agent modifies working tree at a time

## Claude + Codex: Interchangeable Agents

- Claude and Codex are **peers**, not fixed architect/implementer roles. Either may plan, code, test, review, debug, or complete a milestone.
- When one agent reaches its context or usage limit, the other resumes the **same unfinished task**. Do not restart the milestone, repeat completed work, or assume unverified work is complete.
- **Session start:** Read `AGENTS.md`, `docs/AI_HANDOFF.md` and `docs/FEATURE_MAP.md`; inspect the current branch, working-tree state, and latest commit. Read only the files needed for the active task.
- Follow repository evidence when docs and code conflict; correct stale handoff notes rather than silently trusting them.
- Only one agent may change a working tree at a time. Never run competing editors or overlapping Git operations across agents.
- **Session end or handoff:** Update `docs/AI_HANDOFF.md` with CURRENT_MILESTONE, CURRENT_TASK, STATUS, LAST_VERIFIED_COMMIT, COMPLETED, FILES_CHANGED, TESTS_PASSED, TESTS_FAILED, UNCOMMITTED_CHANGES, BLOCKERS, NEXT_EXACT_ACTION, and IMPORTANT_WARNINGS.
- Specify whether changes are local-only, committed, or pushed. Do not mark a commit or test verified unless actually confirmed. If an agent stops mid-command, the incoming agent must verify its result.
- Keep the handoff concise. Include exact paths and the next actionable step, not a full conversation transcript.

## Git Workflow — Main Until Foundation Is Stable

### Phase A: Initial foundation (current default)

- **Work directly on `main`** while the complete project foundation is being built and stabilised. Do **not** create development, staging, experiment, or per-milestone branches during this phase.
- Foundation work, initial integration, setup corrections, and incidental patches stay on `main` until the stability gate is approved.
- Make small, logical commits only after relevant checks pass. Never force-push, reset away other work, rewrite published history, or commit secrets.
- Review existing changes before writing; respect uncommitted work from the previous agent.
- Do not push proprietary code while the GitHub repository is public. Confirm repository privacy before any such push. Never put credentials in Git regardless of visibility.

### Foundation stability gate

Declare the foundation **ready for review** only after verifying:
1. `packages/api`, `packages/web`, and `packages/shared` build and typecheck successfully.
2. Hono API starts, `/api/v1` routing works, and the frontend integration contract is documented.
3. PostgreSQL versioned migrations can be applied and checked in a reproducible test environment.
4. Supabase JWT authentication and organisation/project access boundaries have working tests.
5. Lint, relevant unit/integration tests, and CI checks pass, without unresolved critical security or foundation errors.
6. Configuration, `.env.example`, documentation, feature map, and AI handoff agree with the real code.
7. The system has an identified baseline commit and an evidence-based stability report.

This gate does **not** require every inventory feature, payment flow, or enterprise provisioning workflow to be finished. **Do not switch branching policy automatically**: record readiness and obtain the user's explicit approval.

### Phase B: Stable baseline (only after user approval)

- Keep `main` as the stable integration branch.
- Create a short-lived branch **only for new features or bug fixes/patches**:
  - `feature/<short-description>`
  - `fix/<short-description>`
  - `hotfix/<short-description>` for urgent fixes
- Branch from the latest verified `main`. Never create branches simply to run tests, review documentation, or switch AI agents.
- Implement the scoped change, run focused tests, and open a PR to `main` with a concise summary and test evidence. Merge only after required checks pass.
- Avoid direct feature/patch commits to `main` after Phase B starts. No force pushes; do not delete branches with unmerged work.

## Implementation and Safety Priorities

- Preserve the subscription contract: Free **2** projects, Starter **5**, Business **10**, Enterprise **custom**; limits apply per organisation. Other quotas are configurable and must not be invented.
- Free/Starter/Business use a shared inventory database. Enterprise supports shared or dedicated PostgreSQL by approved configuration; do not provision paid infrastructure speculatively.
- Keep domain/business logic portable between Vercel Functions now and Docker + NGINX + on-premises PostgreSQL later. Preserve the `/api/v1` contract through migration.
- Treat billing, tenant isolation, quotas, stock adjustments, and RLS as security-critical. Authorise server-side, validate all input, use race-safe database transactions, and add focused regression tests.
- Never execute destructive database migrations, reveal secrets, or deploy production changes without explicit authorisation.
- Do not assume that migrating Supabase PostgreSQL also migrates Auth users, Storage objects, or their configurations; plan those separately.

## Token-Efficient Navigation and Validation

- Use `docs/FEATURE_MAP.md` and the available code graph tools before broad searches. For symbol bodies, prefer `code-outline`; for dependencies, blast radius, and reviews, prefer `code-review-graph`.
- Graph indexes may be missing or stale. If a graph tool is unavailable, fails, or returns incomplete data, fall back to a targeted `rg`, `git diff`, or exact file/range read; do not block necessary work.
- Avoid reading entire directories, repeated repository-wide audits, long terminal output, or duplicate checks.
- After source edits, refresh indexes when available; if indexing fails, report the failure without treating it as a failed code build.
- Run the smallest meaningful tests for the change, then required full checks at milestone/stability gates.
- Keep final output brief: changed files, tests/results, commit/hash (if verified), blockers, and next action.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes â€” gives risk-scored analysis |
| `get_review_context` | Need source snippets for review â€” token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

<!-- code-outline-graph:start -->
## code-outline-graph MCP Tools

This project is indexed with [code-outline-graph](https://github.com/rushikeshsakharleofficial/code-outline-graph). MCP server name: `code-outline`. Use these tools instead of reading source files directly (10x–50x fewer tokens).

| Tool | When to use |
|------|-------------|
| `resolve_edit_target(description)` | Find function/class by natural language — returns signatures only, no body |
| `read_symbol_body(name, file)` | Read one symbol's source lines (never the full file) |
| `list_outline(file)` | All symbols + line ranges in a file |
| `get_outline_summary(file)` | Compressed signatures view |
| `find_by_keyword(query)` | Search all indexed symbol names |
| `get_file_header(file)` | Imports + top-level constants only |
| `get_symbol(name)` | Exact symbol metadata |
| `get_line_range(file, start, end)` | Read arbitrary line slice |
| `update_project(path?)` | Reindex changed files |
| `prune_project(path?)` | Remove stale rows for deleted or ignored files |

Fall back to direct file reads only if these return empty results.

**After every code change:** run `code-outline-graph update .` to keep the index current.
<!-- code-outline-graph:end -->
