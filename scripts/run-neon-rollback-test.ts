import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { config as loadEnv, parse } from 'dotenv';

loadEnv({ path: '.env.local' });

const NEON_TEST_HOST = 'ep-snowy-tooth-ata0virv.c-9.us-east-1.aws.neon.tech';
const allowedScripts = new Set([
  'scripts/test-sms-auth-db-rollback.ts',
  'scripts/test-company-invitations-db-rollback.ts',
  'scripts/test-company-invitation-routes-db-rollback.ts',
]);

function latestNeonBackup() {
  const directory = path.join(process.cwd(), '.local-backups');
  const names = readdirSync(directory).filter((name) => /^env\.local\.\d+\.bak$/.test(name)).sort().reverse();
  for (const name of names) {
    const values = parse(readFileSync(path.join(directory, name)));
    const direct = values.DATABASE_DIRECT_URL;
    if (direct && new URL(direct).hostname === NEON_TEST_HOST) return direct;
  }
  throw new Error('未找到指定 Neon 测试 direct endpoint 的 Git 忽略本地配置备份');
}

function main() {
  const script = process.argv[2];
  if (!script || !allowedScripts.has(script)) throw new Error('仅允许运行固定的 Neon 回滚测试脚本');
  const sourceUrl = latestNeonBackup();
  assert.equal(new URL(sourceUrl).hostname, NEON_TEST_HOST, '回滚测试只能连接指定 Neon 测试 endpoint');
  const result = spawnSync('npx', ['tsx', script], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, TEST_DATABASE_DIRECT_URL: sourceUrl },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

try { main(); } catch (error) { console.error('Neon rollback test failed:', error instanceof Error ? error.message : 'unknown'); process.exitCode = 1; }
