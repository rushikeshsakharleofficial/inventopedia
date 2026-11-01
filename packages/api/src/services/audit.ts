import { getSupabaseAdmin } from '../db/index.js';

export interface AuditLogEntry {
  orgId: string;
  userId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Write an audit log entry. Uses admin client (bypasses RLS).
 * Non-blocking: errors are logged but do not propagate.
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase.from('audit_logs').insert({
      org_id: entry.orgId,
      user_id: entry.userId,
      action: entry.action,
      entity_type: entry.entityType || null,
      entity_id: entry.entityId || null,
      metadata: entry.metadata || {},
      ip_address: entry.ipAddress || null,
    });

    if (error) {
      console.error(`Audit log write failed: ${error.message}`);
    }
  } catch (err) {
    console.error('Audit log write error:', err);
  }
}
