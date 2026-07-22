import argon2 from 'argon2';
import { createHmac, randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit-log';
import { createServerSessionForVerifiedMembership, type CreatedServerSession } from '@/lib/session';

const PASSWORD_MIN_LENGTH = 8;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const REQUEST_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUEST_FAILURES = 20;

export type PasswordRequestMetadata = { ip: string; userAgent: string };
export type PasswordUser = { id: string; name: string; email: string; companyId: string; role: string };
export type PasswordLoginResult =
  | { ok: true; user: PasswordUser; session?: CreatedServerSession }
  | { ok: false; kind: 'invalid_credentials' | 'password_not_set' | 'account_disabled' | 'account_locked' | 'membership_invalid' | 'service_unavailable' };

type UserRow = { id: string; name: string; email: string | null; role: string; status: string; companyId: string | null };
type CredentialRow = { id: string; passwordHash: string; failedAttempts: number; lockedUntil: Date | string | null };

function now() { return new Date().toISOString(); }
function asDate(value: Date | string | null) { return value ? new Date(value) : null; }
function limitHash(scope: string, value: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET missing');
  return createHmac('sha256', secret).update(`${scope}\u0000${value}`).digest('hex');
}

export function validateLoginPassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > 128) return '密码长度需为 8 至 128 位';
  const groups = [/[a-z]/.test(password), /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
  return groups >= 2 ? null : '密码需至少包含两种字符类型';
}

