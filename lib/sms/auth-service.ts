import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit-log';
import { getSmsProvider } from './index';
import { getSmsSecurityConfig, hashPhone, hashRequestIp, hashUserAgent, hashVerificationCode, maskPhone, phoneLast4, SMS_PURPOSE_REGISTER, SMS_PURPOSE_RESET_PASSWORD, verificationCodeMatches } from './security';
import {
  acceptPhoneInvitationInTransaction,
  auditInvitationAccepted,
  getActiveInvitationForPhone,
  InvitationError,
  invitationAcceptPurpose,
  isInvitationUsable,
  type InvitationErrorCode,
  type InvitationRow,
} from '@/lib/invitations/company-invitations';
import { verifyBoundPhone } from '@/lib/invitations/phone-binding';
import { SmsProviderError, type SmsProvider } from './types';

type RequestMetadata = { ip: string; userAgent: string };
type ChallengeRow = { id: string; codeHash: string; expiresAt: Date | string; attempts: number; maxAttempts: number };

// Cooldown remains purpose-scoped, but phone quotas intentionally are not:
// otherwise each invitation-specific purpose could bypass phone-level limits.
export const SMS_GLOBAL_PHONE_HOURLY_LIMIT_SQL = `SELECT COUNT(*)::int AS count FROM "SmsVerificationChallenge" WHERE "phoneHash"=? AND "sendStatus"='SENT' AND "createdAt">?`;
export const SMS_GLOBAL_PHONE_DAILY_LIMIT_SQL = `SELECT COUNT(*)::int AS count FROM "SmsVerificationChallenge" WHERE "phoneHash"=? AND "sendStatus"='SENT' AND "createdAt">?`;

// One statement intentionally performs all rate-limit reads while the
// advisory lock is held. A PostgreSQL transaction is bound to one client, so
// this avoids three transatlantic request/response waits without weakening any
// quota scope.
export const SMS_RATE_LIMIT_CHECK_SQL = `
  SELECT
    EXISTS(
      SELECT 1 FROM "SmsVerificationChallenge"
      WHERE "phoneHash"=? AND purpose=? AND "sendStatus"='SENT' AND "createdAt">?
    ) AS "cooldownHit",
    EXISTS(
      SELECT 1 FROM "SmsVerificationChallenge"
      WHERE "phoneHash"=? AND purpose=? AND "sendStatus"='PENDING' AND "createdAt">?
    ) AS "sendInFlightHit",
    EXISTS(
      SELECT 1 FROM "SmsVerificationChallenge"
      WHERE "phoneHash"=? AND "sendStatus"='FAILED' AND "failureCategory" IN ('rate_limited','provider','network','unknown') AND "createdAt">?
    ) AS "providerFailureBackoffHit",
    (SELECT COUNT(*)::int FROM "SmsVerificationChallenge" WHERE "phoneHash"=? AND "sendStatus"='SENT' AND "createdAt">?) AS "phoneHourlyCount",
    (SELECT COUNT(*)::int FROM "SmsVerificationChallenge" WHERE "phoneHash"=? AND "sendStatus"='SENT' AND "createdAt">?) AS "phoneDailyCount",
    (SELECT COUNT(*)::int FROM "SmsVerificationChallenge" WHERE "requestIpHash"=? AND "sendStatus"='SENT' AND "createdAt">?) AS "ipHourlyCount"
`;

export type SmsRateLimitReason = 'resend_cooldown' | 'send_in_flight' | 'provider_failure_backoff' | 'phone_hourly_limit' | 'phone_daily_limit' | 'ip_hourly_limit' | 'provider_rate_limited';
type SmsRateLimitCheck = { cooldownHit: boolean; sendInFlightHit: boolean; providerFailureBackoffHit: boolean; phoneHourlyCount: number; phoneDailyCount: number; ipHourlyCount: number };

export type SmsSendCodeResult = { ok: true; maskedPhone: string } | { ok: false; kind: 'configuration' | 'rate_limited' | 'send_failed' };

export type SmsAuthServiceDependencies = {
  db?: any;
  provider?: SmsProvider;
  auditWriter?: typeof writeAuditLog;
};

function asDate(value: Date | string) { return value instanceof Date ? value : new Date(value); }

