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
    requestSmsLoginCode,
    verifySmsLoginCode,
  } = await import('../lib/sms/auth-service');

  const { createServerSession } = await import('../lib/session');

  const client = new Client({
    connectionString: target.directUrl,
    ssl: { rejectUnauthorized: false },
  });

  const trackedTables = [
    'SmsVerificationChallenge',
    'User',
    'AuthIdentity',
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
      const providerRequestId = `sms-db-test-${randomUUID()}`;

      const provider = {
        async sendVerificationCode(input: {
          phoneE164: string;
          code: string;
        }) {
          sentCodes.push(input);
          return {
            providerRequestId,
            providerStatusCode: 'Ok',
          };
        },
      };

      const auditWriter = async () => undefined;
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
        1,
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

      assert.equal(verifyResult.user.companyId, null);
      assert.equal(verifyResult.user.status, 'active');

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
      assert.equal(createdUser.rows[0].companyId, null);
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
        role: verifyResult.user.role,
        companyId: verifyResult.user.companyId ?? '',
      }, db);

      assert.equal(session.activeCompanyId, null);
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
      assert.equal(sessionRow.rows[0].activeCompanyId, null);

      const during = await snapshotCounts(client, trackedTables);

      assert.equal(
        during.SmsVerificationChallenge,
        before.SmsVerificationChallenge + 1,
      );
      assert.equal(during.User, before.User + 1);
      assert.equal(during.AuthIdentity, before.AuthIdentity + 1);
      assert.equal(during.UserSession, before.UserSession + 1);
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
          sessionCreated: true,
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