export async function hashLoginPassword(password: string) {
  const validation = validateLoginPassword(password);
  if (validation) throw new Error(validation);
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function createPasswordCredentialInTransaction(tx: any, input: { userId: string; passwordHash: string }) {
  const timestamp = now();
  await tx.prepare(`INSERT INTO "PasswordCredential" (id,"userId","passwordHash","passwordUpdatedAt","failedAttempts","lockedUntil","createdAt","updatedAt") VALUES (?,?,?,?,0,NULL,?,?)`)
    .run(randomUUID(), input.userId, input.passwordHash, timestamp, timestamp, timestamp);
}

export async function setPasswordCredentialInTransaction(tx: any, input: { userId: string; passwordHash: string }) {
  const timestamp = now();
  const updated = await tx.prepare(`UPDATE "PasswordCredential" SET "passwordHash"=?,"passwordUpdatedAt"=?,"failedAttempts"=0,"lockedUntil"=NULL,"updatedAt"=? WHERE "userId"=?`)
    .run(input.passwordHash, timestamp, timestamp, input.userId);
  if (updated.changes === 0) await createPasswordCredentialInTransaction(tx, input);
}

export async function revokeUserSessionsInTransaction(tx: any, userId: string) {
  await tx.prepare(`DELETE FROM "UserSession" WHERE "userId"=?`).run(userId);
}

async function recordPasswordFailure(tx: any, input: { userId?: string; phoneHash: string; ipHash: string; deviceHash: string }) {
  await tx.prepare(`INSERT INTO "PasswordLoginAttempt" (id,"userId","phoneHash","ipHash","deviceHash","attemptedAt") VALUES (?,?,?,?,?,?)`)
    .run(randomUUID(), input.userId || null, input.phoneHash, input.ipHash, input.deviceHash, now());
}

async function auditPasswordEvent(input: { action: string; user?: PasswordUser; detail?: Record<string, unknown> }, auditWriter: typeof writeAuditLog = writeAuditLog) {
  await auditWriter({
    companyId: input.user?.companyId || '',
    userId: input.user?.id,
    action: input.action,
    detail: input.detail,
  }).catch(() => undefined);
}

/**
 * Password authentication validates the user, credential and unique active
 * membership. Login callers may create the authenticated session inside the
 * same transaction. It never creates enterprise business data or sends SMS.
 */
export async function authenticateWithPhonePassword(
  phoneE164: string,
  password: string,
  _metadata: PasswordRequestMetadata,
  db = getDb(),
  auditWriter: typeof writeAuditLog = writeAuditLog,
  options: { rememberMe?: boolean; createSession?: boolean } = {},
): Promise<PasswordLoginResult> {
  try {
    const phoneHash = limitHash('phone-password-login-phone', phoneE164);
    const ipHash = limitHash('phone-password-login-ip', _metadata.ip || 'unknown');
    const deviceHash = limitHash('phone-password-login-device', _metadata.userAgent || 'unknown');
    const result = await db.transactionAsync(async (tx: any): Promise<PasswordLoginResult> => {
      const windowStart = new Date(Date.now() - REQUEST_WINDOW_MS).toISOString();
      const requestFailures = await tx.prepare(`SELECT COUNT(*)::int AS count FROM "PasswordLoginAttempt" WHERE "attemptedAt">? AND ("ipHash"=? OR "deviceHash"=?)`).get(windowStart, ipHash, deviceHash);
      if (Number(requestFailures?.count || 0) >= MAX_REQUEST_FAILURES) return { ok: false, kind: 'account_locked' };
      const user = await tx.prepare(`SELECT id,name,email,role,status,"companyId" FROM "User" WHERE "phoneE164"=? OR phone=? OR phone=? ORDER BY CASE WHEN "phoneE164"=? THEN 0 ELSE 1 END LIMIT 1 FOR UPDATE`)
        .get(phoneE164, phoneE164.slice(3), phoneE164, phoneE164) as UserRow | null;
      if (!user) {
        await recordPasswordFailure(tx, { phoneHash, ipHash, deviceHash });
        return { ok: false, kind: 'invalid_credentials' };
      }
      if (user.status !== 'active') return { ok: false, kind: 'account_disabled' };

      const credential = await tx.prepare(`SELECT id,"passwordHash","failedAttempts","lockedUntil" FROM "PasswordCredential" WHERE "userId"=? FOR UPDATE`).get(user.id) as CredentialRow | null;
      if (!credential) return { ok: false, kind: 'password_not_set' };
      const lockedUntil = asDate(credential.lockedUntil);
      if (lockedUntil && lockedUntil.getTime() > Date.now()) return { ok: false, kind: 'account_locked' };

      let passwordMatches = false;
      try { passwordMatches = await argon2.verify(credential.passwordHash, password); } catch { return { ok: false, kind: 'invalid_credentials' }; }
      if (!passwordMatches) {
        const attempts = Number(credential.failedAttempts || 0) + 1;
        const lock = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_DURATION_MS).toISOString() : null;
        await tx.prepare(`UPDATE "PasswordCredential" SET "failedAttempts"=?,"lockedUntil"=?,"updatedAt"=? WHERE id=?`).run(attempts, lock, now(), credential.id);
        await recordPasswordFailure(tx, { userId: user.id, phoneHash, ipHash, deviceHash });
        return { ok: false, kind: 'invalid_credentials' };
      }

      const memberships = await tx.prepare(`SELECT m."companyId",m.role,c.status as "companyStatus" FROM "CompanyMembership" m JOIN "Company" c ON c.id=m."companyId" WHERE m."userId"=? AND m.status='active' ORDER BY m."createdAt" ASC,m.id ASC LIMIT 2 FOR UPDATE`).all(user.id) as Array<{ companyId: string; role: string; companyStatus: string }>;
      if (memberships.length !== 1 || memberships[0].companyStatus !== 'active') return { ok: false, kind: 'membership_invalid' };
      const membership = memberships[0];
      const timestamp = now();
      await tx.prepare(`UPDATE "PasswordCredential" SET "failedAttempts"=0,"lockedUntil"=NULL,"updatedAt"=? WHERE id=?`).run(timestamp, credential.id);
      await tx.prepare(`DELETE FROM "PasswordLoginAttempt" WHERE "phoneHash"=?`).run(phoneHash);
      await tx.prepare(`UPDATE "User" SET "companyId"=?,"lastLoginAt"=?,"updatedAt"=? WHERE id=?`).run(membership.companyId, timestamp, timestamp, user.id);
      const authenticatedUser = { id: user.id, name: user.name, email: user.email || '', role: user.role, companyId: membership.companyId };
      const session = options.createSession
        ? await createServerSessionForVerifiedMembership({ user: authenticatedUser, companyId: membership.companyId, membershipRole: membership.role, platformRole: user.role }, tx, { rememberMe: options.rememberMe })
        : undefined;
      return { ok: true, user: authenticatedUser, session };
    });
    if (result.ok) await auditPasswordEvent({ action: 'phone_password_login_succeeded', user: result.user }, auditWriter);
    else await auditPasswordEvent({ action: 'phone_password_login_failed', detail: { reason: result.kind } }, auditWriter);
    return result;
  } catch {
    return { ok: false, kind: 'service_unavailable' };
  }
}
