import assert from 'node:assert/strict';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { readFileSync } from 'node:fs';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

function percentile(values: number[], value: number) {
  return values[Math.min(values.length - 1, Math.ceil(values.length * value) - 1)];
}

async function measure(client: Client, runs: number, sql: string) {
  const samples: number[] = [];
  for (let index = 0; index < runs; index += 1) {
    const started = performance.now();
    await client.query(sql);
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return { minMs: Number(samples[0].toFixed(2)), medianMs: Number(percentile(samples, 0.5).toFixed(2)), p95Ms: Number(percentile(samples, 0.95).toFixed(2)), runs };
}

async function main() {
  const sourceTestMode = process.argv.includes('--source-test');
  const domesticMode = process.argv.includes('--current-domestic');
  if (sourceTestMode === domesticMode) throw new Error('必须二选一传入 --source-test 或 --current-domestic');
  const target = process.env.BENCHMARK_DATABASE_URL || (domesticMode ? process.env.DATABASE_DIRECT_URL : undefined);
  if (!target) throw new Error('缺少受控基准连接；请通过本地包装器运行');
  const parsed = new URL(target);
  assert.ok(['postgres:', 'postgresql:'].includes(parsed.protocol), 'BENCHMARK_DATABASE_URL 必须是 PostgreSQL 连接串');
  if (sourceTestMode) assert.equal(parsed.hostname, 'ep-snowy-tooth-ata0virv.c-9.us-east-1.aws.neon.tech', '--source-test 只能基准指定 Neon 测试库');
  if (domesticMode) assert.equal(parsed.hostname.includes('neon.tech'), false, '--current-domestic 不能连接 Neon');
  const runs = Number(process.argv.find((arg) => arg.startsWith('--runs='))?.split('=')[1] || 10);
  assert.ok(Number.isInteger(runs) && runs >= 3 && runs <= 100, 'runs 必须在 3 到 100 之间');
  for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) parsed.searchParams.delete(key);
  const certificatePath = domesticMode ? process.env.DATABASE_SSL_CA_PATH : undefined;
  if (domesticMode && !certificatePath) throw new Error('国内基准必须配置 DATABASE_SSL_CA_PATH');
  const client = new Client({
    connectionString: parsed.toString(),
    ssl: certificatePath ? { ca: readFileSync(certificatePath, 'utf8'), rejectUnauthorized: true } : { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
    statement_timeout: 20_000,
  });
  await client.connect();
  try {
    await client.query('SELECT 1'); // warm connection; excluded from samples
    const selectOne = await measure(client, runs, 'SELECT 1');
    const schemaProbe = await measure(client, runs, `SELECT 1 FROM "UserSession" LIMIT 0`);
    console.log(JSON.stringify({ endpoint: parsed.hostname, readonly: true, selectOne, sessionQueryPlanProbe: schemaProbe }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  const databaseError = error as { code?: unknown; message?: unknown };
  const code = typeof databaseError.code === 'string' ? ` (${databaseError.code})` : '';
  const message = typeof databaseError.message === 'string' && databaseError.message ? `: ${databaseError.message}` : '';
  console.error(`benchmark failed${code}${message}`);
  process.exitCode = 1;
});
