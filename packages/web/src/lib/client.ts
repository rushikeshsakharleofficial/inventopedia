import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const supabase = url && key ? createClient(url, key) : null;

const envelope = z.object({ data: z.unknown(), pagination: z.object({ cursor: z.string().nullable(), hasMore: z.boolean() }).optional() });
const apiError = z.object({ error: z.string(), code: z.string(), requestId: z.string() });

export class RequestError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

export async function request<T extends z.ZodType>(token: string, path: string, schema: T, init?: RequestInit) {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = apiError.safeParse(payload);
    throw new RequestError(error.success ? error.data.error : 'The request could not be completed.', response.status, error.success ? error.data.code : undefined);
  }
  const result = envelope.parse(payload);
  return { data: schema.parse(result.data), pagination: result.pagination };
}

export const named = z.object({ id: z.string(), name: z.string() });
export const orgSchema = named.extend({ slug: z.string(), userRole: z.string().optional() });
export const projectSchema = named.extend({ description: z.string().nullable().optional() });
export const itemSchema = named.extend({ sku: z.string().nullable(), quantity: z.number(), categoryId: z.string().nullable(), templateVersionId: z.string(), attributes: z.record(z.string(), z.unknown()) });
export const categorySchema = named.extend({ parentId: z.string().nullable(), path: z.string(), sortOrder: z.number() });
export const templateSchema = named.extend({ description: z.string().nullable(), currentVersionId: z.string().nullable() });
export const movementSchema = z.object({ id: z.string(), itemId: z.string(), type: z.string(), quantity: z.number(), reason: z.string().nullable(), createdAt: z.string() });
export const dashboardSchema = z.object({ items: z.number(), categories: z.number(), templates: z.number(), movements: z.number(), outOfStockItems: z.number() });
