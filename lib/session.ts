import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { getDb } from '@/lib/db';

export const SESSION_COOKIE = 'qikuku_user';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export type ServerSession = { id: string; name: string; email: string; role: string; companyId: string; companyName?: string };

function cookieOptions() { return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, maxAge: MAX_AGE_SECONDS, path: '/' }; }

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET 未配置或长度不足，无法创建安全会话');
  return secret;
}

function sign(payload: string) { return createHmac('sha256', sessionSecret()).update(payload).digest('base64url'); }

export async function createServerSession(user: ServerSession) {
  const payload = Buffer.from(JSON.stringify({ sid: randomBytes(24).toString('base64url'), role: user.role })).toString('base64url');
  const token = `${payload}.${sign(payload)}`;
  const expiresAt = new Date(Date.now() + MAX_AGE_SECONDS * 1000).toISOString();
  await getDb().prepare(`INSERT INTO "UserSession" (id, token, "userId", "expiresAt", "createdAt") VALUES (?,?,?,?,?)`).run(randomBytes(16).toString('hex'), token, user.id, expiresAt, new Date().toISOString());
  return { token, expiresAt };
}

async function findSession(token?: string | null): Promise<ServerSession | null> {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const row = await getDb().prepare(`SELECT u.id, u.name, u.email, u.role, u."companyId", c.name as "companyName" FROM "UserSession" s JOIN "User" u ON u.id = s."userId" JOIN "Company" c ON c.id = u."companyId" WHERE s.token = ? AND s."expiresAt" > ?`).get(token, new Date().toISOString());
  return row || null;
}

export async function getRequestSession(request: NextRequest) { return findSession(request.cookies.get(SESSION_COOKIE)?.value); }
export async function getServerSession() { return findSession(cookies().get(SESSION_COOKIE)?.value); }
export function setSessionCookie(response: NextResponse, token: string) { response.cookies.set(SESSION_COOKIE, token, cookieOptions()); }
export async function clearRequestSession(request: NextRequest) { const token = request.cookies.get(SESSION_COOKIE)?.value; if (token) await getDb().prepare(`DELETE FROM "UserSession" WHERE token = ?`).run(token); }
export function clearSessionCookie(response: NextResponse) { response.cookies.set(SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 }); }
