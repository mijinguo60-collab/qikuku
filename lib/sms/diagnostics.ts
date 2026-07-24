import type { SmsFailureStage, SmsProviderFailureCategory } from './types';

export type SmsFailureDiagnostic = {
  stage: SmsFailureStage;
  failureCategory: SmsProviderFailureCategory | 'internal' | 'unknown';
  providerStatusCode?: unknown;
  providerStatusMessage?: unknown;
  providerRequestId?: unknown;
  httpStatusCode?: unknown;
  errorType?: unknown;
};

const SENSITIVE_FIELD_VALUE = /\b(?:secret[ _-]?(?:id|key)?|token|authorization|password|cookie|session|sms[ _-]?sdk[ _-]?app[ _-]?id|sign[ _-]?name|template[ _-]?id|template[ _-]?param[ _-]?set|phone[ _-]?number(?:[ _-]?set)?|request|response|body|payload)\b\s*["']?\s*[:=]\s*["']?[^\s,;)}\]]+/gi;
const URL_VALUE = /\b(?:postgres(?:ql)?|https?):\/\/[^\s'"`<>]+/gi;
const MAINLAND_PHONE = /(?:\+?86[-\s]?)?1[3-9]\d{9}/g;
const VERIFICATION_CODE = /\b\d{6}\b/g;
const OPAQUE_MESSAGE_VALUE = /\b[A-Za-z0-9_-]{24,}\b/g;

/**
 * Provider errors are untrusted input. Keep only a bounded, one-line,
 * redacted diagnostic rather than logging an SDK request or response object.
 */
export function redactSmsProviderDiagnostic(value: unknown, maximumLength = 256) {
  if (typeof value !== 'string') return undefined;
  return value
    .replace(/[\r\n\t]/g, ' ')
    .replace(URL_VALUE, '[redacted-url]')
    .replace(SENSITIVE_FIELD_VALUE, '[redacted-sensitive-field]')
    .replace(MAINLAND_PHONE, '[redacted-phone]')
    .replace(VERIFICATION_CODE, '[redacted-code]')
    .trim()
    .slice(0, maximumLength) || undefined;
}

export function redactSmsProviderMessage(value: unknown, maximumLength = 256) {
  const redacted = redactSmsProviderDiagnostic(value, maximumLength);
  return redacted?.replace(OPAQUE_MESSAGE_VALUE, '[redacted-opaque]');
}

function safeErrorType(value: unknown) {
  if (value instanceof Error && /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(value.name)) return value.name;
  if (typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(value)) return value;
  return 'UnknownError';
}

function safeHttpStatusCode(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number.NaN;
  return Number.isInteger(numeric) && numeric >= 100 && numeric <= 599 ? numeric : undefined;
}

function retryable(stage: SmsFailureStage, category: SmsProviderFailureCategory | 'internal' | 'unknown', providerStatusCode: unknown) {
  if (stage !== 'sdk_call') return false;
  if (category === 'network') return true;
  return typeof providerStatusCode === 'string' && /(?:timeout|network|connect|temporar)/i.test(providerStatusCode);
}

export function buildSmsFailureDiagnostic(input: SmsFailureDiagnostic) {
  return {
    event: 'sms_send_failed',
    stage: input.stage,
    failureCategory: input.failureCategory,
    providerStatusCode: redactSmsProviderDiagnostic(input.providerStatusCode, 128),
    providerStatusMessage: redactSmsProviderMessage(input.providerStatusMessage),
    providerRequestId: redactSmsProviderDiagnostic(input.providerRequestId, 128),
    httpStatusCode: safeHttpStatusCode(input.httpStatusCode),
    errorType: safeErrorType(input.errorType),
    retryable: retryable(input.stage, input.failureCategory, input.providerStatusCode),
  };
}

export function logSmsSendFailure(input: SmsFailureDiagnostic) {
  // Deliberately log only this fixed schema. Never pass an Error, SDK client,
  // request, response, phone number, verification code, or environment object.
  console.error('[SMS]', buildSmsFailureDiagnostic(input));
}
