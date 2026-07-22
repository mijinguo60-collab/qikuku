import assert from 'node:assert/strict';
import { issueSmsChallenge, SMS_RATE_LIMIT_CHECK_SQL } from '../lib/sms/auth-service';
import { SmsProviderError } from '../lib/sms/types';

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

type StoredChallenge = {
  id: string;
  phoneHash: string;
  purpose: string;
  sendStatus: 'PENDING' | 'SENT' | 'FAILED';
  failureCategory?: string | null;
  providerRequestId?: string | null;
  providerStatusCode?: string | null;
};

function challengeStateDb() {
  const rows: StoredChallenge[] = [];
  const statementLog: string[] = [];
  const makeStatement = (sql: string) => ({
    get: async (...params: string[]) => {
      statementLog.push(sql);
      if (sql.includes('pg_advisory_xact_lock')) return {};
      if (sql === SMS_RATE_LIMIT_CHECK_SQL) {
        const [phoneHash, purpose] = params;
        return {
          cooldownHit: rows.some((row) => row.phoneHash === phoneHash && row.purpose === purpose && row.sendStatus === 'SENT'),
          sendInFlightHit: rows.some((row) => row.phoneHash === phoneHash && row.purpose === purpose && row.sendStatus === 'PENDING'),
          providerFailureBackoffHit: rows.some((row) => row.phoneHash === phoneHash && row.sendStatus === 'FAILED' && ['rate_limited', 'provider', 'network', 'unknown'].includes(row.failureCategory || '')),
          phoneHourlyCount: rows.filter((row) => row.phoneHash === phoneHash && row.sendStatus === 'SENT').length,
          phoneDailyCount: rows.filter((row) => row.phoneHash === phoneHash && row.sendStatus === 'SENT').length,
          ipHourlyCount: 0,
        };
      }
      throw new Error('unexpected query');
    },
    run: async (...params: string[]) => {
      statementLog.push(sql);
      if (sql.startsWith('INSERT INTO "SmsVerificationChallenge"')) {
        rows.push({ id: params[0], phoneHash: params[1], purpose: params[3], sendStatus: 'PENDING' });
        return { changes: 1 };
      }
      if (sql.includes(`SET "sendStatus"='SENT'`)) {
        const row = rows.find((candidate) => candidate.id === params[3] && candidate.sendStatus === 'PENDING');
        if (!row) return { changes: 0 };
        row.sendStatus = 'SENT';
        row.providerRequestId = params[0] || null;
        row.providerStatusCode = params[1] || null;
        return { changes: 1 };
      }
      if (sql.includes(`SET "sendStatus"='FAILED'`)) {
        const row = rows.find((candidate) => candidate.id === params[4] && candidate.sendStatus === 'PENDING');
        if (!row) return { changes: 0 };
        row.sendStatus = 'FAILED';
        row.failureCategory = params[0] || null;
        row.providerRequestId = params[1] || null;
        row.providerStatusCode = params[2] || null;
        return { changes: 1 };
      }
      if (sql.includes('SET "consumedAt"=')) return { changes: 1 };
      throw new Error('unexpected mutation');
    },
  });
  return {
    rows,
    statementLog,
    prepare: makeStatement,
    transactionAsync: async (fn: any) => fn({ prepare: makeStatement }),
  };
}

