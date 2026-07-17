/**
 * 操作审计日志
 */

import { getDb } from './db';
import { v4 as uuidv4 } from 'uuid';
import { serializeSanitizedAuditDetail } from './audit/sanitize';

export async function logAction(params: {
  companyId: string;
  userId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  result?: unknown;
}): Promise<void> {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO "AuditLog" (id, "companyId", "userId", action, "targetType", "targetId", result, "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  await stmt.run(
    uuidv4(),
    params.companyId,
    params.userId || null,
    params.action,
    params.targetType || null,
    params.targetId || null,
    serializeSanitizedAuditDetail(params.result),
    new Date().toISOString()
  );
}

export async function getAuditLogs(companyId: string, limit = 50) {
  const db = getDb();
  return await db.prepare(
    'SELECT a.*, u.name as userName FROM "AuditLog" a LEFT JOIN "User" u ON a."userId" = u.id WHERE a."companyId" = ? ORDER BY a."createdAt" DESC LIMIT ?'
  ).all(companyId, limit);
}
