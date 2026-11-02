# M6: Template builder backend

Status: Approved by user, 2026-11-02; implemented and locally verified.

## Intent and approach

Provide project-scoped templates that define inventory attributes for M7. Continue
on main and preserve the existing uncommitted M4/M5 work.

The user accepted the recommended typed-field approach. Arbitrary JSON schemas
offer more flexibility but require choosing and securing a separate schema dialect
and validator; typed fields give the future builder and item validator one contract.
The following field types and lifecycle details are proposed implementation choices.

## Attribute schema

Version schemas have the strict shape `{ fields: [...] }`. Each field contains
`key`, `label`, `type`, and `required` (default false). Keys match
`^[a-z][a-z0-9_]{0,63}$`, are unique within the version, and cannot be `__proto__`,
`prototype` or `constructor`. Labels are trimmed, nonempty, at most 200 characters.
Types are `text`, `number`, `boolean`, `date`, and `select`. Only select fields
accept `options`: a nonempty array of unique, trimmed, nonempty strings of at
most 200 characters. Reject options for other types and all unknown properties.
An empty fields array is valid for inventories needing only built-in item fields.
Array order defines display order; field keys identify attributes, independently
of item name/SKU. No defaults, computed fields, nested objects, multi-select,
custom validation rules or attribute migration in M6.

Export shared typed definitions and reusable Zod validation for M7. Existing
stored draft schemas that do not match this contract must be edited before
publication; do not rewrite existing data automatically. Published versions stay
immutable. Changing field keys/types is allowed in a new version; existing items
remain bound to their original version, without automatic conversion.

## Endpoints and responses

Base: `/api/v1/organisations/:orgId/projects/:projectId/templates`.

- POST `/`: `{ name, description? }`; create metadata only, return 201.
- GET `/`: cursor-paginated metadata, ordered by createdAt then UUID ascending.
- GET `/:templateId`: template metadata including nullable currentVersionId.
- PATCH `/:templateId`: name and/or nullable description; at least one field.
- DELETE `/:templateId`: delete only templates with no versions. Return the usual
  data/id/requestId envelope. No cascading deletion or archival in M6.
- POST `/:templateId/versions`: `{ schema }`; allocate the next positive version
  number atomically under a template-row lock and create a draft, return 201.
- GET `/:templateId/versions`: paginated by increasing version number.
- GET `/:templateId/versions/:versionId`: read schema and publication metadata.
- PATCH `/:templateId/versions/:versionId`: replace the entire draft `{ schema }`.
- DELETE `/:templateId/versions/:versionId`: delete a draft only.
- POST `/:templateId/versions/:versionId/publish`: no payload; atomically publish
  the draft with a server timestamp and update currentVersionId. Return the version.

Multiple drafts are allowed. Allocate max(existing version)+1 under the lock;
numbers are positive ordering identifiers, not gapless audit identifiers, and a
deleted highest draft's number may be reused. PostgreSQL integer exhaustion is a
409 conflict. Publication order, rather than version number, selects the current
version. Repeating publish for an already published version returns 409 and does
not change the pointer; no standalone current-version setter in this milestone.

Use existing data/requestId and pagination envelopes, camelCase mapping and shared
entities. Version responses also expose projectId for explicit scope. Names are
trimmed 1–200 characters, descriptions nullable and at most 2000 characters.
UUIDs, queries, bodies and DB results use strict Zod validation. List limits are
1–100, default 20; opaque validated cursors bind to project and, for versions,
template. Metadata cursors validate timestamp/UUID tuples before query emission.
Pagination does not promise a snapshot during concurrent edits or deletions.

## Security and atomicity

Reuse JWT/org/project scope and owner/admin write guards; all project members may
read. Every query uses caller-JWT inventory access plus explicit project/template
filters. No service-role shortcut. Wrong-scope or inaccessible references return
404, forbidden roles 403, invalid input 400. Preserve common error/code/requestId.

Add forward migration 006, leaving 005 unchanged. Use invoker-security inventory
RPCs for draft allocation and publication. Both lock the scoped parent template,
validate caller project owner/admin status inside the transaction, and preserve
RLS. Publication locks the version, validates the typed schema, freezes it and
updates the template pointer in one transaction. Updates/deletes and publish must
serialize on the version row so a schema cannot change after validation. Failure
rolls back both publication and current-version changes. No client timestamp,
version number, publication flag or tenant identity is accepted by the API.

Enforce the typed schema at the database publication boundary as well, including
direct authenticated writes permitted by 005; use a reusable SQL validator/trigger
so a malformed draft cannot bypass validation by setting published_at directly.
Keep existing published immutability and composite foreign keys authoritative.
Existing direct SQL publication need not change the current pointer, but must
never permit invalid schemas or mutation of a published version.

Document stable codes: TEMPLATE_NOT_FOUND, TEMPLATE_VERSION_NOT_FOUND,
TEMPLATE_IN_USE, TEMPLATE_VERSION_PUBLISHED, INVALID_TEMPLATE_SCHEMA and
TEMPLATE_VERSION_CONFLICT. Referenced/published deletion returns 409. Unexpected
or malformed DB responses remain 500 without exposing database details.

## Boundaries and verification

No UI, item/stock API, item migration, category-template assignment, new business
quotas, dependencies, infrastructure, hosted migrations, deployment or push.
Request size and schema complexity safeguards should reuse existing application
limits; any new technical limits must be explicit in the implementation contract,
not described as subscription quotas.

First observe focused failing tests, then implement. Cover CRUD, strict field
validation, defaults, field ordering, pagination/cursor isolation, complete role
matrix, revoked membership, wrong project/template/version and malformed DB results.
Use real Supabase builders with controlled fetch to prove JWT/schema selection,
scoped query emission, RPC arguments and error mapping. Executable SQL tests prove
allocation, publication rollback, direct-write schema validation, RLS, immutability,
pointer integrity and draft update/delete interactions. Do not claim serialized
PGlite proves concurrent sessions; attempt real multi-session checks only if a
local server is available, otherwise document that limitation and lock analysis.

Run workspace tests/typecheck/build and lint, recording the existing ESLint blocker
if unchanged. Refresh code indexes, review changes and update API/database docs,
feature map, roadmap and handoff. Commit only this milestone's logical changes
after verification when practical; never accidentally bundle preceding M4/M5 work.
