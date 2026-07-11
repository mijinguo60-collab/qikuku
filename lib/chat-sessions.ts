import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';

export type ChatMode = 'knowledge' | 'skill';

export interface SessionOwner {
  id: string;
  companyId: string;
}

export interface ChatSessionRecord {
  id: string;
  companyId: string;
  userId: string;
  mode: ChatMode;
  skillId: string | null;
  title: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  messageCount?: number | string;
}

export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources: string | null;
  metadata: string | null;
  createdAt: string | Date;
}

export function isChatMode(value: unknown): value is ChatMode {
  return value === 'knowledge' || value === 'skill';
}

export async function createChatSession(owner: SessionOwner, mode: ChatMode, skillId?: string | null): Promise<ChatSessionRecord> {
  const db = getDb();
  const now = new Date().toISOString();
  const session: ChatSessionRecord = {
    id: uuidv4(), companyId: owner.companyId, userId: owner.id, mode,
    skillId: skillId || null, title: null, createdAt: now, updatedAt: now,
  };
  await db.prepare(
    `INSERT INTO "ChatSession" (id, "companyId", "userId", mode, "skillId", title, "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(session.id, session.companyId, session.userId, session.mode, session.skillId, session.title, session.createdAt, session.updatedAt);
  return session;
}

export async function getOwnedChatSession(owner: SessionOwner, sessionId: string, mode?: ChatMode): Promise<ChatSessionRecord | null> {
  const db = getDb();
  const modeClause = mode ? ' AND mode = ?' : '';
  const params = mode ? [sessionId, owner.companyId, owner.id, mode] : [sessionId, owner.companyId, owner.id];
  return await db.prepare(
    `SELECT * FROM "ChatSession" WHERE id = ? AND "companyId" = ? AND "userId" = ?${modeClause}`
  ).get(...params) as ChatSessionRecord | null;
}

export async function ensureChatSession(owner: SessionOwner, sessionId: string | undefined, mode: ChatMode, skillId?: string | null) {
  if (sessionId) {
    const session = await getOwnedChatSession(owner, sessionId, mode);
    if (!session) throw new Error('对话不存在或无权限访问');
    return session;
  }
  return createChatSession(owner, mode, skillId);
}

export async function appendChatMessage(
  session: ChatSessionRecord,
  role: ChatMessageRecord['role'],
  content: string,
  options?: { sources?: unknown; metadata?: unknown }
) {
  const db = getDb();
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO "ChatMessage" (id, "sessionId", role, content, sources, metadata, "createdAt")
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    uuidv4(), session.id, role, content,
    options?.sources ? JSON.stringify(options.sources) : null,
    options?.metadata ? JSON.stringify(options.metadata) : null,
    now
  );

  const title = role === 'user' ? content.trim().replace(/\s+/g, ' ').slice(0, 20) : null;
  await db.prepare(
    `UPDATE "ChatSession"
     SET title = COALESCE(NULLIF(title, ''), ?), "updatedAt" = ?
     WHERE id = ?`
  ).run(title, now, session.id);
}

export async function listOwnedChatSessions(owner: SessionOwner, mode: ChatMode): Promise<ChatSessionRecord[]> {
  const db = getDb();
  return await db.prepare(
    `SELECT s.*, (SELECT COUNT(*) FROM "ChatMessage" m WHERE m."sessionId" = s.id) AS "messageCount"
     FROM "ChatSession" s
     WHERE s."companyId" = ? AND s."userId" = ? AND s.mode = ?
     ORDER BY s."updatedAt" DESC`
  ).all(owner.companyId, owner.id, mode) as ChatSessionRecord[];
}

export async function getOwnedChatSessionWithMessages(owner: SessionOwner, sessionId: string) {
  const session = await getOwnedChatSession(owner, sessionId);
  if (!session) return null;
  const db = getDb();
  const messages = await db.prepare(
    `SELECT * FROM "ChatMessage" WHERE "sessionId" = ? ORDER BY "createdAt" ASC`
  ).all(session.id) as ChatMessageRecord[];
  return { session, messages };
}

export async function renameOwnedChatSession(owner: SessionOwner, sessionId: string, title: string) {
  const session = await getOwnedChatSession(owner, sessionId);
  if (!session) return null;
  const cleanTitle = title.trim().slice(0, 100);
  await getDb().prepare(`UPDATE "ChatSession" SET title = ?, "updatedAt" = ? WHERE id = ?`)
    .run(cleanTitle || null, new Date().toISOString(), session.id);
  return { ...session, title: cleanTitle || null };
}

export async function deleteOwnedChatSession(owner: SessionOwner, sessionId: string) {
  const session = await getOwnedChatSession(owner, sessionId);
  if (!session) return false;
  await getDb().prepare(`DELETE FROM "ChatSession" WHERE id = ? AND "companyId" = ? AND "userId" = ?`)
    .run(session.id, owner.companyId, owner.id);
  return true;
}
