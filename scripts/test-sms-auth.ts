import assert from 'node:assert/strict';
import {
  generateVerificationCode,
  getSmsSecurityConfig,
  hashPhone,
  hashVerificationCode,
  normalizeMainlandPhone,
  SMS_PURPOSE_LOGIN,
  verificationCodeMatches,
} from '../lib/sms/security';
import { MockSmsProvider } from '../lib/sms/mock';
import { getSmsProvider } from '../lib/sms';

const originalEnvironment = { ...process.env };

function restoreEnvironment() {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
}

async function main() {
  const pepper = 'test-only-sms-pepper-must-be-at-least-thirty-two-bytes';
  process.env.SMS_CODE_PEPPER = pepper;

  assert.equal(normalizeMainlandPhone('13812345678'), '+8613812345678');
  for (const invalid of ['', '12812345678', '1381234567', '+8613812345678', '138123456789']) assert.equal(normalizeMainlandPhone(invalid), null);

  for (let index = 0; index < 200; index += 1) assert.match(generateVerificationCode(), /^[1-9]\d{5}$/);
  const code = '123456';
  const phoneHash = hashPhone(pepper, '+8613812345678');
  const codeHash = hashVerificationCode(pepper, '+8613812345678', SMS_PURPOSE_LOGIN, code);
  assert.notEqual(codeHash, code);
  assert.equal(codeHash.includes(code), false);
  assert.equal(verificationCodeMatches(codeHash, hashVerificationCode(pepper, '+8613812345678', SMS_PURPOSE_LOGIN, code)), true);
  assert.equal(verificationCodeMatches(codeHash, hashVerificationCode(pepper, '+8613812345678', SMS_PURPOSE_LOGIN, '654321')), false);
  assert.match(phoneHash, /^[a-f0-9]{64}$/);

  const config = getSmsSecurityConfig();
  assert.equal(config?.ttlSeconds, 300);
  assert.equal(config?.resendCooldownSeconds, 60);
  assert.equal(config?.maxVerifyAttempts, 5);
  assert.equal(config?.phoneHourlyLimit, 5);
  assert.equal(config?.phoneDailyLimit, 10);
  assert.equal(config?.ipHourlyLimit, 20);

  (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
  process.env.SMS_PROVIDER = 'mock';
  const provider = getSmsProvider();
  assert.ok(provider instanceof MockSmsProvider);
  const sent = await provider.sendVerificationCode({ phoneE164: '+8613812345678', code });
  assert.equal(sent.providerStatusCode, 'Ok');

  (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
  assert.throws(() => getSmsProvider(), /短信服务尚未配置/);
  delete process.env.TENCENT_SMS_SECRET_ID;
  delete process.env.TENCENT_SMS_SECRET_KEY;
  delete process.env.TENCENT_SMS_SDK_APP_ID;
  delete process.env.TENCENT_SMS_SIGN_NAME;
  delete process.env.SMS_PROVIDER;
  assert.throws(() => getSmsProvider(), /短信服务尚未配置/);

  console.log('sms auth security and provider tests passed');
}

main().finally(restoreEnvironment).catch((error) => {
  restoreEnvironment();
  console.error(error);
  process.exitCode = 1;
});
