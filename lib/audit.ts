/**
 * 操作审计日志
 */

import { getDb } from './db';
import { v4 as uuidv4 } from 'uuid';

export async function logAction(params: {
  companyId: string;
  userId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  result?: string;
}): Promise<void> {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO AuditLog (id, companyId, userId, action, targetType, targetId, result, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  stmt.run(
    uuidv4(),
    params.companyId,
    params.userId || null,
    params.action,
    params.targetType || null,
    params.targetId || null,
    params.result || null,
    new Date().toISOString()
  );
}

export function getAuditLogs(companyId: string, limit = 50) {
  const db = getDb();
  return db.prepare(
    'SELECT a.*, u.name as userName FROM AuditLog a LEFT JOIN User u ON a.userId = u.id WHERE a.companyId = ? ORDER BY a.createdAt DESC LIMIT ?'
  ).all(companyId, limit);
}
