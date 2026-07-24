import * as tencentcloud from 'tencentcloud-sdk-nodejs';
import { redactSmsProviderDiagnostic, redactSmsProviderMessage } from './diagnostics';
import { SmsProviderError, type SmsProvider, type SmsSendInput, type SmsSendResult } from './types';

export type TencentSmsConfig = {
  secretId: string;
  secretKey: string;
  sdkAppId: string;
  signName: string;
  templateId: string;
  region: string;
  endpoint: string;
};

export type TencentSmsClient = {
  // The SDK request type is intentionally left opaque here so tests can use a
  // local fake client without constructing or logging a real SDK request.
  SendSms(input: any): Promise<any>;
};

export class TencentSmsProvider implements SmsProvider {
  private readonly config: TencentSmsConfig;
  private readonly createClient: () => TencentSmsClient;

  constructor(config: TencentSmsConfig, createClient?: () => TencentSmsClient) {
    this.config = config;
    this.createClient = createClient ?? (() => new tencentcloud.sms.v20210111.Client({
      credential: { secretId: this.config.secretId, secretKey: this.config.secretKey },
      region: this.config.region,
      profile: { httpProfile: { endpoint: this.config.endpoint, reqTimeout: 15 } },
    }));
  }

  private static safeProviderText(value: unknown, maximumLength = 256) {
    return redactSmsProviderDiagnostic(value, maximumLength);
  }

  private static safeProviderMessage(value: unknown, maximumLength = 256) {
    return redactSmsProviderMessage(value, maximumLength);
  }

  private static safeHttpStatusCode(value: unknown) {
    const numeric = typeof value === 'number' ? value : Number.NaN;
    return Number.isInteger(numeric) && numeric >= 100 && numeric <= 599 ? numeric : undefined;
  }

  private static failureCategory(code?: string) {
    return code?.startsWith('LimitExceeded.') || code?.includes('RequestLimitExceeded')
      ? 'rate_limited' as const
      : 'provider' as const;
  }

  async sendVerificationCode({ phoneE164, code }: SmsSendInput): Promise<SmsSendResult> {
    const client = this.createClient();

    try {
      const response = await client.SendSms({
        SmsSdkAppId: this.config.sdkAppId,
        SignName: this.config.signName,
        TemplateId: this.config.templateId,
        TemplateParamSet: [code],
        PhoneNumberSet: [phoneE164],
      });
      const result = response.SendStatusSet?.[0];
      if (!result || result.Code !== 'Ok') {
        const code = TencentSmsProvider.safeProviderText(result?.Code, 128);
        throw new SmsProviderError(
          '腾讯云未接受短信发送请求',
          TencentSmsProvider.failureCategory(code),
          code,
          TencentSmsProvider.safeProviderMessage(result?.Message),
          TencentSmsProvider.safeProviderText(response.RequestId, 128),
          { failureStage: 'tencent_business_rejected' },
        );
      }
      return {
        providerRequestId: TencentSmsProvider.safeProviderText(response.RequestId, 128),
        providerStatusCode: TencentSmsProvider.safeProviderText(result.Code, 128),
        providerStatusMessage: TencentSmsProvider.safeProviderMessage(result.Message),
      };
    } catch (error) {
      if (error instanceof SmsProviderError) throw error;
      const providerError = error as { code?: unknown; message?: unknown; requestId?: unknown; RequestId?: unknown; httpStatusCode?: unknown; statusCode?: unknown };
      const code = TencentSmsProvider.safeProviderText(providerError.code, 128);
      throw new SmsProviderError(
        '腾讯云短信发送失败',
        code ? TencentSmsProvider.failureCategory(code) : 'network',
        code,
        TencentSmsProvider.safeProviderMessage(providerError.message),
        TencentSmsProvider.safeProviderText(providerError.requestId ?? providerError.RequestId, 128),
        {
          failureStage: 'sdk_call',
          httpStatusCode: TencentSmsProvider.safeHttpStatusCode(providerError.httpStatusCode ?? providerError.statusCode),
        },
      );
    }
  }
}
