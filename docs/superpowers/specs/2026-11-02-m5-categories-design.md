# M5: Category API

Status: Approved by user; implemented and locally verified on 2026-11-02.

## Intent and approach

Expose M4 categories through the existing authenticated project API. Preserve all
uncommitted M4 implementation and documentation; continue on main.

Recommended: CRUD plus cursor-paginated flat listings and optional parent filter.
Use existing PostgreSQL hierarchy triggers for atomic path derivation and moves.
Alternative: return recursive full trees. That introduces response-size/depth
decisions and is unnecessary for this milestone; no tree endpoint is proposed.

## Endpoints

Base: `/api/v1/organisations/:orgId/projects/:projectId/categories`.

- POST `/`: create with `{ name, parentId?, sortOrder? }`; parent defaults null,
  sort order defaults 0. Return 201 with the created category.
- GET `/`: list with limit 1–100 (default 20), opaque cursor, and optional
  `parentId=<uuid>` for direct children or `parentId=root` for roots. Without the
  parent filter, list all categories in that project. Order by sortOrder then UUID.
- GET `/:categoryId`: read one category in the current project.
- PATCH `/:categoryId`: change name, parentId and/or sortOrder; at least one field
  required. Null parent moves to root; moving a category also updates descendants'
  derived paths inside the database transaction.
- DELETE `/:categoryId`: delete an unused category. Do not cascade children/items.
  Return `{ data: { id }, requestId }` on success.

Responses map storage columns to shared Category fields: id, projectId, name,
parentId, path, sortOrder, createdAt, updatedAt. Lists use the existing pagination
envelope. Cursor validation must be strict and support deterministic tuple ordering;
do not interpolate unchecked cursor values into database filters.

## Permissions and validation

Reuse JWT, orgScope, projectScope and explicit project-role guards. All project
members can read; only project owner/admin (including inherited org roles) can
create, move, edit, order or delete. Editors/viewers cannot write categories.

All category queries use the caller's JWT in the inventory schema and explicitly
filter project_id. Never use the service-role client to bypass category RLS.
Scope/category IDs must be UUIDs. Trim names and require 1–200 characters;
sortOrder must fit a PostgreSQL signed 32-bit integer. Reject unknown fields,
client paths, tenant identity, timestamps and empty PATCH bodies with Zod.
Validate database results before returning responses.

Inaccessible category/parent references, including same-org sibling projects,
return 404 without leaking the other scope. Cycles are rejected with a documented
conflict response; referenced categories return 409/CATEGORY_IN_USE. Invalid input
returns 400; insufficient role 403; unexpected database failures remain 500.
All errors preserve the common error/code/requestId envelope.

Parent validation must not rely solely on an application preflight: retain M4's
composite FKs, cycle trigger and project lock as authoritative checks under races.
Do not edit migration 005; any required database corrections use migration 006.

## Boundaries

No category tree endpoint, batch reorder, cascading deletion, frontend, template,
inventory item or stock API. No new quotas, infrastructure, dependencies or hosted
migrations. Audit/reporting expansion remains M9; this milestone uses the existing
category schema and access model.

## Verification

Observe missing-route tests fail before implementation. Test CRUD, defaults,
parent/root filtering, sort/cursor ties, malformed cursors/IDs/bodies, role matrix,
wrong org/project/category/parent, revoked membership, cycle and deletion errors,
and unexpected/malformed database responses. Verify the inventory schema is selected
without losing the caller JWT. Extend executable SQL tests only where new behavior
or a correction requires proof; reuse M4 hierarchy/RLS tests rather than duplicate them.

Run workspace tests, typecheck/build and lint; record the existing ESLint blocker
if unchanged. Review the diff and update API contracts, feature map, roadmap and
handoff. Hosted PostgREST and true concurrent sessions remain separate verification
limitations; do not claim them covered by HTTP mocks or serialized PGlite tests.
