import { z } from 'zod';
import { createProjectSchema, updateProjectSchema, projectQuerySchema } from './services/projects.js';
import { createCategorySchema, updateCategorySchema, categoryQuerySchema } from './services/categoryValidation.js';
import { createTemplateSchema, updateTemplateSchema, versionInputSchema, templateQuerySchema, versionQuerySchema } from './services/templateValidation.js';
import { createItemSchema, updateItemSchema, itemQuerySchema } from './services/inventoryValidation.js';
import { createMovementSchema, movementQuerySchema, movementTypeSchema } from './services/stockValidation.js';
import { dashboardSchema, auditEventSchema, auditQuerySchema } from './services/observability.js';
import { attachmentInputSchema, attachmentRowSchema, attachmentQuerySchema } from './services/attachments.js';

const id = z.string().guid();
const time = z.string().datetime({ offset: true });
const timestamps = { createdAt: time, updatedAt: time };
const description = z.string().nullable();
const role = z.enum(['owner', 'admin', 'member']);
const organisation = z.object({ id, name: z.string(), slug: z.string(), ...timestamps });
const orgWithRole = organisation.extend({ userRole: role });
const project = z.object({ id, orgId: id, name: z.string(), description, ...timestamps });
const category = z.object({ id, projectId: id, name: z.string(), parentId: id.nullable(), path: z.string(), sortOrder: z.number().int(), ...timestamps });
const template = z.object({ id, projectId: id, name: z.string(), description, currentVersionId: id.nullable(), ...timestamps });
const version = z.object({ id, projectId: id, templateId: id, version: z.number().int().positive(), schema: z.record(z.string(), z.unknown()), publishedAt: time.nullable(), createdAt: time });
const item = z.object({ id, projectId: id, templateVersionId: id, categoryId: id.nullable(), name: z.string(), sku: z.string().nullable(), attributes: z.record(z.string(), z.unknown()), quantity: z.number().finite(), ...timestamps });
const movement = z.object({ id, itemId: id, destinationItemId: id.nullable().optional(), type: movementTypeSchema, quantity: z.number().finite(), reason: description, referenceId: description, createdBy: id, createdAt: time });
export const createOrgSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(3).max(64).regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/, 'Invalid slug format'),
}).strict();
export const errorSchema = z.object({
  error: z.string(), code: z.string(), requestId: z.string(),
  details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
const envelope = (data: z.ZodTypeAny) => z.object({ data, requestId: z.string() });
const paginated = (data: z.ZodTypeAny) => z.object({ data: z.array(data),
  pagination: z.object({ cursor: z.string().nullable(), hasMore: z.boolean() }), requestId: z.string() });
const deleted = z.object({ id });

export interface Contract {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  access: string;
  status: number;
  response: z.ZodTypeAny;
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
}
export const contracts: Contract[] = [];
function add(method: Contract['method'], path: string, response: z.ZodTypeAny,
  access: string, body?: z.ZodTypeAny, query?: z.ZodTypeAny, status = 200) {
  contracts.push({ method, path: `/api/v1${path}`, access, status, response, body, query });
}
const org = '/organisations';
const projects = `${org}/{orgId}/projects`;
const scoped = `${projects}/{projectId}`;
add('GET', '/health', z.object({ status: z.literal('ok'), service: z.literal('inventopedia-api'), version: z.string(), timestamp: time }), 'Public');
add('GET', '/openapi.json', z.object({ openapi: z.literal('3.1.0'), info: z.object({ title: z.string(), version: z.string() }), paths: z.record(z.string(), z.unknown()), components: z.record(z.string(), z.unknown()) }), 'Public');
add('POST', org, envelope(organisation), 'Signed in', createOrgSchema, undefined, 201);
add('GET', org, envelope(z.array(orgWithRole)), 'Signed in');
add('GET', `${org}/{orgId}`, envelope(orgWithRole), 'Org member');
add('GET', `${org}/{orgId}/members`, envelope(z.array(z.object({ id, orgId: id, userId: id, role, createdAt: time }))), 'Org member');
add('GET', `${org}/{orgId}/subscription`, envelope(z.object({ tier: z.enum(['free','starter','business','enterprise']), maxProjects: z.number().int().nullable(), projectsUsed: z.number().int(), projectsRemaining: z.number().int().nullable() })), 'Org owner/admin');

function crud(path: string, entityId: string, result: z.ZodTypeAny, create: z.ZodTypeAny,
  update: z.ZodTypeAny, query: z.ZodTypeAny, access: string) {
  add('POST', path, envelope(result), access, create, undefined, 201);
  add('GET', path, paginated(result), 'Member', undefined, query);
  add('GET', `${path}/{${entityId}}`, envelope(result), 'Member');
  add('PATCH', `${path}/{${entityId}}`, envelope(result), access, update);
  add('DELETE', `${path}/{${entityId}}`, envelope(deleted), access);
}
crud(projects, 'projectId', project, createProjectSchema, updateProjectSchema, projectQuerySchema, 'Owner/admin');
contracts.find((c) => c.method === 'DELETE' && c.path === `/api/v1${scoped}`)!.access = 'Org owner';
crud(`${scoped}/categories`, 'categoryId', category, createCategorySchema, updateCategorySchema, categoryQuerySchema, 'Project owner/admin');
crud(`${scoped}/templates`, 'templateId', template, createTemplateSchema, updateTemplateSchema, templateQuerySchema, 'Project owner/admin');
const versions = `${scoped}/templates/{templateId}/versions`;
add('POST', versions, envelope(version), 'Project owner/admin', versionInputSchema, undefined, 201);
add('GET', versions, paginated(version), 'Project member', undefined, versionQuerySchema);
add('GET', `${versions}/{versionId}`, envelope(version), 'Project member');
add('PATCH', `${versions}/{versionId}`, envelope(version), 'Project owner/admin', versionInputSchema);
add('DELETE', `${versions}/{versionId}`, envelope(deleted), 'Project owner/admin');
add('POST', `${versions}/{versionId}/publish`, envelope(version), 'Project owner/admin; no request body');
crud(`${scoped}/items`, 'itemId', item, createItemSchema, updateItemSchema, itemQuerySchema, 'Project owner/admin/editor');
const stock = `${scoped}/stock/movements`;
add('POST', stock, envelope(movement.extend({ resultingQuantity: z.number().finite(), destinationResultingQuantity: z.number().finite().optional() })), 'Project owner/admin/editor', createMovementSchema, undefined, 201);
add('GET', stock, paginated(movement), 'Project member', undefined, movementQuerySchema);
add('GET', `${stock}/{movementId}`, envelope(movement), 'Project member');
add('GET', `${scoped}/dashboard`, envelope(dashboardSchema), 'Project member');
add('GET', `${scoped}/audit`, paginated(auditEventSchema), 'Project owner/admin', undefined, auditQuerySchema);
const attachments = `${scoped}/items/{itemId}/attachments`;
add('POST', attachments, envelope(attachmentRowSchema.extend({ bucket: z.literal('inventory-attachments'), path: z.string() })), 'Project owner/admin/editor', attachmentInputSchema, undefined, 201);
add('GET', attachments, paginated(attachmentRowSchema), 'Project member', undefined, attachmentQuerySchema);
add('GET', `${attachments}/{attachmentId}/download`, envelope(z.object({ signedUrl: z.string().url() })), 'Project member');
add('DELETE', `${attachments}/{attachmentId}`, envelope(deleted), 'Project owner/admin/editor');

function jsonSchema(schema: z.ZodTypeAny) {
  const result = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
  const { $schema: dialect, ...value } = result;
  void dialect;
  return value;
}
function operation(contract: Contract) {
  const parameters: Record<string, unknown>[] = [...contract.path.matchAll(/\{([^}]+)\}/g)].map((match) => ({
    name: match[1], in: 'path', required: true, schema: { type: 'string', format: 'uuid' },
  }));
  if (contract.query) {
    const query = jsonSchema(contract.query) as { properties?: Record<string, unknown>; required?: string[] };
    for (const [name, schema] of Object.entries(query.properties ?? {})) {
      parameters.push({ name, in: 'query', required: query.required?.includes(name) ?? false, schema });
    }
  }
  const responses: Record<string, unknown> = {
    [contract.status]: { description: 'Success', content: { 'application/json': { schema: jsonSchema(contract.response) } } },
  };
  for (const status of [400,401,403,404,409,500]) responses[status] = {
    description: 'Common error envelope', content: { 'application/json': { schema: jsonSchema(errorSchema) } },
  };
  return { operationId: `${contract.method.toLowerCase()}${contract.path.replace(/[^a-zA-Z0-9]/g, '_')}`,
    description: `Access: ${contract.access}. Custom Zod refinements and cursor scope checks also apply; see API_V1.md.`,
    security: contract.access === 'Public' ? [] : [{ bearerAuth: [] }], parameters, responses,
    ...(contract.body ? { requestBody: { required: true, content: { 'application/json': { schema: jsonSchema(contract.body) } } } } : {}),
  };
}
export function createOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const contract of contracts) (paths[contract.path] ??= {})[contract.method.toLowerCase()] = operation(contract);
  return { openapi: '3.1.0', info: { title: 'Inventopedia API', version: '1.0.0' }, paths,
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } } };
}
