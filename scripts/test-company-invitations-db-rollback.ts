import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });
process.env.SMS_CODE_PEPPER = 'company-invitations-db-rollback-pepper-at-least-32-bytes';
process.env.SESSION_SECRET = 'company-invitations-db-rollback-session-secret-at-least-32-bytes';
process.env.SMS_CODE_TTL_SECONDS = '300';
process.env.SMS_RESEND_COOLDOWN_SECONDS = '1';
process.env.SMS_MAX_VERIFY_ATTEMPTS = '5';
process.env.SMS_PHONE_HOURLY_LIMIT = '2';
process.env.SMS_PHONE_DAILY_LIMIT = '30';
process.env.SMS_IP_HOURLY_LIMIT = '50';

const REQUIRED_ENDPOINT = 'ep-snowy-tooth-ata0virv.c-9.us-east-1.aws.neon.tech';
const FORBIDDEN_ENDPOINT = 'ep-little-dream-atph250c';
const ROLLBACK = '__COMPANY_INVITATIONS_ROLLBACK__';

function toPgParams(sql: string) { let index = 0; return sql.replace(/\?/g, () => `$${++index}`); }
function txDb(client: Client) {
  let sequence = 0;
  const db: any = {
    prepare(sql: string) {
      return {
        get: async (...values: unknown[]) => (await client.query(toPgParams(sql), values)).rows[0] || null,
        all: async (...values: unknown[]) => (await client.query(toPgParams(sql), values)).rows,
        run: async (...values: unknown[]) => ({ changes: (await client.query(toPgParams(sql), values)).rowCount || 0 }),
      };
    },
    transactionAsync: async (fn: Function) => {
      const savepoint = `invite_test_${++sequence}`;
      await client.query(`SAVEPOINT ${savepoint}`);
      try {
        const value = await fn(db);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        return value;
      } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        throw error;
      }
    },
  };
  return db;
}
async function counts(client: Client) {
  const tables = ['SmsVerificationChallenge', 'User', 'AuthIdentity', 'Company', 'CompanyMembership', 'Subscription', 'CreditAccount', 'CreditGrant', 'CreditLedger', 'UserSession', 'CompanyInvitation', 'AuditLog'];
  const result: Record<string, number> = {};
  for (const table of tables) result[table] = Number((await client.query(`SELECT COUNT(*)::int AS count FROM "${table}"`)).rows[0].count);
  return result;
}