function safeProviderDiagnostic(value: unknown, maximumLength = 256) {
  if (typeof value !== 'string') return undefined;
  return value
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\+?86?1[3-9]\d{9}/g, '[redacted-phone]')
    .replace(/\b\d{6}\b/g, '[redacted-code]')
    .trim()
    .slice(0, maximumLength) || undefined;
}

function getRateLimitReason(check: SmsRateLimitCheck, config: NonNullable<ReturnType<typeof getSmsSecurityConfig>>) {
  if (check.cooldownHit) return 'resend_cooldown' as const;
  if (check.sendInFlightHit) return 'send_in_flight' as const;
  if (check.providerFailureBackoffHit) return 'provider_failure_backoff' as const;
  if (check.phoneHourlyCount >= config.phoneHourlyLimit) return 'phone_hourly_limit' as const;
  if (check.phoneDailyCount >= config.phoneDailyLimit) return 'phone_daily_limit' as const;
  if (check.ipHourlyCount >= config.ipHourlyLimit) return 'ip_hourly_limit' as const;
  return null;
}

function logSmsRateLimit(reason: SmsRateLimitReason, check: SmsRateLimitCheck, startedAt: number) {
  if (process.env.NODE_ENV !== 'development') return;
  // Structured diagnostics deliberately exclude phone, codes and all hashes.
  console.info('[SMS] challenge rate limited', {
    limitReason: reason,
    cooldownHit: check.cooldownHit,
    sendInFlightHit: check.sendInFlightHit,
    providerFailureBackoffHit: check.providerFailureBackoffHit,
    phoneHourlyCount: check.phoneHourlyCount,
    phoneDailyCount: check.phoneDailyCount,
    ipHourlyCount: check.ipHourlyCount,
    durationMs: Math.round(performance.now() - startedAt),
  });
}

async function lockPhone(tx: any, phoneHash: string) {
  // PostgreSQL serializes same-number requests across server instances.
  // Lock failure must abort the transaction rather than silently disabling
  // concurrency protection.
  await tx
    .prepare(`SELECT pg_advisory_xact_lock(hashtext(?))`)
    .get(`sms-challenge:${phoneHash}`);
}

async function audit(
  action: string,
  values: { phoneHash: string; phoneLast4: string; ipHash: string; userAgentHash: string; providerRequestId?: string; providerStatusCode?: string; providerStatusMessage?: string; failureCategory?: string; userId?: string; companyId?: string | null },
  dependencies: SmsAuthServiceDependencies,
) {
  const auditWriter = dependencies.auditWriter ?? writeAuditLog;
  // Auditing happens after the relevant state transition. It must never turn
  // a delivered code or consumed challenge into a client-visible failure.
  try {
    await auditWriter({
      companyId: values.companyId || '', userId: values.userId, action,
      detail: { phoneHash: values.phoneHash, phoneLast4: values.phoneLast4, ipHash: values.ipHash, userAgentHash: values.userAgentHash, providerRequestId: values.providerRequestId, providerStatusCode: values.providerStatusCode, providerStatusMessage: values.providerStatusMessage, failureCategory: values.failureCategory, provider: 'tencent_sms' },
    });
  } catch {
    // Do not log sensitive authentication data while auditing is unavailable.
  }
}

