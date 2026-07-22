import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { getDb } from '@/lib/db';
import { assertUserCanAuthenticate } from '@/lib/auth/user-status';

export const SESSION_COOKIE = 'qikuku_user';
const REMEMBER_ME_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const SHORT_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
export type ServerSession = {
  id: string;
  name: string;
  email: string;
  /** 企业身份：仅来自唯一 active CompanyMembership。 */
  role: string;
  /** 平台身份：仅来自 User.role，不参与企业权限判断。 */
  platformRole: string;
  companyId: string;
  companyName?: string;
  activeCompanyId: string | null;
  /** 唯一 active Membership 的 ID；来自同一条 Session 校验查询。 */
  membershipId: string;
};
type SessionUserInput = Pick<ServerSession, 'id' | 'name' | 'email'>;
type SessionRow = ServerSession & { status: string };
export type CreatedServerSession = { token: string; expiresAt: string; activeCompanyId: string; maxAgeSeconds: number };
const requestSessionCache = new WeakMap<object, WeakMap<object, Promise<ServerSession | null>>>();
const serverSessionCache = new WeakMap<object, Map<string, Promise<ServerSession | null>>>();

function logSessionTiming(startedAt: number) {
  if (process.env.NODE_ENV === 'development') console.info('[PERF] Session resolution', { durationMs: Date.now() - startedAt });
}

function cookieOptions(maxAge = REMEMBER_ME_MAX_AGE_SECONDS) { return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, maxAge, path: '/' }; }

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET 未配置或长度不足，无法创建安全会话');
  return secret;
}

function sign(payload: string) { return createHmac('sha256', sessionSecret()).update(payload).digest('base64url'); }

/**
 * Internal primitive for a caller that already holds the User and unique
 * active Membership locks in the same transaction. It avoids re-reading the
 * same identity data during password login while preserving the normal public
 * createServerSession validation path for all other callers.
 */
export async function createServerSessionForVerifiedMembership(
  input: { user: SessionUserInput; companyId: string; membershipRole: string; platformRole: string },
  db = getDb(),
  options: { rememberMe?: boolean } = {},
): Promise<CreatedServerSession> {
  const payload = Buffer.from(JSON.stringify({ sid: randomBytes(24).toString('base64url'), role: input.membershipRole, platformRole: input.platformRole })).toString('base64url');
  const token = `${payload}.${sign(payload)}`;
  const maxAgeSeconds = options.rememberMe === false ? SHORT_SESSION_MAX_AGE_SECONDS : REMEMBER_ME_MAX_AGE_SECONDS;
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000).toISOString();
  await db.prepare(`INSERT INTO "UserSession" (id, token, "userId", "activeCompanyId", "expiresAt", "createdAt") VALUES (?,?,?,?,?,?)`).run(randomBytes(16).toString('hex'), token, input.user.id, input.companyId, expiresAt, new Date().toISOString());
  return { token, expiresAt, activeCompanyId: input.companyId, maxAgeSeconds };
}

export async function createServerSession(user: SessionUserInput, db = getDb(), options: { rememberMe?: boolean } = {}) {
  const [account, memberships] = await Promise.all([
    db.prepare(`SELECT status,role FROM "User" WHERE id=?`).get(user.id) as Promise<{ status?: string; role?: string } | null>,
    db
    .prepare(`SELECT m."companyId",m.role,c.status AS "companyStatus" FROM "CompanyMembership" m JOIN "Company" c ON c.id=m."companyId" WHERE m."userId"=? AND m.status='active' ORDER BY m."createdAt" ASC,m.id ASC LIMIT 2`)
    .all(user.id) as Promise<Array<{ companyId: string; role: string; companyStatus: string }>>,
  ]);
  const platformRole = account?.role || '';
  assertUserCanAuthenticate(account);
  if (memberships.length !== 1 || memberships[0].companyStatus !== 'active') throw new Error('无法创建会话：企业归属异常');
  const membership = memberships[0];
  return createServerSessionForVerifiedMembership({ user, companyId: membership.companyId, membershipRole: membership.role, platformRole }, db, options);
}

export async function getSessionForToken(token?: string | null, db = getDb()): Promise<ServerSession | null> {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const startedAt = Date.now();
  const row = await db.prepare(`SELECT u.id,u.name,u.email,m.id as "membershipId",m.role,u.role as "platformRole",u.status,s."activeCompanyId" as "companyId",c.name as "companyName",s."activeCompanyId" FROM "UserSession" s JOIN "User" u ON u.id=s."userId" JOIN "CompanyMembership" m ON m."userId"=s."userId" AND m."companyId"=s."activeCompanyId" AND m.status='active' JOIN "Company" c ON c.id=s."activeCompanyId" AND c.status='active' WHERE s.token=? AND s."expiresAt">? AND s."activeCompanyId" IS NOT NULL AND (SELECT COUNT(*) FROM "CompanyMembership" memberships WHERE memberships."userId"=s."userId" AND memberships.status='active')=1`).get(token, new Date().toISOString()) as SessionRow | null;
  logSessionTiming(startedAt);
  try {
    assertUserCanAuthenticate(row);
  } catch {
    return null;
  }
  return row;
}

async function findSession(token?: string | null): Promise<ServerSession | null> { return getSessionForToken(token); }

/**
 * API-route request scoped deduplication. The cache key is the NextRequest
 * object and database adapter, so it cannot share identity state across
 * requests or test database scopes. Database validation still runs again on
 * every new HTTP request.
 */
export async function getRequestSession(request: NextRequest, db = getDb()) {
  let byDatabase = requestSessionCache.get(request);
  if (!byDatabase) {
    byDatabase = new WeakMap<object, Promise<ServerSession | null>>();
    requestSessionCache.set(request, byDatabase);
  }
  const adapter = db as object;
  let session = byDatabase.get(adapter);
  if (!session) {
    session = getSessionForToken(request.cookies.get(SESSION_COOKIE)?.value, db);
    byDatabase.set(adapter, session);
  }
  return session;
}

/**
 * Next.js 14 / React 18 request-store memoization.
 * Duplicate layout/page reads using the same request-bound cookie store share
 * one database validation. The WeakMap retains no completed request globally.
 */
export async function getServerSession() {
  const cookieStore = cookies();
  const storeKey = cookieStore as unknown as object;
  const token = cookieStore.get(SESSION_COOKIE)?.value || '';

  let sessions = serverSessionCache.get(storeKey);
  if (!sessions) {
    sessions = new Map<string, Promise<ServerSession | null>>();
    serverSessionCache.set(storeKey, sessions);
  }

  let session = sessions.get(token);
  if (!session) {
    session = findSession(token || null);
    sessions.set(token, session);
  }

  return session;
}
export function setSessionCookie(response: NextResponse, token: string, maxAgeSeconds = REMEMBER_ME_MAX_AGE_SECONDS) { response.cookies.set(SESSION_COOKIE, token, cookieOptions(maxAgeSeconds)); }
export async function clearRequestSession(request: NextRequest) { const token = request.cookies.get(SESSION_COOKIE)?.value; if (token) await getDb().prepare(`DELETE FROM "UserSession" WHERE token = ?`).run(token); }
export function clearSessionCookie(response: NextResponse) { response.cookies.set(SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 }); }
