import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { getDb } from '@/lib/db';
import { assertUserCanAuthenticate } from '@/lib/auth/user-status';

export const SESSION_COOKIE = 'qikuku_user';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
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
};
type SessionUserInput = Pick<ServerSession, 'id' | 'name' | 'email'>;
type SessionRow = ServerSession & { status: string };

function cookieOptions() { return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, maxAge: MAX_AGE_SECONDS, path: '/' }; }

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET 未配置或长度不足，无法创建安全会话');
  return secret;
}

function sign(payload: string) { return createHmac('sha256', sessionSecret()).update(payload).digest('base64url'); }

export async function createServerSession(user: SessionUserInput, db = getDb()) {
  const account = await db.prepare(`SELECT status,role FROM "User" WHERE id=?`).get(user.id) as { status?: string; role?: string } | null;
  const platformRole = account?.role || '';
  assertUserCanAuthenticate(account);
  const memberships = await db
    .prepare(`SELECT "companyId",role FROM "CompanyMembership" WHERE "userId"=? AND status='active' ORDER BY "createdAt" ASC,id ASC LIMIT 2`)
    .all(user.id) as Array<{ companyId: string; role: string }>;
  if (memberships.length !== 1) throw new Error('无法创建会话：企业归属异常');
  const membership = memberships[0];
  const activeCompanyId = membership.companyId;
  const payload = Buffer.from(JSON.stringify({ sid: randomBytes(24).toString('base64url'), role: membership.role, platformRole })).toString('base64url');
  const token = `${payload}.${sign(payload)}`;
  const expiresAt = new Date(Date.now() + MAX_AGE_SECONDS * 1000).toISOString();
  await db.prepare(`INSERT INTO "UserSession" (id, token, "userId", "activeCompanyId", "expiresAt", "createdAt") VALUES (?,?,?,?,?,?)`).run(randomBytes(16).toString('hex'), token, user.id, activeCompanyId, expiresAt, new Date().toISOString());
  return { token, expiresAt, activeCompanyId };
}

export async function getSessionForToken(token?: string | null, db = getDb()): Promise<ServerSession | null> {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const row = await db.prepare(`SELECT u.id,u.name,u.email,m.role,u.role as "platformRole",u.status,s."activeCompanyId" as "companyId",c.name as "companyName",s."activeCompanyId" FROM "UserSession" s JOIN "User" u ON u.id=s."userId" JOIN "CompanyMembership" m ON m."userId"=s."userId" AND m."companyId"=s."activeCompanyId" AND m.status='active' LEFT JOIN "Company" c ON c.id=s."activeCompanyId" WHERE s.token=? AND s."expiresAt">? AND s."activeCompanyId" IS NOT NULL AND (SELECT COUNT(*) FROM "CompanyMembership" memberships WHERE memberships."userId"=s."userId" AND memberships.status='active')=1`).get(token, new Date().toISOString()) as SessionRow | null;
  try {
    assertUserCanAuthenticate(row);
  } catch {
    return null;
  }
  return row;
}

async function findSession(token?: string | null): Promise<ServerSession | null> { return getSessionForToken(token); }

export async function getRequestSession(request: NextRequest) { return findSession(request.cookies.get(SESSION_COOKIE)?.value); }
export async function getServerSession() { return findSession(cookies().get(SESSION_COOKIE)?.value); }
export function setSessionCookie(response: NextResponse, token: string) { response.cookies.set(SESSION_COOKIE, token, cookieOptions()); }
export async function clearRequestSession(request: NextRequest) { const token = request.cookies.get(SESSION_COOKIE)?.value; if (token) await getDb().prepare(`DELETE FROM "UserSession" WHERE token = ?`).run(token); }
export function clearSessionCookie(response: NextResponse) { response.cookies.set(SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 }); }
