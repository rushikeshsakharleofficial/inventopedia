# M4: Inventory database schema

Status: Approved by user; implemented and locally verified on 2026-11-02.

## Intent

Add the project-scoped inventory foundation described by ARCHITECTURE.md and the
shared entity types. Continue on main from M3 commit fca1ca9. Create migration
005_inventory_schema.sql; preserve migrations 001–004.

## Approach

Recommended: create the five related tables together in the inventory schema,
including their foreign keys, RLS and integrity protections. This allows executable
tests to verify the whole project boundary before later API milestones use it.

Alternative: introduce each table alongside M5–M8 APIs. This reduces this migration's
size but delays validation of cross-table tenant links. Recommended approach is
approved by the user.

## Tables

- categories: project, name, parent, materialized path, sort order, timestamps.
  Parent must belong to the same project; reject cycles and invalid derived paths.
- templates: project, name, description, current published version, timestamps.
- template_versions: project and template identity, positive version number,
  JSONB schema object, publication timestamp, creation timestamp. Version numbers
  are unique per template. Published content and identity cannot be changed or
  deleted; the current-version pointer must reference that template's published version.
- items: project, published template version, optional same-project category,
  name, optional SKU, JSONB attributes object, quantity, timestamps. Items retain
  their original version reference when newer template versions are published.
- stock_movements: project, item, movement type, quantity/delta, reason, optional
  idempotency reference, actor and timestamp. Item and movement project must agree.
  Records are immutable; scoped non-null idempotency references must be unique.

Use UUID identifiers, composite foreign keys where needed to prevent cross-project
references, indexes on foreign keys and project lookup paths, and a GIN index on
item attributes. Do not add product-specific attributes, quotas or paid extensions.

## Access and invariants

Reuse caller-bound private.project_role, including org membership revocation.
Every inventory table has RLS. Project viewers can read their project inventory;
owner/admin manage categories/templates, and owner/admin/editor manage item
metadata. Ordinary org membership alone grants no inventory access. Parent/project,
template/version, and actor identity cannot be rewritten through broad grants.

Published versions and movements have database immutability guards, including
against service-role updates. Item quantity starts at zero and cannot be directly
edited by tenant clients. Movement insertion and quantity adjustment remain closed
to tenant clients until the transactional stock API in M8 is implemented; M4 does
not expose an incomplete stock mutation path. Future stock semantics, including
fractional quantities and negative-stock policy, remain decisions for M8.

Approved retention rule: inventory rows restrict deletion of their containing
project and referenced records. This preserves published versions and movement
history without cascade exceptions to immutability. Add a narrow compatibility
change mapping a project-delete foreign-key conflict to 409/PROJECT_NOT_EMPTY;
empty-project deletion keeps M3 behavior. A tenant purge workflow is future work.

## Boundaries

No category/template/item/stock REST endpoints, frontend changes, billing,
attachments, dedicated database provisioning, or hosted migration execution.
JSONB must be an object; validation against template field definitions belongs
to the later template/item API milestones. No new subscription quotas.

## Verification and documentation

Executable PostgreSQL tests apply 001–005 and verify fresh migration, role matrix,
cross-org/project reads and writes, revoked memberships, composite foreign keys,
category hierarchy invariants, version immutability and publication references,
JSONB object checks, quantity write denial, movement immutability, idempotency
uniqueness, and project retention. Add a regression test for the delete-conflict
API mapping. Run workspace tests, typecheck/build and report existing lint limits.
Update database docs, feature map, roadmap and handoff with exact results.

Hosted Supabase and multi-session concurrency checks require an available test
environment; do not represent serialized PGlite tests as concurrency proof.
