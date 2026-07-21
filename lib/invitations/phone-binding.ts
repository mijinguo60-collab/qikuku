import { getSmsSecurityConfig, hashPhone, maskPhone, phoneLast4 } from '@/lib/sms/security';

const VERSION = 'v1';

export function encodeBoundPhone(phoneE164: string): string {
  const config = getSmsSecurityConfig();
  if (!config) throw new Error('SMS 安全配置不可用');
  return `${VERSION}:${hashPhone(config.pepper, phoneE164)}:${phoneLast4(phoneE164)}`;
}

function parseBoundPhone(value: string | null | undefined) {
  const [version, phoneHash, last4, ...rest] = (value || '').split(':');
  if (version !== VERSION || !/^[a-f0-9]{64}$/.test(phoneHash || '') || !/^\d{4}$/.test(last4 || '') || rest.length) return null;
  return { phoneHash, last4 };
}

export function verifyBoundPhone(boundPhone: string | null | undefined, phoneE164: string): boolean {
  const parsed = parseBoundPhone(boundPhone);
  if (!parsed) return false;
  const config = getSmsSecurityConfig();
  return Boolean(config && parsed.phoneHash === hashPhone(config.pepper, phoneE164));
}

export function getBoundPhoneLast4(boundPhone: string | null | undefined): string | null {
  return parseBoundPhone(boundPhone)?.last4 || null;
}

export function formatBoundPhoneMask(boundPhone: string | null | undefined): string {
  const last4 = getBoundPhoneLast4(boundPhone);
  return last4 ? `手机尾号 ${last4}` : '未绑定';
}

export function formatPhoneMask(phoneE164: string): string {
  return maskPhone(phoneE164);
}
