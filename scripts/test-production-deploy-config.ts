import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { validateProductionEnvironment } from '@/lib/deploy/production-env';

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

function postgresUrl(host: string, query?: string) {
  const protocol = ['postgre', 'sql'].join('');
  const value = new URL(`${protocol}://test-user:test-only@${host}:5432/qikuku_test`);
  if (query) value.search = query;
  return value.toString();
}

function validEnv() {
  return {
    NODE_ENV: 'production',
    DATABASE_REQUIRE_POSTGRES: 'true',
    DATABASE_URL: postgresUrl('10.12.1.20'),
    DATABASE_DIRECT_URL: postgresUrl('10.12.1.20'),
    DATABASE_SSL_CA_PATH: '/run/secrets/tencentdb-ca.pem',
    SESSION_SECRET: 'a-session-secret-that-is-at-least-thirty-two-characters',
    SMS_CODE_PEPPER: 'a-sms-code-pepper-that-is-at-least-thirty-two-characters',
    ENCRYPTION_KEY: 'an-encryption-key-that-is-at-least-thirty-two-characters',
    SMS_PROVIDER: 'tencent',
    TENCENT_SMS_SECRET_ID: 'configured',
    TENCENT_SMS_SECRET_KEY: 'configured',
    TENCENT_SMS_SDK_APP_ID: 'configured',
    TENCENT_SMS_SIGN_NAME: 'configured',
    TENCENT_SMS_TEMPLATE_ID: 'configured',
    BLOB_READ_WRITE_TOKEN: 'configured',
    CRON_SECRET: 'configured',
    SMS_TEST_MODE: 'false',
  };
}

async function main() {
  const env = validEnv();
  assert.equal(validateProductionEnvironment(env).valid, true, 'private TencentDB URL must pass production validation');
  assert.equal(validateProductionEnvironment({ ...env, DATABASE_URL: postgresUrl('host.neon.tech') }).valid, false, 'Neon must be rejected');
  assert.equal(validateProductionEnvironment({ ...env, DATABASE_URL: postgresUrl('10.12.1.20', '?sslmode=require') }).valid, false, 'weak SSL mode must be rejected');
  assert.equal(validateProductionEnvironment({ ...env, SMS_TEST_MODE: 'true' }).valid, false, 'SMS test mode must be rejected');
  assert.equal(validateProductionEnvironment({ ...env, DATABASE_URL: postgresUrl('db.example.internal') }).valid, false, 'unapproved hostname must be rejected');
  assert.equal(validateProductionEnvironment({ ...env, DATABASE_URL: postgresUrl('db.example.internal'), DATABASE_PRIVATE_HOSTS: 'db.example.internal' }).valid, true, 'verified private DNS hostname may be allowlisted');

  const nextConfig = read('next.config.mjs');
  const dockerfile = read('Dockerfile');
  const compose = read('docker-compose.production.yml');
  const nginx = read('deploy/nginx/qikuku.conf.template');
  const migration = read('scripts/deploy/run-migrations.sh');
  const cron = read('deploy/scripts/run-monthly-billing.sh');
  const liveHealth = read('app/api/health/live/route.ts');
  const readyHealth = read('app/api/health/ready/route.ts');
  assert.match(nextConfig, /output:\s*'standalone'/, 'Next standalone output is required');
  assert.match(dockerfile, /USER qikuku/, 'application image must run as a non-root user');
  assert.match(dockerfile, /target CVM/, 'Dockerfile must document target-native builds');
  assert.match(compose, /\$\{QIKUKU_IMAGE:\?QIKUKU_IMAGE is required\}/, 'production image must be explicitly selected');
  assert.doesNotMatch(compose, /^\s*build:/m, 'production Compose must never build on the CVM');
  assert.match(compose, /pull_policy:\s*never/, 'production Compose must not pull images');
  assert.match(compose, /127\.0\.0\.1:\$\{QIKUKU_APP_PORT/, 'app must bind only to loopback');
  assert.match(compose, /DATABASE_SSL_CA_HOST_PATH/, 'CA must be mounted instead of committed');
  assert.match(compose, /:ro/, 'CA mount must be read-only');
  assert.match(compose, /driver:\s*local/, 'container logs must be bounded locally');
  assert.match(compose, /max-size:\s*20m/, 'container log size must be bounded');
  assert.match(compose, /max-file:\s*'5'/, 'container log history must be bounded');
  assert.match(compose, /cpus:\s*'3\.0'/, 'application CPU must stay below host capacity');
  assert.match(compose, /mem_limit:\s*4g/, 'application memory must stay below host capacity');
  assert.match(compose, /pids_limit:\s*256/, 'application process count must be bounded');
  assert.match(compose, /no-new-privileges:true/, 'container must not gain privileges');
  assert.match(compose, /cap_drop:\s*\n\s*- ALL/, 'container capabilities must be removed');
  assert.doesNotMatch(compose, /privileged:\s*true/, 'container must not be privileged');
  assert.doesNotMatch(compose, /network_mode:\s*host/, 'container must not use host networking');
  assert.doesNotMatch(compose, /docker\.sock/, 'container must not mount the Docker socket');
  assert.match(nginx, /proxy_buffering off/, 'streaming AI must not be proxy buffered');
  assert.match(nginx, /client_max_body_size 20m/, 'Nginx upload cap must match application cap');
  assert.match(migration, /CONFIRM_QIKUKU_MIGRATION/, 'migrations require explicit confirmation');
  assert.match(cron, /--config -/, 'cron must not place its authorization secret in argv');
  assert.doesNotMatch(liveHealth, /getDb\(/, 'liveness must not query the database');
  assert.match(readyHealth, /SELECT 1 AS ok/, 'readiness must verify PostgreSQL');
  assert.match(readyHealth, /status: 503/, 'database failure must return a safe 503');
  assert.doesNotMatch(compose, /0\.0\.0\.0:.*3000/, 'app port must not be public');
  console.log('production deployment configuration tests passed');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'production deployment configuration test failed');
  process.exitCode = 1;
});
