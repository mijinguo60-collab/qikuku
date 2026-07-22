import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

const REQUIRED_ENDPOINT = 'ep-snowy-tooth-ata0virv.c-9.us-east-1.aws.neon.tech';
const FORBIDDEN_ENDPOINT = 'ep-little-dream-atph250c';

process.env.SMS_CODE_PEPPER = 'sms-auth-db-rollback-test-pepper-2026-at-least-32-bytes';
process.env.SESSION_SECRET = 'sms-auth-db-rollback-test-session-secret-2026-at-least-32-bytes';
process.env.SMS_CODE_TTL_SECONDS = '300';
process.env.SMS_RESEND_COOLDOWN_SECONDS = '60';
process.env.SMS_MAX_VERIFY_ATTEMPTS = '5';
process.env.SMS_PHONE_HOURLY_LIMIT = '5';
process.env.SMS_PHONE_DAILY_LIMIT = '10';
process.env.SMS_IP_HOURLY_LIMIT = '20';

type Counts = Record<string, number>;

function safeTarget() {
  if (process.env.SMS_AUTH_DB_ROLLBACK_TEST !== '1') throw new Error('SMS_AUTH_DB_ROLLBACK_TEST 必须显式设置为 1');
  const directUrl = process.env.DATABASE_DIRECT_URL;
  if (!directUrl) throw new Error('DATABASE_DIRECT_URL is required');
  const parsed = new URL(directUrl);
  if (parsed.hostname !== REQUIRED_ENDPOINT || parsed.hostname.includes(FORBIDDEN_ENDPOINT) || parsed.hostname.includes('pooler')) throw new Error('仅允许使用指定 Neon 测试分支 direct endpoint');
  return { directUrl, endpointMatch: parsed.hostname === REQUIRED_ENDPOINT };
}

function toPg(sql: string) { let index = 0; return sql.replace(/\?/g, () => `$${++index}`); }

