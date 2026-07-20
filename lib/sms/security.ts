import { createHmac, randomInt, timingSafeEqual } from 'crypto';

export const SMS_PURPOSE_LOGIN = 'LOGIN';
const MAINLAND_PHONE = /^1[3-9]\d{9}$/;

export type SmsSecurityConfig = {
  pepper: string;
  ttlSeconds: number;
  resendCooldownSeconds: number;
  maxVerifyAttempts: number;
  phoneHourlyLimit: number;
  phoneDailyLimit: number;
  ipHourlyLimit: number;
};

function integerEnv(name: string, fallback: number, minimum: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

export function getSmsSecurityConfig(): SmsSecurityConfig | null {
  const pepper = process.env.SMS_CODE_PEPPER;
  if (!pepper || Buffer.byteLength(pepper, 'utf8') < 32) return null;
  return {
    pepper,
    ttlSeconds: integerEnv('SMS_CODE_TTL_SECONDS', 300, 60),
    resendCooldownSeconds: integerEnv('SMS_RESEND_COOLDOWN_SECONDS', 60, 30),
    maxVerifyAttempts: integerEnv('SMS_MAX_VERIFY_ATTEMPTS', 5, 1),
    phoneHourlyLimit: integerEnv('SMS_PHONE_HOURLY_LIMIT', 5, 1),
    phoneDailyLimit: integerEnv('SMS_PHONE_DAILY_LIMIT', 10, 1),
    ipHourlyLimit: integerEnv('SMS_IP_HOURLY_LIMIT', 20, 1),
  };
}

export function normalizeMainlandPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const phone = value.trim();
  return MAINLAND_PHONE.test(phone) ? `+86${phone}` : null;
}

export function phoneLast4(phoneE164: string): string {
  return phoneE164.slice(-4);
}

export function maskPhone(phoneE164: string): string {
  return `${phoneE164.slice(-11, -8)}****${phoneE164.slice(-4)}`;
}

export function generateVerificationCode(): string {
  return String(randomInt(100000, 1000000));
}

export function hmacValue(pepper: string, domain: string, value: string): string {
  return createHmac('sha256', pepper).update(`${domain}\u0000${value}`, 'utf8').digest('hex');
}

export function hashPhone(pepper: string, phoneE164: string): string {
  return hmacValue(pepper, 'sms-phone-v1', phoneE164);
}

export function hashRequestIp(pepper: string, ip: string): string {
  return hmacValue(pepper, 'sms-ip-v1', ip);
}

export function hashUserAgent(pepper: string, userAgent: string): string {
  return hmacValue(pepper, 'sms-user-agent-v1', userAgent);
}

export function hashVerificationCode(pepper: string, phoneE164: string, purpose: string, code: string): string {
  return hmacValue(pepper, 'sms-code-v1', `${phoneE164}\u0000${purpose}\u0000${code}`);
}

export function verificationCodeMatches(expectedHash: string, candidateHash: string): boolean {
  const expected = Buffer.from(expectedHash, 'hex');
  const candidate = Buffer.from(candidateHash, 'hex');
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}
