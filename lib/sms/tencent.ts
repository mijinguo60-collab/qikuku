import * as tencentcloud from 'tencentcloud-sdk-nodejs';
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

export class TencentSmsProvider implements SmsProvider {
  private readonly config: TencentSmsConfig;

  constructor(config: TencentSmsConfig) {
    this.config = config;
  }

  private static safeProviderText(value: unknown, maximumLength = 256) {
    if (typeof value !== 'string') return undefined;
    return value
      .replace(/[\r\n\t]/g, ' ')
      .replace(/\+?86?1[3-9]\d{9}/g, '[redacted-phone]')
      .replace(/\b\d{6}\b/g, '[redacted-code]')
      .trim()
      .slice(0, maximumLength) || undefined;
  }

  private static failureCategory(code?: string) {
    return code?.startsWith('LimitExceeded.') || code?.includes('RequestLimitExceeded')
      ? 'rate_limited' as const
      : 'provider' as const;
  }

  async sendVerificationCode({ phoneE164, code }: SmsSendInput): Promise<SmsSendResult> {
    const client = new tencentcloud.sms.v20210111.Client({
      credential: { secretId: this.config.secretId, secretKey: this.config.secretKey },
      region: this.config.region,
      profile: { httpProfile: { endpoint: this.config.endpoint, reqTimeout: 15 } },
    });

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
          TencentSmsProvider.safeProviderText(result?.Message),
          TencentSmsProvider.safeProviderText(response.RequestId, 128),
        );
      }
      return {
        providerRequestId: TencentSmsProvider.safeProviderText(response.RequestId, 128),
        providerStatusCode: TencentSmsProvider.safeProviderText(result.Code, 128),
        providerStatusMessage: TencentSmsProvider.safeProviderText(result.Message),
      };
    } catch (error) {
      if (error instanceof SmsProviderError) throw error;
      const providerError = error as { code?: unknown; message?: unknown; requestId?: unknown; RequestId?: unknown };
      const code = TencentSmsProvider.safeProviderText(providerError.code, 128);
      throw new SmsProviderError(
        '腾讯云短信发送失败',
        code ? TencentSmsProvider.failureCategory(code) : 'network',
        code,
        TencentSmsProvider.safeProviderText(providerError.message),
        TencentSmsProvider.safeProviderText(providerError.requestId ?? providerError.RequestId, 128),
      );
    }
  }
}
