import { MockSmsProvider } from './mock';
import { TencentSmsProvider } from './tencent';
import { SmsProviderError, type SmsProvider } from './types';

const requiredTencentKeys = [
  'TENCENT_SMS_SECRET_ID',
  'TENCENT_SMS_SECRET_KEY',
  'TENCENT_SMS_SDK_APP_ID',
  'TENCENT_SMS_SIGN_NAME',
  'TENCENT_SMS_TEMPLATE_ID',
] as const;

function hasTencentConfiguration() {
  return requiredTencentKeys.every((key) => Boolean(process.env[key]));
}

export function getSmsProvider(): SmsProvider {
  const requestedProvider = process.env.SMS_PROVIDER?.trim().toLowerCase();
  if (requestedProvider === 'mock') {
    if (process.env.NODE_ENV === 'production' || (process.env.NODE_ENV !== 'test' && process.env.SMS_TEST_MODE !== 'true')) {
      throw new SmsProviderError('短信服务尚未配置', 'configuration');
    }
    return new MockSmsProvider();
  }

  if (!hasTencentConfiguration()) {
    throw new SmsProviderError('短信服务尚未配置', 'configuration');
  }

  return new TencentSmsProvider({
    secretId: process.env.TENCENT_SMS_SECRET_ID!,
    secretKey: process.env.TENCENT_SMS_SECRET_KEY!,
    sdkAppId: process.env.TENCENT_SMS_SDK_APP_ID!,
    signName: process.env.TENCENT_SMS_SIGN_NAME!,
    templateId: process.env.TENCENT_SMS_TEMPLATE_ID!,
    region: process.env.TENCENT_SMS_REGION || 'ap-guangzhou',
    endpoint: process.env.TENCENT_SMS_ENDPOINT || 'sms.tencentcloudapi.com',
  });
}

export * from './types';
