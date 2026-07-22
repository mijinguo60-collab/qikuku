import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { config as loadEnv, parse } from 'dotenv';

loadEnv({ path: '.env.local' });

function latestNeonBackup() {
  const directory = path.join(process.cwd(), '.local-backups');
  const names = readdirSync(directory).filter((name) => /^env\.local\.\d+\.bak$/.test(name)).sort();
  if (!names.length) throw new Error('未找到 Git 忽略的 Neon 本地配置备份');
  return path.join(directory, names.at(-1)!);
}

function main() {
  if (!process.argv.includes('--apply') || process.env.CONFIRM_DOMESTIC_DB_MIGRATION !== 'migrate-neon-test-to-domestic') {
    throw new Error('必须传入 --apply 和 CONFIRM_DOMESTIC_DB_MIGRATION=migrate-neon-test-to-domestic');
  }
  const source = parse(readFileSync(latestNeonBackup()));
  const sourceUrl = source.DATABASE_DIRECT_URL;
  const targetUrl = process.env.DATABASE_DIRECT_URL;
  const targetCa = process.env.DATABASE_SSL_CA_PATH;
  if (!sourceUrl || !targetUrl || !targetCa) throw new Error('本地源库备份、目标库或目标 CA 配置不完整');
  const sourceHost = new URL(sourceUrl).hostname;
  const targetHost = new URL(targetUrl).hostname;
  assert.equal(sourceHost, 'ep-snowy-tooth-ata0virv.c-9.us-east-1.aws.neon.tech', '源库必须是指定 Neon 测试 direct endpoint');
  assert.equal(targetHost.includes('neon.tech'), false, '目标库必须是国内 PostgreSQL');
  assert.notEqual(sourceUrl, targetUrl, '源库与目标库不得相同');

  const result = spawnSync('bash', ['scripts/db/migrate-postgres.sh', '--apply'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: `/opt/homebrew/opt/libpq/bin:${process.env.PATH || ''}`,
      SOURCE_DATABASE_URL: sourceUrl,
      TARGET_DATABASE_URL: targetUrl,
      TARGET_DATABASE_SSL_CA_PATH: targetCa,
    },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

try { main(); } catch (error) { console.error('local migration failed:', error instanceof Error ? error.message : 'unknown'); process.exitCode = 1; }
