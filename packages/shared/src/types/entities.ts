/** Organisation — tenant boundary */
export interface Organisation {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

/** Organisation membership */
export interface OrgMember {
  id: string;
  orgId: string;
  userId: string;
  role: OrgRole;
  createdAt: string;
}

export type OrgRole = 'owner' | 'admin' | 'member';

/** Project — data isolation unit */
export interface Project {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Project-level role */
export type ProjectRole = 'owner' | 'admin' | 'editor' | 'viewer';

/** Category — nested, project-scoped */
export interface Category {
  id: string;
  projectId: string;
  name: string;
  parentId: string | null;
  path: string; // materialized path
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** Template definition */
export interface Template {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Immutable template version */
export interface TemplateVersion {
  id: string;
  templateId: string;
  version: number;
  schema: Record<string, unknown>; // JSONB attribute definitions
  publishedAt: string | null;
  createdAt: string;
}

/** Inventory item */
export interface InventoryItem {
  id: string;
  projectId: string;
  templateVersionId: string;
  categoryId: string | null;
  name: string;
  sku: string | null;
  attributes: Record<string, unknown>; // JSONB
  quantity: number;
  createdAt: string;
  updatedAt: string;
}

/** Stock movement — immutable transaction */
export interface StockMovement {
  id: string;
  itemId: string;
  type: StockMovementType;
  quantity: number;
  reason: string | null;
  referenceId: string | null; // idempotency key
  createdBy: string;
  createdAt: string;
}

export type StockMovementType = 'receive' | 'ship' | 'adjust' | 'transfer' | 'return';

