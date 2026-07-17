import { TencentSmsProvider } from './tencent';
import type { SmsProvider } from './types';

const requiredTencentKeys = [
  'TENCENT_SMS_SECRET_ID',
  'TENCENT_SMS_SECRET_KEY',
  'TENCENT_SMS_SDK_APP_ID',
  'TENCENT_SMS_SIGN_NAME',
  'TENCENT_SMS_TEMPLATE_ID',
] as const;

export function getSmsProvider(): SmsProvider {
  if (process.env.SMS_ENABLED !== 'true') {
    throw new Error('手机号验证码服务暂未开通');
  }
  if (process.env.SMS_PROVIDER !== 'tencent') {
    throw new Error('未配置受支持的短信服务商');
  }
  if (requiredTencentKeys.some((key) => !process.env[key])) {
    throw new Error('腾讯云短信服务配置不完整');
  }
  return new TencentSmsProvider({
    secretId: process.env.TENCENT_SMS_SECRET_ID!,
    secretKey: process.env.TENCENT_SMS_SECRET_KEY!,
    sdkAppId: process.env.TENCENT_SMS_SDK_APP_ID!,
    signName: process.env.TENCENT_SMS_SIGN_NAME!,
    templateId: process.env.TENCENT_SMS_TEMPLATE_ID!,
  });
}
