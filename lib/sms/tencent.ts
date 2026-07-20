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
        const category = result?.Code?.toLowerCase().includes('limit') ? 'rate_limited' : 'provider';
        throw new SmsProviderError('腾讯云未接受短信发送请求', category, result?.Code);
      }
      return { providerRequestId: response.RequestId, providerStatusCode: result.Code };
    } catch (error) {
      if (error instanceof SmsProviderError) throw error;
      throw new SmsProviderError('腾讯云短信发送失败', 'network');
    }
  }
}