export async function issueSmsChallenge(
  phoneE164: string,
  purpose: string,
  metadata: RequestMetadata,
  code: string,
  dependencies: SmsAuthServiceDependencies = {},
): Promise<SmsSendCodeResult> {
  const config = getSmsSecurityConfig();
  if (!config) return { ok: false, kind: 'configuration' };
  const db = dependencies.db ?? getDb();
  const phoneHash = hashPhone(config.pepper, phoneE164);
  const ipHash = hashRequestIp(config.pepper, metadata.ip);
  const userAgentHash = hashUserAgent(config.pepper, metadata.userAgent || 'unknown');
  const now = new Date();
  const startedAt = performance.now();
  const challengeId = randomUUID();
  const auditValues = { phoneHash, phoneLast4: phoneLast4(phoneE164), ipHash, userAgentHash };

  try {
    const rateLimit = await db.transactionAsync(async (tx: any) => {
      await lockPhone(tx, phoneHash);
      const cooldownAt = new Date(now.getTime() - config.resendCooldownSeconds * 1000).toISOString();
      const inFlightAt = new Date(now.getTime() - config.resendCooldownSeconds * 1000).toISOString();
      const providerFailureBackoffAt = new Date(now.getTime() - config.providerFailureBackoffSeconds * 1000).toISOString();
      const hourAt = new Date(now.getTime() - 3600_000).toISOString();
      const dayAt = new Date(now.getTime() - 86_400_000).toISOString();
      const row = await tx.prepare(SMS_RATE_LIMIT_CHECK_SQL).get(
        phoneHash, purpose, cooldownAt,
        phoneHash, purpose, inFlightAt,
        phoneHash, providerFailureBackoffAt,
        phoneHash, hourAt,
        phoneHash, dayAt,
        ipHash, hourAt,
      );
      const check: SmsRateLimitCheck = {
        cooldownHit: Boolean(row?.cooldownHit),
        sendInFlightHit: Boolean(row?.sendInFlightHit),
        providerFailureBackoffHit: Boolean(row?.providerFailureBackoffHit),
        phoneHourlyCount: Number(row?.phoneHourlyCount || 0),
        phoneDailyCount: Number(row?.phoneDailyCount || 0),
        ipHourlyCount: Number(row?.ipHourlyCount || 0),
      };
      const reason = getRateLimitReason(check, config);
      if (reason) return { allowed: false as const, reason, check };
      await tx.prepare(`INSERT INTO "SmsVerificationChallenge" (id,"phoneHash","phoneLast4",purpose,"codeHash","expiresAt",attempts,"maxAttempts","sendStatus","requestIpHash","userAgentHash","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(challengeId, phoneHash, phoneLast4(phoneE164), purpose, hashVerificationCode(config.pepper, phoneE164, purpose, code), new Date(now.getTime() + config.ttlSeconds * 1000).toISOString(), 0, config.maxVerifyAttempts, 'PENDING', ipHash, userAgentHash, now.toISOString(), now.toISOString());
      return { allowed: true as const };
    });
    if (!rateLimit.allowed) {
      logSmsRateLimit(rateLimit.reason, rateLimit.check, startedAt);
      await audit('SMS_CODE_REQUESTED', { ...auditValues, failureCategory: 'rate_limited' }, dependencies);
      return { ok: false, kind: 'rate_limited' };
    }
  } catch { return { ok: false, kind: 'send_failed' }; }

  await audit('SMS_CODE_REQUESTED', auditValues, dependencies);
  try {
    const sent = await (dependencies.provider ?? getSmsProvider()).sendVerificationCode({ phoneE164, code });
    await db.transactionAsync(async (tx: any) => {
      await lockPhone(tx, phoneHash);
      const update = await tx.prepare(`UPDATE "SmsVerificationChallenge" SET "sendStatus"='SENT',"providerRequestId"=?,"providerStatusCode"=?,"updatedAt"=? WHERE id=? AND "sendStatus"='PENDING'`).run(sent.providerRequestId || null, sent.providerStatusCode || 'Ok', new Date().toISOString(), challengeId);
      if (update.changes !== 1) throw new Error('sms_challenge_state_changed');
      await tx.prepare(`UPDATE "SmsVerificationChallenge" SET "consumedAt"=?,"updatedAt"=? WHERE "phoneHash"=? AND purpose=? AND id<>? AND "sendStatus"='SENT' AND "consumedAt" IS NULL`).run(new Date().toISOString(), new Date().toISOString(), phoneHash, purpose, challengeId);
    });
    await audit('SMS_CODE_SENT', { ...auditValues, providerRequestId: sent.providerRequestId, providerStatusCode: sent.providerStatusCode, providerStatusMessage: sent.providerStatusMessage }, dependencies);
    return { ok: true, maskedPhone: maskPhone(phoneE164) };
  } catch (error) {
    const failureCategory = error instanceof SmsProviderError ? error.category : 'unknown';
    const providerError = error instanceof SmsProviderError ? error : undefined;
    const providerRequestId = safeProviderDiagnostic(providerError?.providerRequestId, 128);
    const providerStatusCode = safeProviderDiagnostic(providerError?.providerStatusCode, 128);
    const providerStatusMessage = safeProviderDiagnostic(providerError?.providerStatusMessage);
    await db.prepare(`UPDATE "SmsVerificationChallenge" SET "sendStatus"='FAILED',"failureCategory"=?,"providerRequestId"=?,"providerStatusCode"=?,"updatedAt"=? WHERE id=? AND "sendStatus"='PENDING'`).run(failureCategory, providerRequestId || null, providerStatusCode || null, new Date().toISOString(), challengeId).catch(() => {});
    await audit('SMS_CODE_SEND_FAILED', { ...auditValues, failureCategory, providerRequestId, providerStatusCode, providerStatusMessage }, dependencies);
    if (error instanceof SmsProviderError && error.category === 'configuration') return { ok: false, kind: 'configuration' };
    if (error instanceof SmsProviderError && error.category === 'rate_limited') {
      if (process.env.NODE_ENV === 'development') console.info('[SMS] Tencent provider rejected challenge', { limitReason: 'provider_rate_limited', providerStatusCode: providerStatusCode || 'UNKNOWN', providerStatusMessage: providerStatusMessage || 'UNKNOWN', providerRequestId: providerRequestId || null, durationMs: Math.round(performance.now() - startedAt) });
      return { ok: false, kind: 'rate_limited' };
    }
    return { ok: false, kind: 'send_failed' };
  }
}

export async function requestSmsRegistrationCode(
  phoneE164: string,
  metadata: RequestMetadata,
  code: string,
  dependencies: SmsAuthServiceDependencies = {},
): Promise<SmsSendCodeResult> {
  return issueSmsChallenge(phoneE164, SMS_PURPOSE_REGISTER, metadata, code, dependencies);
}

export async function requestPasswordResetCode(
  phoneE164: string,
  metadata: RequestMetadata,
  code: string,
  dependencies: SmsAuthServiceDependencies = {},
): Promise<SmsSendCodeResult> {
  return issueSmsChallenge(phoneE164, SMS_PURPOSE_RESET_PASSWORD, metadata, code, dependencies);
}

export async function verifySmsChallengeInTransaction(
  tx: any,
  input: { phoneE164: string; purpose: string; code: string },
  options: { consume?: boolean } = {},
): Promise<{ ok: true } | { ok: false; kind: 'invalid_code' | 'configuration' }> {
  const config = getSmsSecurityConfig();
  if (!config) return { ok: false, kind: 'configuration' };
  const phoneHash = hashPhone(config.pepper, input.phoneE164);
  await lockPhone(tx, phoneHash);
  const challenge = await tx.prepare(`SELECT id,"codeHash","expiresAt",attempts,"maxAttempts" FROM "SmsVerificationChallenge" WHERE "phoneHash"=? AND purpose=? AND "sendStatus"='SENT' AND "consumedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE`).get(phoneHash, input.purpose) as ChallengeRow | null;
  if (!challenge || asDate(challenge.expiresAt).getTime() <= Date.now() || Number(challenge.attempts) >= Number(challenge.maxAttempts)) return { ok: false, kind: 'invalid_code' };
  if (!verificationCodeMatches(challenge.codeHash, hashVerificationCode(config.pepper, input.phoneE164, input.purpose, input.code))) {
      const attempts = Number(challenge.attempts) + 1;
      await tx.prepare(`UPDATE "SmsVerificationChallenge" SET attempts=?,"consumedAt"=CASE WHEN ?>="maxAttempts" THEN ? ELSE "consumedAt" END,"updatedAt"=? WHERE id=? AND "consumedAt" IS NULL`).run(attempts, attempts, new Date().toISOString(), new Date().toISOString(), challenge.id);
    return { ok: false, kind: 'invalid_code' };
  }
  if (options.consume === false) return { ok: true };
  const consumed = await tx.prepare(`UPDATE "SmsVerificationChallenge" SET "consumedAt"=?,"updatedAt"=? WHERE id=? AND "consumedAt" IS NULL AND "sendStatus"='SENT'`).run(new Date().toISOString(), new Date().toISOString(), challenge.id);
  return consumed.changes === 1 ? { ok: true } : { ok: false, kind: 'invalid_code' };
}

/** Must be called after a successful non-consuming verification in the same transaction. */
export async function consumeVerifiedSmsChallengeInTransaction(tx: any, input: { phoneE164: string; purpose: string }) {
  const config = getSmsSecurityConfig();
  if (!config) return false;
  const phoneHash = hashPhone(config.pepper, input.phoneE164);
  const challenge = await tx.prepare(`SELECT id FROM "SmsVerificationChallenge" WHERE "phoneHash"=? AND purpose=? AND "sendStatus"='SENT' AND "consumedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE`).get(phoneHash, input.purpose) as { id: string } | null;
  if (!challenge) return false;
  const consumed = await tx.prepare(`UPDATE "SmsVerificationChallenge" SET "consumedAt"=?,"updatedAt"=? WHERE id=? AND "consumedAt" IS NULL`).run(new Date().toISOString(), new Date().toISOString(), challenge.id);
  return consumed.changes === 1;
}

export async function verifyAndConsumeSmsChallenge(
  phoneE164: string,
  purpose: string,
  code: string,
  metadata: RequestMetadata,
  dependencies: SmsAuthServiceDependencies = {},
): Promise<{ ok: true } | { ok: false; kind: 'invalid_code' | 'configuration' }> {
  const config = getSmsSecurityConfig();
  if (!config) return { ok: false, kind: 'configuration' };
  const db = dependencies.db ?? getDb();
  const phoneHash = hashPhone(config.pepper, phoneE164);
  const ipHash = hashRequestIp(config.pepper, metadata.ip);
  const userAgentHash = hashUserAgent(config.pepper, metadata.userAgent || 'unknown');
  const verification = await db.transactionAsync((tx: any) => verifySmsChallengeInTransaction(tx, { phoneE164, purpose, code })).catch(() => ({ ok: false as const, kind: 'invalid_code' as const }));
  const result = verification.ok;
  await audit(result ? 'SMS_VERIFY_SUCCEEDED' : 'SMS_VERIFY_FAILED', { phoneHash, phoneLast4: phoneLast4(phoneE164), ipHash, userAgentHash, failureCategory: result ? undefined : 'invalid_code' }, dependencies);
  return result ? { ok: true } : { ok: false, kind: 'invalid_code' };
}

export async function sendInvitationAcceptCode(
  inviteCode: string,
  phoneE164: string,
  metadata: RequestMetadata,
  code: string,
  dependencies: SmsAuthServiceDependencies = {},
) {
  const invitation = await getActiveInvitationForPhone(inviteCode, phoneE164, dependencies.db ?? getDb());
  if (!invitation) return { ok: false as const, kind: 'invalid_invitation' as const };
  return issueSmsChallenge(phoneE164, invitationAcceptPurpose(invitation.id), metadata, code, dependencies);
}

export async function acceptInvitationWithCode(
  inviteCode: string,
  phoneE164: string,
  code: string,
  metadata: RequestMetadata,
  dependencies: SmsAuthServiceDependencies = {},
  newUserProfile?: { personalName: string; passwordHash: string },
) {
  const config = getSmsSecurityConfig();
  if (!config) return { ok: false as const, kind: 'configuration' as const };
  const db = dependencies.db ?? getDb();
  try {
    const result = await db.transactionAsync(async (tx: any) => {
      const phoneHash = hashPhone(config.pepper, phoneE164);
      await lockPhone(tx, phoneHash);
      const invitation = await tx.prepare(`SELECT * FROM "CompanyInvitation" WHERE "inviteCode"=? FOR UPDATE`).get(inviteCode) as InvitationRow | null;
      if (!invitation || !isInvitationUsable(invitation) || !verifyBoundPhone(invitation.boundPhone, phoneE164)) {
        return { ok: false as const, kind: 'invalid_invitation' as const };
      }
      const verification = await verifySmsChallengeInTransaction(tx, { phoneE164, purpose: invitationAcceptPurpose(invitation.id), code });
      if (!verification.ok) return verification;
      const acceptance = await acceptPhoneInvitationInTransaction(tx, { invitation, phoneE164, newUserProfile });
      return { ok: true as const, acceptance };
    });
    if (result.ok) await auditInvitationAccepted(result.acceptance, dependencies.auditWriter);
    return result;
  } catch (error) {
    if (error instanceof InvitationError) return { ok: false as const, kind: error.code as InvitationErrorCode };
    return { ok: false as const, kind: 'service_unavailable' as const };
  }
}
