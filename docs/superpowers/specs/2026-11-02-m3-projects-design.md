# M3: Project management and subscription limits

Status: Approved by user on 2026-11-02; implemented and locally verified.

## Intent and scope

Expose the existing project model through the authenticated REST API and enforce
project quotas per organisation. Continue on main under the foundation policy.
Preserve M2 security and the existing working-tree handoff update.

## Approaches

Recommended: reuse the database creation transaction, strengthen it through a
forward migration where required, and add Hono routes/services. This retains
race-safe quota enforcement with the existing portable PostgreSQL model.

Alternative: enforce quotas entirely in application code. This would require
additional transactional coordination and offers no advantage over the existing
subscription-row lock. User approved the recommended approach.

## Approved API

- POST /api/v1/organisations/:orgId/projects: org owner/admin creates a project;
  creation also assigns its creator as project owner and records an audit event.
- GET /api/v1/organisations/:orgId/projects: cursor-paginated list of projects
  visible to the caller through existing tenant RLS.
- GET /api/v1/organisations/:orgId/projects/:projectId: project member reads.
- PATCH /api/v1/organisations/:orgId/projects/:projectId: project owner/admin
  updates name and description only.
- DELETE /api/v1/organisations/:orgId/projects/:projectId: org owner deletes.
- GET /api/v1/organisations/:orgId/subscription: org owner/admin reads tier,
  configured project limit, current usage, and remaining project capacity.

Use existing JWT, org/project scope and role middleware, Zod validation, and the
standard error envelope. Validate database results. Cursor pagination must have
deterministic ordering and reject malformed cursors.

## Quotas and security

Free permits 2 projects, Starter 5, Business 10, Enterprise its configured custom
limit. Preserve existing Enterprise null-limit semantics; add no other quotas.
Project creation must check actor membership server-side and atomically check
quota, insert project, create membership, and write audit. Keep privileged RPCs
inaccessible to authenticated/anonymous database roles. Reads and ordinary edits
use caller-scoped clients. Reject cross-organisation scope and privilege bypass.
Quota rejection returns a documented conflict response; unexpected database
errors remain internal errors. Do not permit subscription edits through this API.

## Boundaries

No billing, plan-change endpoint, frontend UI, inventory features, dedicated
database provisioning, deployment, or hosted migration execution in M3.
Membership-management endpoints remain outside this proposed slice.

## Verification

Add focused API/service tests for validation, role permissions, tenant isolation,
pagination, quotas, and database failures. Extend executable SQL tests for quota
boundaries, atomic rollback and forbidden direct writes. Use a genuine concurrent
database check if available; otherwise explicitly document that limitation rather
than treating serialized SQL tests as concurrency proof. Run workspace tests,
typecheck and build; report the existing lint limitation separately. Refresh code
indexes after source changes and update API/database/feature-map/roadmap/handoff
documentation with actual results.

## Approved decisions

Backend-only scope; subscription usage visible to org owner/admin; physical
project deletion follows the existing schema and owner-only permission.
Protocol details and execution evidence are recorded in the implementation plan.
