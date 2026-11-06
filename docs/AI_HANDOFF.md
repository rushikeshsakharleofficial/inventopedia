# AI Handoff — Inventopedia

CURRENT_MILESTONE: M7 — Inventory CRUD API
CURRENT_TASK: M7 complete
STATUS: Complete
LAST_VERIFIED_COMMIT: d564d42 (M4-M6), M7 about to commit
COMPLETED:
  - M0-M6: foundation, control schema, auth, subscriptions, projects, categories, templates
  - M7: Inventory CRUD API
    - inventoryValidation.ts: Zod schemas for create/update, cursor pagination, attribute validation against template schema
    - inventory.ts service: CRUD with caller-JWT, attribute validation against published template version fields
    - inventory.ts route: HTTP routes at /:orgId/projects/:projectId/items
    - Attribute validation: validates attributes against published template version typed fields (text/number/boolean/date/select)
    - Merge-on-update: partial attribute updates merge with existing then validate
    - Template version enforcement: only published versions accepted for item creation
    - Template version immutability: template_version_id cannot be changed on update (DB trigger)
    - Item deletion protection: items with stock movements cannot be deleted (FK restrict)
    - Cursor pagination: created_at DESC + id ASC with encoded scope (category/template filter binding)
    - Filtering: categoryId, templateId, search (name/sku ilike)
    - Role guard: editors+ for writes, all project members for reads
FILES_CHANGED:
  - packages/api/src/services/inventoryValidation.ts (new)
  - packages/api/src/services/inventoryValidation.test.ts (new)
  - packages/api/src/services/inventory.ts (new)
  - packages/api/src/routes/inventory.ts (new)
  - packages/api/src/routes/organisations.ts (mounted inventory route)
  - packages/api/tests/inventory.test.ts (new)
TESTS_PASSED: 436 total (435 API + 1 web), 18 test files, 0 failures
TESTS_FAILED: None
UNCOMMITTED_CHANGES: M7 files
BLOCKERS: None
NEXT_EXACT_ACTION: Begin M8 — Stock Transaction API
IMPORTANT_WARNINGS: Repository is PUBLIC — do not push secrets
