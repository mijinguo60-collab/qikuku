import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

const REQUIRED_ENDPOINT = 'ep-snowy-tooth-ata0virv.c-9.us-east-1.aws.neon.tech';
const FORBIDDEN_ENDPOINT = 'ep-little-dream-atph250c';
const ROLLBACK_SENTINEL = Symbol('SMS_AUTH_DB_ROLLBACK_SENTINEL');

process.env.SMS_CODE_PEPPER =
  'sms-auth-db-rollback-test-pepper-2026-at-least-32-bytes';
process.env.SESSION_SECRET =
  'sms-auth-db-rollback-test-session-secret-2026-at-least-32-bytes';
process.env.SMS_CODE_TTL_SECONDS = '300';
process.env.SMS_RESEND_COOLDOWN_SECONDS = '60';
process.env.SMS_MAX_VERIFY_ATTEMPTS = '5';
process.env.SMS_PHONE_HOURLY_LIMIT = '5';
process.env.SMS_PHONE_DAILY_LIMIT = '10';
process.env.SMS_IP_HOURLY_LIMIT = '20';

type CountMap = Record<string, number>;

class RollbackSentinelError extends Error {
  readonly sentinel = ROLLBACK_SENTINEL;

  constructor() {
    super('sms auth database test rollback');
    this.name = 'RollbackSentinelError';
  }
}

function mustGetEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertSafeEnvironment() {
  if (process.env.SMS_AUTH_DB_ROLLBACK_TEST !== '1') {
    throw new Error('SMS_AUTH_DB_ROLLBACK_TEST 必须显式设置为 1');
  }

  const directUrl = mustGetEnv('DATABASE_DIRECT_URL');
  const parsed = new URL(directUrl);
  const host = parsed.hostname;

  if (host.includes('pooler')) {
    throw new Error('必须使用 DATABASE_DIRECT_URL 的 direct 地址，禁止使用 pooler');
  }

  if (host !== REQUIRED_ENDPOINT) {
    throw new Error(`数据库 host 必须精确匹配测试 Endpoint: ${REQUIRED_ENDPOINT}`);
  }

  if (host.includes(FORBIDDEN_ENDPOINT)) {
    throw new Error(`检测到生产 Endpoint 标识，拒绝执行: ${FORBIDDEN_ENDPOINT}`);
  }

  return {
    directUrl,
    host,
    database: parsed.pathname.replace(/^\//, ''),
  };
}

function maskHost(host: string) {
  const [prefix, ...rest] = host.split('.');
  return `${prefix.slice(0, 8)}***.${rest.join('.')}`;
}

function toPgParams(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function createTransactionalDb(client: Client) {
  let savepointSequence = 0;

  const db: any = {
    prepare(sql: string) {
      return {
        async get(...params: unknown[]) {
          const result = await client.query(toPgParams(sql), params);
          return result.rows[0] ?? null;
        },

        async all(...params: unknown[]) {
          const result = await client.query(toPgParams(sql), params);
          return result.rows;
        },

        async run(...params: unknown[]) {
          const result = await client.query(toPgParams(sql), params);
          return { changes: result.rowCount ?? 0 };
        },
      };
    },

    // eslint-disable-next-line no-unused-vars
    async transactionAsync<T>(fn: (_tx: any) => Promise<T>): Promise<T> {
      const savepoint = `sms_auth_sp_${++savepointSequence}`;
      await client.query(`SAVEPOINT ${savepoint}`);

      try {
        const result = await fn(db);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await client
          .query(`RELEASE SAVEPOINT ${savepoint}`)
          .catch(() => undefined);
        throw error;
      }
    },
  };

  return db;
}

async function queryCount(client: Client, table: string) {
  const result = await client.query(
    `SELECT COUNT(*)::text AS count FROM "${table}"`,
  );
  return Number(result.rows[0]?.count ?? '0');
}

async function snapshotCounts(client: Client, tables: string[]) {
  const counts: CountMap = {};

  for (const table of tables) {
    counts[table] = await queryCount(client, table);
  }

  return counts;
}

async function main() {
  const target = assertSafeEnvironment();

  console.log(JSON.stringify({
    target: {
      host: maskHost(target.host),
      database: target.database,
      endpointMatch: target.host === REQUIRED_ENDPOINT,
    },
  }, null, 2));

  const {
    issueSmsChallenge,
    requestSmsLoginCode,
    verifyAndConsumeSmsChallenge,
    verifySmsLoginCode,
  } = await import('../lib/sms/auth-service');

  const { createServerSession, getSessionForToken } = await import('../lib/session');
  const { canAccessRoute } = await import('../lib/roles');

  const client = new Client({
    connectionString: target.directUrl,
    ssl: { rejectUnauthorized: false },
  });

  const trackedTables = [
    'SmsVerificationChallenge',
    'User',
    'AuthIdentity',
    'Company',
    'CompanyMembership',
    'Subscription',
    'CreditAccount',
    'CreditGrant',
    'CreditLedger',
    'UserSession',
    'AuditLog',
  ];

  await client.connect();

  try {
    const migration = await client.query(
      `SELECT migration_name
       FROM "_prisma_migrations"
       WHERE migration_name = $1
       LIMIT 1`,
      ['20260718143000_sms_phone_auth'],
    );

    assert.equal(
      migration.rowCount,
      1,
      '缺少短信手机号认证迁移记录',
    );

    const before = await snapshotCounts(client, trackedTables);
    console.log(JSON.stringify({ before }, null, 2));

    await client.query('BEGIN');

    try {
      const db = createTransactionalDb(client);
      const code = '654321';
      const wrongCode = '111111';
      const mainlandPhone =
        `199${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
      const phoneE164 = `+86${mainlandPhone}`;
      const metadata = {
        ip: '203.0.113.42',
        userAgent: 'qikuku-sms-auth-db-rollback-test',
      };

      const existingPhone = await client.query(
        `SELECT id FROM "User"
         WHERE "phoneE164" = $1 OR phone = $2 OR phone = $1
         LIMIT 1`,
        [phoneE164, mainlandPhone],
      );

      assert.equal(
        existingPhone.rowCount,
        0,
        '随机测试手机号不应已存在',
      );

      const sentCodes: Array<{ phoneE164: string; code: string }> = [];
      const providerRequestPrefix = `sms-db-test-${randomUUID()}`;
      let providerRequestSequence = 0;
      const providerRequestId = `${providerRequestPrefix}-1`;

      const provider = {
        async sendVerificationCode(input: {
          phoneE164: string;
          code: string;
        }) {
          sentCodes.push(input);
          return {
            providerRequestId: `${providerRequestPrefix}-${++providerRequestSequence}`,
            providerStatusCode: 'Ok',
          };
        },
      };

      const auditWriter = async () => { throw new Error('audit unavailable'); };
      const dependencies = {
        db,
        provider,
        auditWriter: auditWriter as any,
      };

      const sendResult = await requestSmsLoginCode(
        phoneE164,
        metadata,
        code,
        dependencies,
      );

      assert.deepEqual(sendResult, {
        ok: true,
        maskedPhone: `${mainlandPhone.slice(0, 3)}****${mainlandPhone.slice(-4)}`,
      });

      assert.deepEqual(sentCodes, [{ phoneE164, code }]);

      const challenge = await client.query(
        `SELECT
           id,
           "codeHash",
           attempts,
           "maxAttempts",
           "sendStatus",
           "consumedAt",
           "providerRequestId"
         FROM "SmsVerificationChallenge"
         WHERE "providerRequestId" = $1`,
        [providerRequestId],
      );

      assert.equal(challenge.rowCount, 1);
      assert.equal(challenge.rows[0].sendStatus, 'SENT');
      assert.equal(challenge.rows[0].attempts, 0);
      assert.equal(challenge.rows[0].maxAttempts, 5);
      assert.equal(challenge.rows[0].consumedAt, null);
      assert.notEqual(challenge.rows[0].codeHash, code);

      const directPhoneE164 = `+86198${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
      const directSend = await issueSmsChallenge(
        directPhoneE164,
        'SMS_AUDIT_FAILURE_TEST',
        metadata,
        '345678',
        dependencies,
      );
      assert.equal(directSend.ok, true, '审计失败不得影响短信发送');
      const directProviderRequestId = `${providerRequestPrefix}-2`;
      const directChallenge = await client.query(
        `SELECT "sendStatus", "consumedAt" FROM "SmsVerificationChallenge" WHERE "providerRequestId"=$1`,
        [directProviderRequestId],
      );
      assert.deepEqual(directChallenge.rows[0], { sendStatus: 'SENT', consumedAt: null });
      assert.deepEqual(
        await verifyAndConsumeSmsChallenge(
          directPhoneE164,
          'SMS_AUDIT_FAILURE_TEST',
          '345678',
          metadata,
          dependencies,
        ),
        { ok: true },
      );
      assert.ok((await client.query(`SELECT "consumedAt" FROM "SmsVerificationChallenge" WHERE "providerRequestId"=$1`, [directProviderRequestId])).rows[0].consumedAt);

      const providerCallsBeforeCooldown = sentCodes.length;
      const cooldownResult = await requestSmsLoginCode(
        phoneE164,
        metadata,
        '222222',
        dependencies,
      );

      assert.deepEqual(cooldownResult, {
        ok: false,
        kind: 'rate_limited',
      });

      assert.equal(
        sentCodes.length,
        providerCallsBeforeCooldown,
        '冷却期请求不得再次调用短信供应商',
      );

      const wrongResult = await verifySmsLoginCode(
        phoneE164,
        wrongCode,
        metadata,
        dependencies,
      );

      assert.deepEqual(wrongResult, {
        ok: false,
        kind: 'invalid_code',
      });

      const afterWrongAttempt = await client.query(
        `SELECT attempts, "consumedAt"
         FROM "SmsVerificationChallenge"
         WHERE "providerRequestId" = $1`,
        [providerRequestId],
      );

      assert.equal(afterWrongAttempt.rows[0].attempts, 1);
      assert.equal(afterWrongAttempt.rows[0].consumedAt, null);

      const verifyResult = await verifySmsLoginCode(
        phoneE164,
        code,
        metadata,
        dependencies,
      );

      assert.equal(verifyResult.ok, true);
      if (!verifyResult.ok) {
        throw new Error('正确验证码未完成登录');
      }

      assert.ok(verifyResult.user.companyId);
      assert.equal(verifyResult.user.status, 'active');
      const companyId = verifyResult.user.companyId;

      const consumedChallenge = await client.query(
        `SELECT attempts, "consumedAt"
         FROM "SmsVerificationChallenge"
         WHERE "providerRequestId" = $1`,
        [providerRequestId],
      );

      assert.equal(consumedChallenge.rows[0].attempts, 1);
      assert.ok(consumedChallenge.rows[0].consumedAt);

      const createdUser = await client.query(
        `SELECT
           id,
           name,
           email,
           role,
           status,
           "companyId",
           "phoneE164",
           "phoneVerifiedAt",
           "lastLoginAt"
         FROM "User"
         WHERE id = $1`,
        [verifyResult.user.id],
      );

      assert.equal(createdUser.rowCount, 1);
      assert.equal(createdUser.rows[0].phoneE164, phoneE164);
      assert.equal(createdUser.rows[0].status, 'active');
      assert.equal(createdUser.rows[0].role, 'member');
      assert.equal(createdUser.rows[0].companyId, companyId);
      assert.ok(createdUser.rows[0].phoneVerifiedAt);
      assert.ok(createdUser.rows[0].lastLoginAt);

      const identity = await client.query(
        `SELECT "userId", provider, "providerUserId"
         FROM "AuthIdentity"
         WHERE provider = 'phone'
           AND "providerUserId" = $1`,
        [phoneE164],
      );

      assert.equal(identity.rowCount, 1);
      assert.equal(identity.rows[0].userId, verifyResult.user.id);
      assert.equal(identity.rows[0].provider, 'phone');
      assert.equal(identity.rows[0].providerUserId, phoneE164);

      const company = await client.query(
        `SELECT id, plan FROM "Company" WHERE id = $1`,
        [companyId],
      );
      assert.equal(company.rowCount, 1);
      assert.equal(company.rows[0].plan, 'trial');

      const membership = await client.query(
        `SELECT "userId", "companyId", role, status
         FROM "CompanyMembership"
         WHERE "userId" = $1 AND "companyId" = $2`,
        [verifyResult.user.id, companyId],
      );
      assert.equal(membership.rowCount, 1);
      assert.equal(membership.rows[0].role, 'owner');
      assert.equal(membership.rows[0].status, 'active');

      const subscription = await client.query(
        `SELECT s.status, p.code AS "planCode"
         FROM "Subscription" s
         JOIN "Plan" p ON p.id = s."planId"
         WHERE s."companyId" = $1`,
        [companyId],
      );
      assert.equal(subscription.rowCount, 1);
      assert.equal(subscription.rows[0].status, 'trialing');
      assert.equal(subscription.rows[0].planCode, 'trial');

      const creditAccount = await client.query(
        `SELECT "totalBalance", "bonusBalance"
         FROM "CreditAccount"
         WHERE "companyId" = $1`,
        [companyId],
      );
      assert.equal(creditAccount.rowCount, 1);
      assert.equal(Number(creditAccount.rows[0].totalBalance), 3000);
      assert.equal(Number(creditAccount.rows[0].bonusBalance), 3000);

      const welcomeLedger = await client.query(
        `SELECT amount, "idempotencyKey"
         FROM "CreditLedger"
         WHERE "companyId" = $1 AND "idempotencyKey" = $2`,
        [companyId, `WELCOME:${companyId}`],
      );
      assert.equal(welcomeLedger.rowCount, 1);
      assert.equal(Number(welcomeLedger.rows[0].amount), 3000);

      const replayResult = await verifySmsLoginCode(
        phoneE164,
        code,
        metadata,
        dependencies,
      );

      assert.deepEqual(replayResult, {
        ok: false,
        kind: 'invalid_code',
      });

      const session = await createServerSession({
        id: verifyResult.user.id,
        name: verifyResult.user.name,
        email: verifyResult.user.email ?? '',
      }, db);

      assert.equal(session.activeCompanyId, companyId);
      assert.ok(session.token);
      assert.ok(session.expiresAt);

      const sessionRow = await client.query(
        `SELECT "userId", "activeCompanyId"
         FROM "UserSession"
         WHERE token = $1`,
        [session.token],
      );

      assert.equal(sessionRow.rowCount, 1);
      assert.equal(sessionRow.rows[0].userId, verifyResult.user.id);
      assert.equal(sessionRow.rows[0].activeCompanyId, companyId);
      const founderSession = await getSessionForToken(session.token, db);
      assert.equal(founderSession?.role, 'owner');
      assert.equal(founderSession?.platformRole, 'member');
      const founderClaims = JSON.parse(Buffer.from(session.token.split('.')[0], 'base64url').toString('utf8'));
      assert.equal(founderClaims.role, 'owner');
      assert.equal(founderClaims.platformRole, 'member');
      assert.equal(canAccessRoute('owner', '/api/team'), true);

      await client.query(
        `UPDATE "SmsVerificationChallenge"
         SET "createdAt" = NOW() - INTERVAL '61 seconds'
         WHERE "providerRequestId" = $1`,
        [providerRequestId],
      );

      const secondCode = '654322';
      const providerCallsBeforeSecondSend = sentCodes.length;
      const secondSendResult = await requestSmsLoginCode(
        phoneE164,
        metadata,
        secondCode,
        dependencies,
      );
      assert.equal(secondSendResult.ok, true);
      assert.equal(sentCodes.length, providerCallsBeforeSecondSend + 1);

      const secondVerifyResult = await verifySmsLoginCode(
        phoneE164,
        secondCode,
        metadata,
        dependencies,
      );
      assert.equal(secondVerifyResult.ok, true);
      if (!secondVerifyResult.ok) throw new Error('第二次验证码未完成登录');
      assert.equal(secondVerifyResult.user.id, verifyResult.user.id);
      assert.equal(secondVerifyResult.user.companyId, companyId);

      const secondSession = await createServerSession({
        id: secondVerifyResult.user.id,
        name: secondVerifyResult.user.name,
        email: secondVerifyResult.user.email ?? '',
      }, db);
      assert.equal(secondSession.activeCompanyId, companyId);

      const staffMainlandPhone = `198${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
      const staffPhoneE164 = `+86${staffMainlandPhone}`;
      const staffUserId = randomUUID();
      const staffCompanyId = randomUUID();
      const staffNow = new Date().toISOString();
      await client.query(
        `INSERT INTO "Company" (id,name,plan,"createdAt") VALUES ($1,$2,$3,$4)`,
        [staffCompanyId, '短信认证员工测试企业', 'free', staffNow],
      );
      await client.query(
        `INSERT INTO "User" (id,name,"phoneE164",status,role,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [staffUserId, '短信认证员工', staffPhoneE164, 'active', 'member', staffNow, staffNow],
      );
      await client.query(
        `INSERT INTO "CompanyMembership" (id,"userId","companyId",role,status,"joinedAt","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [randomUUID(), staffUserId, staffCompanyId, 'member', 'active', staffNow, staffNow, staffNow],
      );

      const staffSendResult = await requestSmsLoginCode(staffPhoneE164, metadata, '654323', dependencies);
      assert.equal(staffSendResult.ok, true);
      const staffVerifyResult = await verifySmsLoginCode(staffPhoneE164, '654323', metadata, dependencies);
      assert.equal(staffVerifyResult.ok, true);
      if (!staffVerifyResult.ok) throw new Error('员工验证码未完成登录');
      assert.equal(staffVerifyResult.user.id, staffUserId);
      assert.equal(staffVerifyResult.user.companyId, staffCompanyId);

      const staffAfterLogin = await client.query(
        `SELECT u."companyId",m.role,m.status,
          (SELECT COUNT(*)::int FROM "Subscription" WHERE "companyId"=$2) AS "subscriptionCount",
          (SELECT COUNT(*)::int FROM "CreditAccount" WHERE "companyId"=$2) AS "creditAccountCount",
          (SELECT COUNT(*)::int FROM "CreditLedger" WHERE "companyId"=$2) AS "creditLedgerCount"
         FROM "User" u
         JOIN "CompanyMembership" m ON m."userId"=u.id AND m."companyId"=$2
         WHERE u.id=$1`,
        [staffUserId, staffCompanyId],
      );
      assert.equal(staffAfterLogin.rowCount, 1);
      assert.equal(staffAfterLogin.rows[0].companyId, staffCompanyId);
      assert.equal(staffAfterLogin.rows[0].role, 'member');
      assert.equal(staffAfterLogin.rows[0].status, 'active');
      assert.equal(Number(staffAfterLogin.rows[0].subscriptionCount), 0);
      assert.equal(Number(staffAfterLogin.rows[0].creditAccountCount), 0);
      assert.equal(Number(staffAfterLogin.rows[0].creditLedgerCount), 0);

      const staffSession = await createServerSession({
        id: staffVerifyResult.user.id,
        name: staffVerifyResult.user.name,
        email: staffVerifyResult.user.email ?? '',
      }, db);
      assert.equal(staffSession.activeCompanyId, staffCompanyId);
      const activeStaffSession = await getSessionForToken(staffSession.token, db);
      assert.equal(activeStaffSession?.role, 'member');
      assert.equal(activeStaffSession?.platformRole, 'member');
      assert.equal(canAccessRoute('member', '/api/team'), false);
      await client.query(`UPDATE "CompanyMembership" SET status='disabled',"updatedAt"=$1 WHERE "userId"=$2 AND "companyId"=$3`, [new Date().toISOString(), staffUserId, staffCompanyId]);
      assert.equal(await getSessionForToken(staffSession.token, db), null);

      const orphanMainlandPhone = `197${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
      const orphanPhoneE164 = `+86${orphanMainlandPhone}`;
      const orphanUserId = randomUUID();
      const orphanCompanyId = randomUUID();
      const orphanNow = new Date().toISOString();
      await client.query(
        `INSERT INTO "Company" (id,name,plan,"createdAt") VALUES ($1,$2,$3,$4)`,
        [orphanCompanyId, '短信认证孤立用户企业', 'free', orphanNow],
      );
      await client.query(
        `INSERT INTO "User" (id,name,"phoneE164",status,role,"companyId","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [orphanUserId, '短信认证孤立用户', orphanPhoneE164, 'active', 'member', orphanCompanyId, orphanNow, orphanNow],
      );

      const orphanSendResult = await requestSmsLoginCode(orphanPhoneE164, metadata, '654324', dependencies);
      assert.equal(orphanSendResult.ok, true);
      const orphanVerifyResult = await verifySmsLoginCode(orphanPhoneE164, '654324', metadata, dependencies);
      assert.deepEqual(orphanVerifyResult, { ok: false, kind: 'login_rejected' });

      const orphanAfterLogin = await client.query(
        `SELECT
          (SELECT COUNT(*)::int FROM "CompanyMembership" WHERE "userId"=$1) AS "membershipCount",
          (SELECT COUNT(*)::int FROM "CreditAccount" WHERE "companyId"=$2) AS "creditAccountCount",
          (SELECT COUNT(*)::int FROM "CreditLedger" WHERE "companyId"=$2) AS "creditLedgerCount"`,
        [orphanUserId, orphanCompanyId],
      );
      assert.equal(Number(orphanAfterLogin.rows[0].membershipCount), 0);
      assert.equal(Number(orphanAfterLogin.rows[0].creditAccountCount), 0);
      assert.equal(Number(orphanAfterLogin.rows[0].creditLedgerCount), 0);
      await assert.rejects(
        () => createServerSession({ id: orphanUserId, name: '短信认证孤立用户', email: '' }, db),
        /企业归属异常/,
      );

      const multiMainlandPhone = `196${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
      const multiPhoneE164 = `+86${multiMainlandPhone}`;
      const multiUserId = randomUUID();
      const firstMultiCompanyId = randomUUID();
      const secondMultiCompanyId = randomUUID();
      const multiNow = new Date().toISOString();
      await client.query(
        `INSERT INTO "Company" (id,name,plan,"createdAt") VALUES ($1,$2,$3,$4),($5,$6,$7,$8)`,
        [firstMultiCompanyId, '短信认证多企业一', 'free', multiNow, secondMultiCompanyId, '短信认证多企业二', 'free', multiNow],
      );
      await client.query(
        `INSERT INTO "User" (id,name,"phoneE164",status,role,"companyId","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [multiUserId, '短信认证多企业用户', multiPhoneE164, 'active', 'member', firstMultiCompanyId, multiNow, multiNow],
      );
      await client.query(
        `INSERT INTO "CompanyMembership" (id,"userId","companyId",role,status,"joinedAt","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [randomUUID(), multiUserId, firstMultiCompanyId, 'member', 'active', multiNow, multiNow, multiNow],
      );
      const multiInitialSession = await createServerSession({ id: multiUserId, name: '短信认证多企业用户', email: '' }, db);
      assert.equal((await getSessionForToken(multiInitialSession.token, db))?.companyId, firstMultiCompanyId);
      await client.query(
        `INSERT INTO "CompanyMembership" (id,"userId","companyId",role,status,"joinedAt","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [randomUUID(), multiUserId, secondMultiCompanyId, 'member', 'active', multiNow, multiNow, multiNow],
      );

      const multiSendResult = await requestSmsLoginCode(multiPhoneE164, metadata, '654325', dependencies);
      assert.equal(multiSendResult.ok, true);
      const multiVerifyResult = await verifySmsLoginCode(multiPhoneE164, '654325', metadata, dependencies);
      assert.deepEqual(multiVerifyResult, { ok: false, kind: 'login_rejected' });

      const multiAfterLogin = await client.query(
        `SELECT
          (SELECT COUNT(*)::int FROM "CompanyMembership" WHERE "userId"=$1 AND status='active') AS "membershipCount",
          (SELECT COUNT(*)::int FROM "UserSession" WHERE "userId"=$1) AS "sessionCount",
          "companyId"
         FROM "User" WHERE id=$1`,
        [multiUserId],
      );
      assert.equal(Number(multiAfterLogin.rows[0].membershipCount), 2);
      assert.equal(Number(multiAfterLogin.rows[0].sessionCount), 1);
      assert.equal(multiAfterLogin.rows[0].companyId, firstMultiCompanyId);
      assert.equal(await getSessionForToken(multiInitialSession.token, db), null);
      await assert.rejects(
        () => createServerSession({ id: multiUserId, name: '短信认证多企业用户', email: '' }, db),
        /企业归属异常/,
      );

      const sameCompanyDuplicateDb = {
        prepare(sql: string) {
          return {
            async get() { return sql.includes('FROM "User"') ? { status: 'active', role: 'member' } : null; },
            async all() { return [{ companyId: 'same-company', role: 'member' }, { companyId: 'same-company', role: 'member' }]; },
            async run() { throw new Error('重复 Membership 不得创建 Session'); },
          };
        },
      };
      await assert.rejects(
        () => createServerSession({ id: 'same-company-duplicate-user', name: '重复归属用户', email: '' }, sameCompanyDuplicateDb),
        /企业归属异常/,
      );

      const during = await snapshotCounts(client, trackedTables);

      assert.equal(
        during.SmsVerificationChallenge,
        before.SmsVerificationChallenge + 6,
      );
      assert.equal(during.User, before.User + 4);
      assert.equal(during.AuthIdentity, before.AuthIdentity + 4);
      assert.equal(during.Company, before.Company + 5);
      assert.equal(during.CompanyMembership, before.CompanyMembership + 4);
      assert.equal(during.Subscription, before.Subscription + 1);
      assert.equal(during.CreditAccount, before.CreditAccount + 1);
      assert.equal(during.CreditGrant, before.CreditGrant + 1);
      assert.equal(during.CreditLedger, before.CreditLedger + 1);
      assert.equal(during.UserSession, before.UserSession + 4);
      assert.equal(
        during.AuditLog,
        before.AuditLog,
        '测试注入空审计后不得写入 AuditLog',
      );

      console.log(JSON.stringify({
        checks: {
          challengeCreated: true,
          providerCalledOnce: true,
          cooldownEnforced: true,
          failedAttemptIncremented: true,
          codeConsumedOnce: true,
          userCreated: true,
          identityBound: true,
          companyCreated: true,
          trialInitialized: true,
          welcomeCreditsGranted: true,
          sessionCreated: true,
          repeatLoginDidNotDuplicateBusinessData: true,
          existingStaffMembershipReused: true,
          orphanUserRejectedWithoutOwnerRepair: true,
          multiMembershipUserRejectedWithoutSelection: true,
          differentCompanyDuplicateInvalidatesOldSession: true,
          disabledMembershipInvalidatesOldSession: true,
          sessionRequiresExactlyOneActiveMembership: true,
          sameCompanyDuplicateMembershipRejected: true,
        },
        during,
      }, null, 2));

      throw new RollbackSentinelError();
    } catch (error) {
      await client.query('ROLLBACK');

      if (
        error instanceof RollbackSentinelError ||
        Reflect.get(error as object, 'sentinel') === ROLLBACK_SENTINEL
      ) {
        console.log('[sms-auth-db-test] expected rollback completed');
      } else {
        throw error;
      }
    }

    const after = await snapshotCounts(client, trackedTables);

    assert.deepEqual(
      after,
      before,
      '短信认证相关数据在回滚后必须恢复到测试前数量',
    );

    console.log(JSON.stringify({
      after,
      ok: true,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(String(error));
  }

  process.exitCode = 1;
});
