import { existsSync, statSync } from 'node:fs';

export type ProductionEnvironment = Record<string, string | undefined>;

export type ProductionEnvironmentOptions = {
  checkCaFile?: boolean;
};

export type ProductionEnvironmentCheck = {
  valid: boolean;
  errors: string[];
};

const REQUIRED = [
  'DATABASE_URL',
  'DATABASE_DIRECT_URL',
  'DATABASE_SSL_CA_PATH',
  'DATABASE_REQUIRE_POSTGRES',
  'SESSION_SECRET',
  'SMS_CODE_PEPPER',
  'ENCRYPTION_KEY',
  'SMS_PROVIDER',
  'TENCENT_SMS_SECRET_ID',
  'TENCENT_SMS_SECRET_KEY',
  'TENCENT_SMS_SDK_APP_ID',
  'TENCENT_SMS_SIGN_NAME',
  'TENCENT_SMS_TEMPLATE_ID',
  'BLOB_READ_WRITE_TOKEN',
  'CRON_SECRET',
] as const;

function isPrivateIpv4(hostname: string) {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  if (parts.some((value) => value > 255)) return false;
  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

function validPostgresUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'postgres:' || url.protocol === 'postgresql:';
  } catch {
    return false;
  }
}

function databaseHost(value: string) {
  return new URL(value).hostname;
}

function hasUnsafeSslUrlOption(value: string) {
  const url = new URL(value);
  const sslMode = url.searchParams.get('sslmode');
  if (sslMode && sslMode !== 'verify-full') return true;
  return ['sslrootcert', 'sslcert', 'sslkey'].some((key) => url.searchParams.has(key));
}

/**
 * Validates values without ever returning their contents. A private DNS name
 * can be explicitly allowlisted for TencentDB certificate-SAN support via
 * DATABASE_PRIVATE_HOSTS; this avoids unsafe certificate-verification bypasses.
 */
export function validateProductionEnvironment(
  environment: ProductionEnvironment,
  options: ProductionEnvironmentOptions = {},
): ProductionEnvironmentCheck {
  const errors: string[] = [];
  for (const name of REQUIRED) {
    if (!environment[name]?.trim()) errors.push(`缺少必填环境变量：${name}`);
  }

  if (environment.NODE_ENV !== 'production') errors.push('NODE_ENV 必须为 production');
  if (environment.DATABASE_REQUIRE_POSTGRES !== 'true') errors.push('DATABASE_REQUIRE_POSTGRES 必须为 true');
  if (environment.SMS_PROVIDER?.trim().toLowerCase() !== 'tencent') errors.push('SMS_PROVIDER 必须为 tencent');
  if (environment.SMS_TEST_MODE === 'true') errors.push('生产环境不得启用 SMS_TEST_MODE');
  if ((environment.SESSION_SECRET || '').length < 32) errors.push('SESSION_SECRET 长度不足');
  if ((environment.SMS_CODE_PEPPER || '').length < 32) errors.push('SMS_CODE_PEPPER 长度不足');
  if ((environment.ENCRYPTION_KEY || '').length < 32) errors.push('ENCRYPTION_KEY 长度不足');

  const urls = [environment.DATABASE_URL, environment.DATABASE_DIRECT_URL];
  if (urls.some((value) => !validPostgresUrl(value))) {
    errors.push('DATABASE_URL 和 DATABASE_DIRECT_URL 必须是 PostgreSQL URL');
  } else {
    for (const value of urls as string[]) {
      const host = databaseHost(value);
      const allowedPrivateHosts = new Set((environment.DATABASE_PRIVATE_HOSTS || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean));
      if (host.endsWith('.neon.tech')) errors.push('生产环境不得使用 Neon endpoint');
      if (!isPrivateIpv4(host) && !allowedPrivateHosts.has(host)) {
        errors.push('数据库地址必须为私网 IP，或列入 DATABASE_PRIVATE_HOSTS 的腾讯云私网域名');
      }
      if (hasUnsafeSslUrlOption(value)) {
        errors.push('数据库 URL 不得包含弱 sslmode 或内嵌 SSL 证书路径');
      }
    }
  }

  const caPath = environment.DATABASE_SSL_CA_PATH;
  if (caPath && !caPath.startsWith('/')) errors.push('DATABASE_SSL_CA_PATH 必须是容器内绝对路径');
  if (options.checkCaFile && caPath) {
    try {
      if (!existsSync(caPath) || !statSync(caPath).isFile()) errors.push('DATABASE_SSL_CA_PATH 不是可读取文件');
    } catch {
      errors.push('DATABASE_SSL_CA_PATH 无法读取');
    }
  }

  return { valid: errors.length === 0, errors };
}