async function main() {
  if (process.env.COMPANY_INVITATIONS_DB_ROLLBACK_TEST !== '1') throw new Error('COMPANY_INVITATIONS_DB_ROLLBACK_TEST 必须为 1');
  const direct = process.env.DATABASE_DIRECT_URL;
  if (!direct) throw new Error('DATABASE_DIRECT_URL 缺失');
  const host = new URL(direct).hostname;
  if (host !== REQUIRED_ENDPOINT || host.includes(FORBIDDEN_ENDPOINT)) throw new Error('拒绝非测试数据库');

  const { createPhoneInvitation, revokeCompanyInvitation, invitationAcceptPurpose } = await import('../lib/invitations/company-invitations');
  const { acceptInvitationWithCode, issueSmsChallenge, sendInvitationAcceptCode } = await import('../lib/sms/auth-service');
  const { hashLoginPassword } = await import('../lib/auth/password');
  const { encodeBoundPhone } = await import('../lib/invitations/phone-binding');
  const { createServerSession, getSessionForToken } = await import('../lib/session');
  const client = new Client({ connectionString: direct, ssl: { rejectUnauthorized: false } });
  const checks: Record<string, boolean> = {};
  let before: Record<string, number> = {};
  let during: Record<string, number> = {};
  let after: Record<string, number> = {};
  await client.connect();
  try {
    const progress = (stage: string) => console.log(`[company-invitations-db] ${stage}`);
    before = await counts(client);
    await client.query('BEGIN');
    try {
      const db = txDb(client);
      const now = new Date().toISOString();
      const plan = await client.query(`SELECT id FROM "Plan" WHERE code='trial' LIMIT 1`);
      assert.equal(plan.rowCount, 1, '测试库缺少 trial Plan');
      const companyId = randomUUID();
      const ownerId = randomUUID();
      await client.query(`INSERT INTO "Company" (id,name,plan,"createdAt") VALUES ($1,$2,'trial',$3)`, [companyId, '邀请 rollback 企业', now]);
      await client.query(`INSERT INTO "User" (id,name,status,role,"companyId","createdAt","updatedAt") VALUES ($1,$2,'active','member',$3,$4,$4)`, [ownerId, '邀请测试创始人', companyId, now]);
      await client.query(`INSERT INTO "CompanyMembership" (id,"userId","companyId",role,status,"joinedAt","createdAt","updatedAt") VALUES ($1,$2,$3,'owner','active',$4,$4,$4)`, [randomUUID(), ownerId, companyId, now]);
      await client.query(`INSERT INTO "Subscription" (id,"companyId","planId","billingCycle",status,"startedAt","expiresAt","autoRenew","createdAt","updatedAt") VALUES ($1,$2,$3,'trial','trialing',$4,$5,false,$4,$4)`, [randomUUID(), companyId, plan.rows[0].id, now, new Date(Date.now() + 7 * 86400000).toISOString()]);

      const noAudit = async () => undefined;
      const failingAudit = async () => { throw new Error('audit unavailable'); };
      let providerCalls = 0;
      const provider = { sendVerificationCode: async () => ({ providerRequestId: `invite-${++providerCalls}`, providerStatusCode: 'Ok' }) };
      const metadata = { ip: '203.0.113.8', userAgent: 'invite-test' };
      const invite = (phoneE164: string, auditWriter: any = noAudit) => createPhoneInvitation({ companyId, inviterId: ownerId, phoneE164, db, auditWriter });
      const send = (inviteCode: string, phoneE164: string, code = '654321', auditWriter: any = noAudit) => sendInvitationAcceptCode(inviteCode, phoneE164, metadata, code, { db, provider: provider as any, auditWriter });
      const inviteeProfile = { personalName: '邀请测试员工', passwordHash: await hashLoginPassword('InvitePassw0rd!') };
      const accept = (inviteCode: string, phoneE164: string, code = '654321', auditWriter: any = noAudit) => acceptInvitationWithCode(inviteCode, phoneE164, code, metadata, { db, auditWriter }, inviteeProfile);

      const auditCreate = await invite('+8613812345678', failingAudit as any);
      progress('create/revoke/audit');
      checks.auditFailureDoesNotBlockCreate = Boolean(auditCreate.invitationId);
      const second = await invite('+8613812345678');
      const firstRow = await client.query(`SELECT status,"boundPhone" FROM "CompanyInvitation" WHERE id=$1`, [auditCreate.invitationId]);
      assert.equal(firstRow.rows[0].status, 'revoked');
      assert.equal(firstRow.rows[0].boundPhone.includes('13812345678'), false);
      checks.boundPhoneIsHashedAndReplacementRevokes = true;
      assert.equal((await send(second.inviteCode, '+8613912345678')).ok, false);
      assert.equal(providerCalls, 0);
      checks.wrongPhoneNeverCallsProvider = true;
      const auditSmsInvite = await invite('+8613812345677');
      assert.equal((await send(auditSmsInvite.inviteCode, '+8613812345677', '654322', failingAudit as any)).ok, true);
      checks.auditFailureDoesNotBlockInvitationSms = true;

      const conflictCode = 'ABCDEFGHJKM2';
      await client.query(`INSERT INTO "CompanyInvitation" (id,"companyId","inviterId","inviteType","inviteCode",role,"maxUses","usedCount","boundPhone","expiresAt",status,"createdAt","updatedAt") VALUES ($1,$2,$3,'phone',$4,'member',1,0,$5,$6,'revoked',$7,$7)`, [randomUUID(), companyId, ownerId, conflictCode, encodeBoundPhone('+8613512345678'), new Date(Date.now() + 86400000).toISOString(), now]);
      let generated = 0;
      const collisionRetried = await createPhoneInvitation({ companyId, inviterId: ownerId, phoneE164: '+8613512345678', db, auditWriter: noAudit as any, codeGenerator: () => (++generated === 1 ? conflictCode : 'BCDEFGHJKM23') });
      assert.equal(collisionRetried.inviteCode, 'BCDEFGHJKM23');
      checks.inviteCodeConflictRetriesAtomically = true;

      const capacityPhone = '+8613412345678';
      progress('invite-code-conflict');
      const capacityInvite = await invite(capacityPhone);
      assert.equal((await send(capacityInvite.inviteCode, capacityPhone)).ok, true);
      const limit = capacityInvite.memberLimit;
      const fillerMembershipIds: string[] = [];
      for (let index = 0; index < limit - 1; index += 1) {
        const userId = randomUUID();
        const membershipId = randomUUID();
        fillerMembershipIds.push(membershipId);
        await client.query(`INSERT INTO "User" (id,name,status,role,"companyId","createdAt","updatedAt") VALUES ($1,$2,'active','member',$3,$4,$4)`, [userId, `补位成员${index}`, companyId, now]);
        await client.query(`INSERT INTO "CompanyMembership" (id,"userId","companyId",role,status,"createdAt","updatedAt") VALUES ($1,$2,$3,'member','active',$4,$4)`, [membershipId, userId, companyId, now]);
      }
      const full = await accept(capacityInvite.inviteCode, capacityPhone);
      assert.equal(full.ok, false); if (!full.ok) assert.equal(full.kind, 'member_limit_reached');
      const capacityChallenge = await client.query(`SELECT "consumedAt" FROM "SmsVerificationChallenge" WHERE purpose=$1`, [invitationAcceptPurpose(capacityInvite.invitationId)]);
      const capacityInvitation = await client.query(`SELECT status,"usedCount" FROM "CompanyInvitation" WHERE id=$1`, [capacityInvite.invitationId]);
      assert.equal(capacityChallenge.rows[0].consumedAt, null);
      assert.deepEqual(capacityInvitation.rows[0], { status: 'active', usedCount: 0 });
      assert.equal((await client.query(`SELECT COUNT(*)::int AS count FROM "User" WHERE "phoneE164"=$1`, [capacityPhone])).rows[0].count, 0);
      checks.fullCompanyRollsBackChallengeAndInvitation = true;
      await client.query(`DELETE FROM "CompanyMembership" WHERE id=$1`, [fillerMembershipIds.pop()]);
      const acceptedAfterSeat = await accept(capacityInvite.inviteCode, capacityPhone);
      assert.equal(acceptedAfterSeat.ok, true);
      if (!acceptedAfterSeat.ok) throw new Error('成员名额释放后应接受成功');
      checks.sameCodeRetriesAfterSeatAvailable = true;
      const member = await client.query(`SELECT u.role,m.role AS "membershipRole",m.status,u."companyId" FROM "User" u JOIN "CompanyMembership" m ON m."userId"=u.id WHERE u.id=$1`, [acceptedAfterSeat.acceptance.user.id]);
      assert.deepEqual(member.rows[0], { role: 'member', membershipRole: 'member', status: 'active', companyId });
      const session = await createServerSession(acceptedAfterSeat.acceptance.user, db);
      assert.equal((await getSessionForToken(session.token, db))?.role, 'member');
      checks.newMemberHasNoFounderPrivileges = true;
      progress('capacity-rollback-and-retry');

      await client.query(`DELETE FROM "CompanyMembership" WHERE id=$1`, [fillerMembershipIds.pop()]);
      const beforeIdempotent = Number((await client.query(`SELECT COUNT(*)::int AS count FROM "CompanyMembership" WHERE "companyId"=$1 AND status='active'`, [companyId])).rows[0].count);
      const idempotentInvite = await invite(capacityPhone);
      assert.equal((await send(idempotentInvite.inviteCode, capacityPhone)).ok, true);
      const idempotent = await accept(idempotentInvite.inviteCode, capacityPhone);
      assert.equal(idempotent.ok, true);
      assert.equal(Number((await client.query(`SELECT COUNT(*)::int AS count FROM "CompanyMembership" WHERE "companyId"=$1 AND status='active'`, [companyId])).rows[0].count), beforeIdempotent);
      checks.sameCompanyActiveMemberIsIdempotent = true;
      progress('idempotent-member');

      const disabledPhone = '+8613712345678';
      const disabledUserId = randomUUID();
      await client.query(`INSERT INTO "User" (id,name,"phoneE164",status,role,"companyId","createdAt","updatedAt") VALUES ($1,$2,$3,'active','member',$4,$5,$5)`, [disabledUserId, '待恢复成员', disabledPhone, companyId, now]);
      await client.query(`INSERT INTO "AuthIdentity" (id,"userId",provider,"providerUserId","createdAt","updatedAt") VALUES ($1,$2,'phone',$3,$4,$4)`, [randomUUID(), disabledUserId, disabledPhone, now]);
      await client.query(`INSERT INTO "CompanyMembership" (id,"userId","companyId",role,status,"createdAt","updatedAt") VALUES ($1,$2,$3,'member','disabled',$4,$4)`, [randomUUID(), disabledUserId, companyId, now]);
      const disabledInvite = await invite(disabledPhone);
      assert.equal((await send(disabledInvite.inviteCode, disabledPhone)).ok, true);
      assert.equal((await accept(disabledInvite.inviteCode, disabledPhone)).ok, true);
      assert.deepEqual((await client.query(`SELECT status,role FROM "CompanyMembership" WHERE "userId"=$1`, [disabledUserId])).rows[0], { status: 'active', role: 'member' });
      checks.disabledMembershipRestores = true;
      progress('disabled-membership');

      await client.query(`DELETE FROM "CompanyMembership" WHERE id=$1`, [fillerMembershipIds.pop()]);
      const otherCompanyId = randomUUID();
      const otherUserId = randomUUID();
      const otherPhone = '+8613612345678';
      await client.query(`INSERT INTO "Company" (id,name,plan,"createdAt") VALUES ($1,$2,'free',$3)`, [otherCompanyId, '其他企业', now]);
      await client.query(`INSERT INTO "User" (id,name,"phoneE164",status,role,"companyId","createdAt","updatedAt") VALUES ($1,$2,$3,'active','member',$4,$5,$5)`, [otherUserId, '其他企业成员', otherPhone, otherCompanyId, now]);
      await client.query(`INSERT INTO "CompanyMembership" (id,"userId","companyId",role,status,"createdAt","updatedAt") VALUES ($1,$2,$3,'member','active',$4,$4)`, [randomUUID(), otherUserId, otherCompanyId, now]);
      const otherInvite = await invite(otherPhone);
      assert.equal((await send(otherInvite.inviteCode, otherPhone)).ok, true);
      const otherResult = await accept(otherInvite.inviteCode, otherPhone);
      assert.equal(otherResult.ok, false); if (!otherResult.ok) assert.equal(otherResult.kind, 'phone_belongs_to_other_company');
      assert.equal((await client.query(`SELECT "consumedAt" FROM "SmsVerificationChallenge" WHERE purpose=$1`, [invitationAcceptPurpose(otherInvite.invitationId)])).rows[0].consumedAt, null);
      checks.otherCompanyRollsBackChallengeAndInvitation = true;
      progress('other-company-rejection');

      const conflictPhone = '+8613312345678';
      const conflictUserId = randomUUID();
      await client.query(`INSERT INTO "User" (id,name,"phoneE164",status,role,"companyId","createdAt","updatedAt") VALUES ($1,$2,$3,'active','member',$4,$5,$5)`, [conflictUserId, '异常成员', conflictPhone, companyId, now]);
      await client.query(`INSERT INTO "CompanyMembership" (id,"userId","companyId",role,status,"createdAt","updatedAt") VALUES ($1,$2,$3,'member','disabled',$4,$4)`, [randomUUID(), conflictUserId, companyId, now]);
      await client.query(`INSERT INTO "CompanyMembership" (id,"userId","companyId",role,status,"createdAt","updatedAt") VALUES ($1,$2,$3,'member','disabled',$4,$4)`, [randomUUID(), conflictUserId, otherCompanyId, now]);
      const conflictInvite = await invite(conflictPhone);
      assert.equal((await send(conflictInvite.inviteCode, conflictPhone)).ok, true);
      const conflictResult = await accept(conflictInvite.inviteCode, conflictPhone);
      assert.equal(conflictResult.ok, false); if (!conflictResult.ok) assert.equal(conflictResult.kind, 'membership_conflict');
      assert.equal((await client.query(`SELECT "consumedAt" FROM "SmsVerificationChallenge" WHERE purpose=$1`, [invitationAcceptPurpose(conflictInvite.invitationId)])).rows[0].consumedAt, null);
      checks.multipleMembershipRollsBackChallengeAndInvitation = true;
      progress('membership-conflict');

      const expired = await invite('+8613212345678');
      await client.query(`UPDATE "CompanyInvitation" SET "expiresAt"=$1 WHERE id=$2`, [new Date(Date.now() - 1000).toISOString(), expired.invitationId]);
      const revoked = await invite('+8613112345678', failingAudit as any);
      assert.equal((await revokeCompanyInvitation({ companyId, invitationId: revoked.invitationId, revokedBy: ownerId, db, auditWriter: failingAudit as any })).ok, true);
      assert.equal((await accept(expired.inviteCode, '+8613212345678')).ok, false);
      assert.equal((await accept(revoked.inviteCode, '+8613112345678')).ok, false);
      checks.expiredAndRevokedInvitationsReject = true;
      checks.auditFailureDoesNotBlockRevoke = true;
      progress('expired-revoked-and-audit');

      await client.query(`DELETE FROM "CompanyMembership" WHERE id=$1`, [fillerMembershipIds.pop()]);
      const auditAcceptPhone = '+8613012345678';
      const auditAcceptInvite = await invite(auditAcceptPhone);
      assert.equal((await send(auditAcceptInvite.inviteCode, auditAcceptPhone)).ok, true);
      assert.equal((await accept(auditAcceptInvite.inviteCode, auditAcceptPhone, '654321', failingAudit as any)).ok, true);
      checks.auditFailureDoesNotBlockAccept = true;
      progress('audit-accept');

      const ratePhone = '+8613911122233';
      const rateProvider = { sendVerificationCode: async () => ({ providerRequestId: `rate-${randomUUID()}`, providerStatusCode: 'Ok' }) };
      assert.equal((await issueSmsChallenge(ratePhone, invitationAcceptPurpose('rate-a'), metadata, '123456', { db, provider: rateProvider as any, auditWriter: noAudit as any })).ok, true);
      assert.equal((await issueSmsChallenge(ratePhone, invitationAcceptPurpose('rate-b'), metadata, '123456', { db, provider: rateProvider as any, auditWriter: noAudit as any })).ok, true);
      const rateLimited = await issueSmsChallenge(ratePhone, invitationAcceptPurpose('rate-c'), metadata, '123456', { db, provider: rateProvider as any, auditWriter: noAudit as any });
      assert.deepEqual(rateLimited, { ok: false, kind: 'rate_limited' });
      checks.globalPhoneQuotaSpansInvitationPurposes = true;
      progress('global-rate-limit');

      during = await counts(client);
      assert.equal(during.Company, before.Company + 2);
      assert.equal(during.Subscription, before.Subscription + 1);
      assert.equal(during.CreditAccount, before.CreditAccount);
      assert.equal(during.CreditGrant, before.CreditGrant);
      assert.equal(during.CreditLedger, before.CreditLedger);
      checks.noCompanySubscriptionOrWelcomeCreditsCreatedForInvitees = true;
      throw new Error(ROLLBACK);
    } catch (error) {
      await client.query('ROLLBACK');
      if (!(error instanceof Error && error.message === ROLLBACK)) throw error;
    }
    after = await counts(client);
    assert.deepEqual(after, before);
    console.log(JSON.stringify({ endpointMatch: host === REQUIRED_ENDPOINT, checks, before, during, after, ok: true }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.stack || error.message : String(error)); process.exitCode = 1; });
