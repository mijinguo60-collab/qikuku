import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import { initializeTrialSubscriptionForCompany } from '@/lib/billing/plans';
import { createServerSession } from '@/lib/session';
import { consumeVerifiedSmsChallengeInTransaction, verifySmsChallengeInTransaction } from '@/lib/sms/auth-service';
import { SMS_PURPOSE_REGISTER, SMS_PURPOSE_RESET_PASSWORD } from '@/lib/sms/security';
import { createPasswordCredentialInTransaction, revokeUserSessionsInTransaction, setPasswordCredentialInTransaction } from './password';

type RegistrationUser = { id: string; name: string; email: string };

export class PhoneRegistrationError extends Error {
  constructor(readonly code: 'phone_already_registered' | 'invalid_code' | 'account_unavailable' | 'service_unavailable', cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
  }
}

function now() { return new Date().toISOString(); }

async function findPhoneUserOrIdentity(tx: any, phoneE164: string) {
  const user = await tx.prepare(`SELECT id FROM "User" WHERE "phoneE164"=? OR phone=? OR phone=? LIMIT 1 FOR UPDATE`)
    .get(phoneE164, phoneE164.slice(3), phoneE164);
  const identity = await tx.prepare(`SELECT "userId" FROM "AuthIdentity" WHERE provider='phone' AND ("providerUserId"=? OR "providerUserId"=?) LIMIT 1 FOR UPDATE`)
    .get(phoneE164, phoneE164.slice(3));
  return { user, identity };
}

export async function registerPhoneEnterprise(input: {
  phoneE164: string;
  code: string;
  companyName: string;
  personalName: string;
  passwordHash: string;
  rememberMe: boolean;
  db?: any;
}) {
  const db = input.db ?? getDb();
  try {
    return await db.transactionAsync(async (tx: any) => {
      const verification = await verifySmsChallengeInTransaction(tx, {
        phoneE164: input.phoneE164,
        purpose: SMS_PURPOSE_REGISTER,
        code: input.code,
      }, { consume: false });
      if (!verification.ok) throw new PhoneRegistrationError('invalid_code');

      const existing = await findPhoneUserOrIdentity(tx, input.phoneE164);
      if (existing.user || existing.identity) throw new PhoneRegistrationError('phone_already_registered');

      const timestamp = now();
      const userId = randomUUID();
      const companyId = randomUUID();
      // User.companyId is a cache with a foreign key, so it cannot reference the
      // Company until that Company row exists. Membership remains the authority.
      await tx.prepare(`INSERT INTO "User" (id,name,"phoneE164","phoneVerifiedAt",status,role,"createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?)`)
        .run(userId, input.personalName, input.phoneE164, timestamp, 'active', 'member', timestamp, timestamp);
      await tx.prepare(`INSERT INTO "AuthIdentity" (id,"userId",provider,"providerUserId","createdAt","updatedAt") VALUES (?,?, 'phone', ?,?,?)`)
        .run(randomUUID(), userId, input.phoneE164, timestamp, timestamp);
      await createPasswordCredentialInTransaction(tx, { userId, passwordHash: input.passwordHash });
      await tx.prepare(`INSERT INTO "Company" (id,name,status,plan,"createdAt") VALUES (?,?,?,?,?)`)
        .run(companyId, input.companyName, 'active', 'trial', timestamp);
      await tx.prepare(`INSERT INTO "CompanyMembership" (id,"userId","companyId",role,status,"joinedAt","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?)`)
        .run(randomUUID(), userId, companyId, 'owner', 'active', timestamp, timestamp, timestamp);
      await tx.prepare(`UPDATE "User" SET "companyId"=?,"updatedAt"=? WHERE id=?`).run(companyId, timestamp, userId);
      await initializeTrialSubscriptionForCompany({ companyId, source: 'COMPANY_ONBOARDING', userId, tx });
      if (!await consumeVerifiedSmsChallengeInTransaction(tx, { phoneE164: input.phoneE164, purpose: SMS_PURPOSE_REGISTER })) {
        throw new PhoneRegistrationError('invalid_code');
      }
      const user: RegistrationUser = { id: userId, name: input.personalName, email: '' };
      const session = await createServerSession(user, tx, { rememberMe: input.rememberMe });
      return { user, companyId, session };
    });
  } catch (error) {
    if (error instanceof PhoneRegistrationError) throw error;
    throw new PhoneRegistrationError('service_unavailable', error);
  }
}

export async function resetPhonePassword(input: {
  phoneE164: string;
  code: string;
  passwordHash: string;
  db?: any;
}) {
  const db = input.db ?? getDb();
  try {
    return await db.transactionAsync(async (tx: any) => {
      const verification = await verifySmsChallengeInTransaction(tx, {
        phoneE164: input.phoneE164,
        purpose: SMS_PURPOSE_RESET_PASSWORD,
        code: input.code,
      }, { consume: false });
      if (!verification.ok) throw new PhoneRegistrationError('invalid_code');
      const found = await findPhoneUserOrIdentity(tx, input.phoneE164);
      const userId = found.user?.id || found.identity?.userId;
      if (!userId) throw new PhoneRegistrationError('account_unavailable');
      const user = await tx.prepare(`SELECT id,status FROM "User" WHERE id=? FOR UPDATE`).get(userId) as { id: string; status: string } | null;
      if (!user || user.status !== 'active') throw new PhoneRegistrationError('account_unavailable');
      await setPasswordCredentialInTransaction(tx, { userId: user.id, passwordHash: input.passwordHash });
      await revokeUserSessionsInTransaction(tx, user.id);
      if (!await consumeVerifiedSmsChallengeInTransaction(tx, { phoneE164: input.phoneE164, purpose: SMS_PURPOSE_RESET_PASSWORD })) {
        throw new PhoneRegistrationError('invalid_code');
      }
      return { userId: user.id };
    });
  } catch (error) {
    if (error instanceof PhoneRegistrationError) throw error;
    throw new PhoneRegistrationError('service_unavailable', error);
  }
}
