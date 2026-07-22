import assert from 'node:assert/strict';
import { issueSmsChallenge, SMS_RATE_LIMIT_CHECK_SQL } from '../lib/sms/auth-service';

const originalEnvironment = { ...process.env };

function restoreEnvironment() {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
}

function rateLimitedDb(row: Record<string, unknown>) {
  const statements: string[] = [];
  return {
    statements,
    transactionAsync: async (fn: any) => fn({
      prepare(sql: string) {
        statements.push(sql);
        return {
          get: async () => {
            if (sql.includes('pg_advisory_xact_lock')) return {};
            if (sql === SMS_RATE_LIMIT_CHECK_SQL) return row;
            throw new Error('unexpected rate-limit query');
          },
          run: async () => ({ changes: 1 }),
        };
      },
    }),
  };
}

async function main() {
  process.env.SMS_CODE_PEPPER = 'sms-rate-limit-test-pepper-must-be-at-least-thirty-two-bytes';
  process.env.SMS_PHONE_HOURLY_LIMIT = '5';
  process.env.SMS_PHONE_DAILY_LIMIT = '10';
  process.env.SMS_IP_HOURLY_LIMIT = '20';

  assert.match(SMS_RATE_LIMIT_CHECK_SQL, /"cooldownHit"/);
  assert.match(SMS_RATE_LIMIT_CHECK_SQL, /"phoneHourlyCount"/);
  assert.match(SMS_RATE_LIMIT_CHECK_SQL, /"phoneDailyCount"/);
  assert.match(SMS_RATE_LIMIT_CHECK_SQL, /"ipHourlyCount"/);

  const hourlyDb = rateLimitedDb({ cooldownHit: false, phoneHourlyCount: 5, phoneDailyCount: 5, ipHourlyCount: 0 });
  const hourly = await issueSmsChallenge('+8613812345678', 'REGISTER', { ip: '203.0.113.1', userAgent: 'rate-test' }, '123456', { db: hourlyDb, auditWriter: async () => undefined });
  assert.deepEqual(hourly, { ok: false, kind: 'rate_limited' });
  assert.equal(hourlyDb.statements.filter((sql) => sql === SMS_RATE_LIMIT_CHECK_SQL).length, 1, 'all quota counters must use one database statement');

  const otherPurposeDb = rateLimitedDb({ cooldownHit: false, phoneHourlyCount: 5, phoneDailyCount: 5, ipHourlyCount: 0 });
  const otherPurpose = await issueSmsChallenge('+8613812345678', 'INVITE_ACCEPT:another-invitation', { ip: '203.0.113.2', userAgent: 'rate-test' }, '123456', { db: otherPurposeDb, auditWriter: async () => undefined });
  assert.equal(otherPurpose.ok, false);
  assert.equal(otherPurpose.kind, 'rate_limited', 'phone hourly quota must span invitation-specific purposes');

  const failingDb = { transactionAsync: async () => { throw new Error('database unavailable'); } };
  const unavailable = await issueSmsChallenge('+8613812345678', 'REGISTER', { ip: '203.0.113.3', userAgent: 'rate-test' }, '123456', { db: failingDb, auditWriter: async () => undefined });
  assert.deepEqual(unavailable, { ok: false, kind: 'send_failed' }, 'database errors must not become a false 429');

  console.log('sms rate-limit query and scope tests passed');
}

main().finally(restoreEnvironment).catch((error) => {
  restoreEnvironment();
  console.error(error);
  process.exitCode = 1;
});
