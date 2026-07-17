import * as tencentcloud from 'tencentcloud-sdk-nodejs';
import type { SmsProvider, SmsSendInput } from './types';
import { SmsProviderError } from './types';

type TencentConfig = {
  secretId: string;
  secretKey: string;
  sdkAppId: string;
  signName: string;
  templateId: string;
};

export class TencentSmsProvider implements SmsProvider {
  constructor(private readonly config: TencentConfig) {}

  async send({ phone, code }: SmsSendInput): Promise<void> {
    const client = new tencentcloud.sms.v20210111.Client({
      credential: { secretId: this.config.secretId, secretKey: this.config.secretKey },
      region: 'ap-guangzhou',
      profile: { httpProfile: { endpoint: 'sms.tencentcloudapi.com' } },
    });

    try {
      const response = await client.SendSms({
        SmsSdkAppId: this.config.sdkAppId,
        SignName: this.config.signName,
        TemplateId: this.config.templateId,
        TemplateParamSet: [code, '5'],
        PhoneNumberSet: [`+86${phone}`],
      });
      const result = response.SendStatusSet?.[0];
      if (!result || result.Code !== 'Ok') {
        throw new SmsProviderError(result?.Message || '腾讯云未接受短信发送请求', result?.Code);
      }
    } catch (error: any) {
      if (error instanceof SmsProviderError) throw error;
      throw new SmsProviderError(error?.message || '腾讯云短信发送失败', error?.code);
    }
  }
}
