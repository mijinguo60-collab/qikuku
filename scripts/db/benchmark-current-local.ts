import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { config as loadEnv, parse } from 'dotenv';

loadEnv({ path: '.env.local' });

const NEON_TEST_HOST = 'ep-snowy-tooth-ata0virv.c-9.us-east-1.aws.neon.tech';

function latestNeonBackup() {
  const directory = path.join(process.cwd(), '.local-backups');
  const names = readdirSync(directory).filter((name) => /^env\.local\.\d+\.bak$/.test(name)).sort().reverse();
  for (const name of names) {
    const values = parse(readFileSync(path.join(directory, name)));
    if (values.DATABASE_DIRECT_URL && new URL(values.DATABASE_DIRECT_URL).hostname === NEON_TEST_HOST) return values.DATABASE_DIRECT_URL;
  }
  throw new Error('未找到指定 Neon 测试 direct endpoint 的 Git 忽略本地配置备份');
}

function main() {
  const source = process.argv.includes('--source');
  const domestic = process.argv.includes('--domestic');
  if (source === domestic) throw new Error('必须二选一传入 --source 或 --domestic');
  const domesticUrl = process.env.DATABASE_DIRECT_URL;
  if (!domesticUrl) throw new Error('缺少本地国内数据库配置');
  assert.equal(new URL(domesticUrl).hostname.includes('neon.tech'), false, '本地 DATABASE_DIRECT_URL 必须是国内数据库');
  const command = source ? ['tsx', 'scripts/db/benchmark-postgres.ts', '--source-test'] : ['tsx', 'scripts/db/benchmark-postgres.ts', '--current-domestic'];
  const result = spawnSync('npx', command, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      ...(source ? { BENCHMARK_DATABASE_URL: latestNeonBackup() } : {}),
    },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

try { main(); } catch (error) { console.error('database benchmark failed:', error instanceof Error ? error.message : 'unknown'); process.exitCode = 1; }