function testDb(client: Client) {
  let sequence = 0;
  const db: any = {
    prepare(sql: string) {
      return {
        async get(...params: unknown[]) { return (await client.query(toPg(sql), params)).rows[0] ?? null; },
        async all(...params: unknown[]) { return (await client.query(toPg(sql), params)).rows; },
        async run(...params: unknown[]) { return { changes: (await client.query(toPg(sql), params)).rowCount ?? 0 }; },
      };
    },
    // eslint-disable-next-line no-unused-vars
    async transactionAsync<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      const savepoint = `phone_auth_${++sequence}`;
      await client.query(`SAVEPOINT ${savepoint}`);
      try { const result = await fn(db); await client.query(`RELEASE SAVEPOINT ${savepoint}`); return result; }
      catch (error) { await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`); await client.query(`RELEASE SAVEPOINT ${savepoint}`); throw error; }
    },
  };
  return db;
}

const tables = ['SmsVerificationChallenge', 'User', 'AuthIdentity', 'PasswordCredential', 'PasswordLoginAttempt', 'Company', 'CompanyMembership', 'Subscription', 'CreditAccount', 'CreditGrant', 'CreditLedger', 'UserSession', 'AuditLog'];
async function counts(client: Client): Promise<Counts> {
  const result: Counts = {};
  for (const table of tables) result[table] = Number((await client.query(`SELECT COUNT(*)::text AS count FROM "${table}"`)).rows[0].count);
  return result;
}

async function main() {
  const target = safeTarget();
  const progress = (step: string) => console.log(`[phone-password-auth-db] ${step}`);
  const client = new Client({ connectionString: target.directUrl, ssl: { rejectUnauthorized: false } });
  let before: Counts = {};
  let during: Counts = {};
  let after: Counts = {};
  let began = false;
  try {
    await client.connect(); progress('connected');
    const migration = await client.query(`SELECT migration_name FROM "_prisma_migrations" WHERE migration_name='20260722090000_password_credential'`);
    assert.equal(migration.rowCount, 1, '测试库必须先应用 PasswordCredential migration');
    before = await counts(client); progress('before-counts');
    await client.query('BEGIN'); began = true;
    await client.query(`SET LOCAL statement_timeout = '20s'`);
    progress('transaction-begin');
    const db = testDb(client);
    const { requestSmsRegistrationCode, requestPasswordResetCode } = await import('../lib/sms/auth-service');
    const { registerPhoneEnterprise, resetPhonePassword, PhoneRegistrationError } = await import('../lib/auth/phone-registration');
    const { authenticateWithPhonePassword, hashLoginPassword } = await import('../lib/auth/password');
    const { getSessionForToken } = await import('../lib/session');
    const number = `199${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
    const phoneE164 = `+86${number}`;
    const metadata = { ip: '203.0.113.42', userAgent: 'phone-password-auth-db-test' };
    const sent: string[] = [];
    const provider = { async sendVerificationCode(input: { phoneE164: string; code: string }) { sent.push(input.code); return { providerRequestId: `test-${sent.length}`, providerStatusCode: 'Ok' }; } };
    const dependencies = { db, provider, auditWriter: async () => { throw new Error('audit unavailable'); } };

    const registerCode = '654321';
    progress('register-code-request');
    assert.equal((await requestSmsRegistrationCode(phoneE164, metadata, registerCode, dependencies)).ok, true);
    progress('registration-start');
    const registration = await registerPhoneEnterprise({ phoneE164, code: registerCode, companyName: '认证测试企业', personalName: '认证测试用户', passwordHash: await hashLoginPassword('SafePassw0rd!'), rememberMe: true, db });
    progress('registration-complete');
    assert.ok(registration.companyId);
    assert.equal(sent.length, 1, '注册只发送一次短信');
    assert.equal((await client.query(`SELECT COUNT(*)::int AS count FROM "PasswordCredential" WHERE "userId"=$1`, [registration.user.id])).rows[0].count, 1);
    const noAudit = async () => undefined;
    progress('password-login-start');
    assert.deepEqual(await authenticateWithPhonePassword(phoneE164, 'wrong-password', metadata, db, noAudit as any), { ok: false, kind: 'invalid_credentials' });
    const passwordLogin = await authenticateWithPhonePassword(phoneE164, 'SafePassw0rd!', metadata, db, noAudit as any);
    assert.equal(passwordLogin.ok, true);
    assert.equal((await client.query(`SELECT COUNT(*)::int AS count FROM "SmsVerificationChallenge" WHERE purpose='REGISTER'`,)).rows[0].count, 1, '日常密码登录不得新增短信');
    assert.equal((await getSessionForToken(registration.session.token, db))?.role, 'owner');
    progress('password-login-complete');

    await client.query(`UPDATE "SmsVerificationChallenge" SET "createdAt"=NOW()-INTERVAL '61 seconds' WHERE purpose='REGISTER'`);
    assert.equal((await requestSmsRegistrationCode(phoneE164, metadata, '654322', dependencies)).ok, true);
    await assert.rejects(
      () => registerPhoneEnterprise({ phoneE164, code: '654322', companyName: '重复企业', personalName: '重复用户', passwordHash: 'not-used', rememberMe: true, db }),
      (error: unknown) => error instanceof PhoneRegistrationError && error.code === 'phone_already_registered',
    );
    assert.equal((await client.query(`SELECT "consumedAt" FROM "SmsVerificationChallenge" WHERE purpose='REGISTER' ORDER BY "createdAt" DESC LIMIT 1`)).rows[0].consumedAt, null, '重复注册失败不能消耗短信验证码');

    progress('reset-code-request');
    assert.equal((await requestPasswordResetCode(phoneE164, metadata, '654323', dependencies)).ok, true);
    progress('reset-start');
    await resetPhonePassword({ phoneE164, code: '654323', passwordHash: await hashLoginPassword('NewSafePassw0rd!'), db });
    assert.equal(await getSessionForToken(registration.session.token, db), null, '重置密码必须撤销旧会话');
    assert.equal((await authenticateWithPhonePassword(phoneE164, 'NewSafePassw0rd!', metadata, db, noAudit as any)).ok, true);
    assert.equal((await client.query(`SELECT COUNT(*)::int AS count FROM "Company" WHERE id=$1`, [registration.companyId])).rows[0].count, 1);
    assert.equal((await client.query(`SELECT COUNT(*)::int AS count FROM "CreditLedger" WHERE "companyId"=$1 AND "idempotencyKey"=$2`, [registration.companyId, `WELCOME:${registration.companyId}`])).rows[0].count, 1);
    progress('reset-complete');

    during = await counts(client); progress('during-counts');
    assert.equal(during.User, before.User + 1);
    assert.equal(during.Company, before.Company + 1);
    assert.equal(during.CompanyMembership, before.CompanyMembership + 1);
    assert.equal(during.PasswordCredential, before.PasswordCredential + 1);
    assert.equal(during.Subscription, before.Subscription + 1);
    assert.equal(during.CreditAccount, before.CreditAccount + 1);
    assert.equal(during.CreditGrant, before.CreditGrant + 1);
    assert.equal(during.CreditLedger, before.CreditLedger + 1);
    console.log(JSON.stringify({ checks: { registerCreatesFounderAndPassword: true, dailyPasswordLoginUsesNoSms: true, duplicateRegistrationDoesNotCreateBusinessData: true, resetRevokesOldSessions: true }, before, during, endpointMatch: target.endpointMatch }, null, 2));
  } finally {
    if (began) { progress('rollback-start'); await client.query('ROLLBACK'); progress('rollback-complete'); }
    after = await counts(client).catch(() => ({})); progress('after-counts');
    await client.end(); progress('client-end-complete');
  }
  assert.deepEqual(after, before, 'rollback 后表计数必须恢复');
  console.log(JSON.stringify({ before, during, after, endpointMatch: target.endpointMatch, ok: true }, null, 2));
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
