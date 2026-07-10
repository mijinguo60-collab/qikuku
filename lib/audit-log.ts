/**
 * 审计日志工具
 */
import { getDb } from '@/lib/db';
import { v4 as uuid } from 'uuid';

export interface AuditEntry {
  companyId: string;
  userId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: string;
  ip?: string;
}

export async function writeAuditLog(entry: AuditEntry) {
  try {
    const db = getDb();
    await db.prepare(`INSERT INTO "AuditLog" (id, "companyId", "userId", action, "targetType", "targetId", result, ip, "createdAt") VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(uuid(), entry.companyId || null, entry.userId || null, entry.action, entry.targetType || null, entry.targetId || null, entry.detail || null, entry.ip || null, new Date().toISOString());
  } catch (e: any) { console.error('[AUDIT]', e.message); }
}

export async function getRecentAuditLogs(companyId: string, limit = 50) {
  const db = getDb();
  return await db.prepare(`SELECT a.*, u.name as "userName" FROM "AuditLog" a LEFT JOIN "User" u ON a."userId" = u.id WHERE a."companyId" = ? ORDER BY a."createdAt" DESC LIMIT ?`).all(companyId, limit);
}
