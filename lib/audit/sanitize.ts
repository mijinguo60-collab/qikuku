const SENSITIVE_KEY_NAMES = new Set([
  'password',
  'passwordhash',
  'token',
  'sessiontoken',
  'cookie',
  'authorization',
  'accesstoken',
  'refreshtoken',
  'secret',
  'secretid',
  'secretkey',
  'apikey',
  'openid',
  'unionid',
  'identifier',
  'databaseurl',
  'sessionsecret',
  'requestbody',
  'rawbody',
]);

const EMAIL_PATTERN = /\b([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
const PHONE_PATTERN = /(?<!\d)(1\d{2})\d{4}(\d{4})(?!\d)/g;

function normalizedKey(key: string) {
  return key.replace(/[\s_-]/g, '').toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function maskEmail(value: string) {
  return value.replace(EMAIL_PATTERN, (_match, local: string, domain: string) => {
    return `${local.slice(0, 2)}***@${domain}`;
  });
}

export function maskPhone(value: string) {
  return value.replace(PHONE_PATTERN, '$1****$2');
}

export function sanitizeAuditText(value: string) {
  return maskEmail(
    maskPhone(
      value
        .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer ***')
        .replace(/\b(?:postgres|postgresql):\/\/[^\s"']+/gi, '[DATABASE_URL_REDACTED]')
        .replace(/\b(?:sk|rk|pk)_[A-Za-z0-9_-]{16,}\b/g, '[API_KEY_REDACTED]')
        .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, '[API_KEY_REDACTED]')
        .replace(/\b(?:cookie|set-cookie)\s*([:=])\s*[^\r\n]+/gi, (_match, separator: string) => `cookie${separator}***`)
        .replace(/\b(?:authorization|api[_-]?key|secret|token)\s*[:=]\s*[^\s,;"'}\]]+/gi, (match) => {
          const separatorIndex = match.search(/[:=]/);
          return `${match.slice(0, separatorIndex + 1)}***`;
        }),
    ),
  );
}

export function sanitizeAuditValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeAuditText(value);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeAuditValue);
  }

  if (!isRecord(value)) {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const keyName = normalizedKey(key);
    if (SENSITIVE_KEY_NAMES.has(keyName)) {
      continue;
    }
    if (keyName === 'email') {
      sanitized.maskedEmail = typeof item === 'string' ? maskEmail(item) : undefined;
      continue;
    }
    if (keyName === 'phone') {
      sanitized.maskedPhone = typeof item === 'string' ? maskPhone(item) : undefined;
      continue;
    }
    sanitized[key] = sanitizeAuditValue(item);
  }
  return sanitized;
}

function parseJsonDetail(value: string): unknown {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) || Array.isArray(parsed) ? parsed : value;
  } catch {
    return value;
  }
}

export function serializeSanitizedAuditDetail(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const sanitized = sanitizeAuditValue(typeof value === 'string' ? parseJsonDetail(value) : value);
  return typeof sanitized === 'string' ? sanitized : JSON.stringify(sanitized);
}

export function passwordLoginAuditDetail(email: string, result: 'success' | 'invalid_credentials' | 'disabled' | 'unavailable' | 'session_unavailable') {
  return {
    maskedEmail: maskEmail(email),
    result,
    provider: 'password',
  };
}