async function main() {
  process.env.SMS_CODE_PEPPER = 'sms-rate-limit-test-pepper-must-be-at-least-thirty-two-bytes';
  process.env.SMS_PHONE_HOURLY_LIMIT = '5';
  process.env.SMS_PHONE_DAILY_LIMIT = '10';
  process.env.SMS_IP_HOURLY_LIMIT = '20';

  assert.match(SMS_RATE_LIMIT_CHECK_SQL, /"cooldownHit"/);
  assert.match(SMS_RATE_LIMIT_CHECK_SQL, /"sendInFlightHit"/);
  assert.match(SMS_RATE_LIMIT_CHECK_SQL, /"providerFailureBackoffHit"/);
  assert.match(SMS_RATE_LIMIT_CHECK_SQL, /"sendStatus"='SENT'/);
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

  const rejectedDb = challengeStateDb();
  const audits: any[] = [];
  let rejectedProviderCalls = 0;
  const providerRejected = await issueSmsChallenge('+8613812345678', 'REGISTER', { ip: '203.0.113.4', userAgent: 'rate-test' }, '123456', {
    db: rejectedDb,
    provider: {
      sendVerificationCode: async () => {
        rejectedProviderCalls += 1;
        throw new SmsProviderError('腾讯云未接受短信发送请求', 'rate_limited', 'LimitExceeded.PhoneNumberDailyLimit', 'single-number +8613812345678 daily limit for 123456', 'request-id-safe');
      },
    },
    auditWriter: async (entry: any) => { audits.push(entry); },
  });
  assert.deepEqual(providerRejected, { ok: false, kind: 'rate_limited' });
  assert.equal(rejectedProviderCalls, 1);
  assert.deepEqual(rejectedDb.rows.map((row) => row.sendStatus), ['FAILED'], 'provider rejection must never leave a verifiable SENT challenge');
  assert.equal(rejectedDb.rows[0].providerStatusCode, 'LimitExceeded.PhoneNumberDailyLimit');
  assert.equal(rejectedDb.rows[0].providerRequestId, 'request-id-safe');
  assert.deepEqual(audits.at(-1)?.detail, {
    phoneHash: audits.at(-1)?.detail.phoneHash,
    phoneLast4: '5678',
    ipHash: audits.at(-1)?.detail.ipHash,
    userAgentHash: audits.at(-1)?.detail.userAgentHash,
    providerRequestId: 'request-id-safe',
    providerStatusCode: 'LimitExceeded.PhoneNumberDailyLimit',
    providerStatusMessage: 'single-number [redacted-phone] daily limit for [redacted-code]',
    failureCategory: 'rate_limited',
    provider: 'tencent_sms',
  });
  const failureBackoff = await issueSmsChallenge('+8613812345678', 'RESET_PASSWORD', { ip: '203.0.113.4', userAgent: 'rate-test' }, '654321', {
    db: rejectedDb,
    provider: { sendVerificationCode: async () => { rejectedProviderCalls += 1; return { providerStatusCode: 'Ok' }; } },
    auditWriter: async () => undefined,
  });
  assert.deepEqual(failureBackoff, { ok: false, kind: 'rate_limited' }, 'provider failure backoff must be separate from sent-code cooldown');
  assert.equal(rejectedProviderCalls, 1, 'failure backoff must not call the provider again');

  const successDb = challengeStateDb();
  let successfulProviderCalls = 0;
  const successfulProvider = { sendVerificationCode: async () => { successfulProviderCalls += 1; return { providerRequestId: 'accepted-request', providerStatusCode: 'Ok' }; } };
  const sent = await issueSmsChallenge('+8613912345678', 'REGISTER', { ip: '203.0.113.5', userAgent: 'rate-test' }, '123456', { db: successDb, provider: successfulProvider, auditWriter: async () => undefined });
  assert.equal(sent.ok, true);
  assert.deepEqual(successDb.rows.map((row) => row.sendStatus), ['SENT'], 'only provider acceptance creates a verifiable challenge');
  const duplicate = await issueSmsChallenge('+8613912345678', 'REGISTER', { ip: '203.0.113.5', userAgent: 'rate-test' }, '654321', { db: successDb, provider: successfulProvider, auditWriter: async () => undefined });
  assert.deepEqual(duplicate, { ok: false, kind: 'rate_limited' }, 'sent-code resend cooldown must still reject repeat clicks');
  assert.equal(successfulProviderCalls, 1, 'repeat click must not invoke the provider during sent-code cooldown');

  console.log('sms rate-limit query and scope tests passed');
}

main().finally(restoreEnvironment).catch((error) => {
  restoreEnvironment();
  console.error(error);
  process.exitCode = 1;
});
