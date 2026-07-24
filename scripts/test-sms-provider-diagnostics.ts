import assert from 'node:assert/strict';
import { buildSmsFailureDiagnostic, logSmsSendFailure } from '../lib/sms/diagnostics';
import { TencentSmsProvider } from '../lib/sms/tencent';
import { SmsProviderError } from '../lib/sms/types';

const sentinels = {
  phone: '+8613812345678',
  code: '123456',
  secret: 'SENTINEL_SECRET_MUST_NOT_APPEAR',
  token: 'SENTINEL_TOKEN_MUST_NOT_APPEAR',
  request: 'SENTINEL_REQUEST_BODY_MUST_NOT_APPEAR',
};

function render(value: unknown) {
  return JSON.stringify(value);
}

function assertRedacted(value: unknown) {
  const output = render(value);
  for (const forbidden of Object.values(sentinels)) assert.equal(output.includes(forbidden), false, `diagnostic leaked ${forbidden}`);
  assert.equal(output.includes('SmsSdkAppId'), false, 'diagnostic must not include request fields');
  assert.equal(output.includes('TemplateParamSet'), false, 'diagnostic must not include request fields');
}

async function expectSmsProviderError(promise: Promise<unknown>) {
  try {
    await promise;
    assert.fail('expected SmsProviderError');
  } catch (error) {
    assert.ok(error instanceof SmsProviderError);
    return error;
  }
}

async function main() {
  const config = {
    secretId: sentinels.secret,
    secretKey: sentinels.token,
    sdkAppId: '1000000000',
    signName: 'test-sign',
    templateId: '1000000',
    region: 'ap-guangzhou',
    endpoint: 'sms.tencentcloudapi.com',
  };
  const sdkProvider = new TencentSmsProvider(config, () => ({
    SendSms: async () => {
      const error = Object.assign(new Error(`phone=${sentinels.phone} code=${sentinels.code} secretKey=${sentinels.secret} token=${sentinels.token} body=${sentinels.request} opaque ${sentinels.request}`), {
        code: 'RequestTimeout', requestId: 'request-id-sdk', httpStatusCode: 504,
      });
      throw error;
    },
  }));
  const sdkFailure = await expectSmsProviderError(sdkProvider.sendVerificationCode({ phoneE164: sentinels.phone, code: sentinels.code }));
  assert.equal(sdkFailure.failureStage, 'sdk_call');
  assert.equal(sdkFailure.providerStatusCode, 'RequestTimeout');
  assert.equal(sdkFailure.providerRequestId, 'request-id-sdk');
  assert.equal(sdkFailure.httpStatusCode, 504);
  const sdkDiagnostic = buildSmsFailureDiagnostic({
    stage: sdkFailure.failureStage!,
    failureCategory: sdkFailure.category,
    providerStatusCode: sdkFailure.providerStatusCode,
    providerStatusMessage: sdkFailure.providerStatusMessage,
    providerRequestId: sdkFailure.providerRequestId,
    httpStatusCode: sdkFailure.httpStatusCode,
    errorType: sdkFailure,
  });
  assert.equal(sdkDiagnostic.event, 'sms_send_failed');
  assert.equal(sdkDiagnostic.stage, 'sdk_call');
  assert.equal(sdkDiagnostic.providerStatusCode, 'RequestTimeout');
  assert.equal(sdkDiagnostic.providerRequestId, 'request-id-sdk');
  assert.equal(sdkDiagnostic.httpStatusCode, 504);
  assert.equal(sdkDiagnostic.retryable, true);
  assertRedacted(sdkDiagnostic);

  const businessProvider = new TencentSmsProvider(config, () => ({
    SendSms: async () => ({
      SendStatusSet: [{ Code: 'FailedOperation.SignatureIncorrectOrUnapproved', Message: `recipient ${sentinels.phone}; TemplateParamSet=${sentinels.code}` }],
      RequestId: 'request-id-business',
    }),
  }));
  const businessFailure = await expectSmsProviderError(businessProvider.sendVerificationCode({ phoneE164: sentinels.phone, code: sentinels.code }));
  assert.equal(businessFailure.failureStage, 'tencent_business_rejected');
  assert.equal(businessFailure.providerStatusCode, 'FailedOperation.SignatureIncorrectOrUnapproved');
  assert.equal(businessFailure.providerRequestId, 'request-id-business');
  const businessDiagnostic = buildSmsFailureDiagnostic({
    stage: businessFailure.failureStage!,
    failureCategory: businessFailure.category,
    providerStatusCode: businessFailure.providerStatusCode,
    providerStatusMessage: businessFailure.providerStatusMessage,
    providerRequestId: businessFailure.providerRequestId,
    errorType: businessFailure,
  });
  assert.equal(businessDiagnostic.stage, 'tencent_business_rejected');
  assert.equal(businessDiagnostic.providerStatusCode, 'FailedOperation.SignatureIncorrectOrUnapproved');
  assert.equal(businessDiagnostic.providerRequestId, 'request-id-business');
  assert.equal(businessDiagnostic.retryable, false);
  assertRedacted(businessDiagnostic);

  const successProvider = new TencentSmsProvider(config, () => ({
    SendSms: async () => ({ SendStatusSet: [{ Code: 'Ok', Message: 'accepted' }], RequestId: 'request-id-success' }),
  }));
  const success = await successProvider.sendVerificationCode({ phoneE164: sentinels.phone, code: sentinels.code });
  assert.equal(success.providerStatusCode, 'Ok', 'normal provider success must remain unchanged');

  const messages: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => { messages.push(args); };
  try {
    logSmsSendFailure({
      stage: 'internal_state_write',
      failureCategory: 'internal',
      providerStatusMessage: `password=${sentinels.secret} cookie=${sentinels.token}`,
      errorType: new Error('database state update failed'),
    });
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(messages.length, 1, 'exactly one structured failure log is emitted');
  assert.equal(messages[0][0], '[SMS]');
  assertRedacted(messages);

  console.log('sms provider diagnostics tests passed');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
