import assert from 'node:assert/strict';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

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
  const target = process.env.BENCHMARK_DATABASE_URL || (sourceTestMode ? process.env.DATABASE_DIRECT_URL : undefined);
  if (!target) throw new Error('仅显式设置 BENCHMARK_DATABASE_URL，或使用 --source-test 后才可执行基准测试');
  const parsed = new URL(target);
  assert.ok(['postgres:', 'postgresql:'].includes(parsed.protocol), 'BENCHMARK_DATABASE_URL 必须是 PostgreSQL 连接串');
  if (sourceTestMode) assert.equal(parsed.hostname, 'ep-snowy-tooth-ata0virv.c-9.us-east-1.aws.neon.tech', '--source-test 只能基准指定 Neon 测试库');
  const runs = Number(process.argv.find((arg) => arg.startsWith('--runs='))?.split('=')[1] || 10);
  assert.ok(Number.isInteger(runs) && runs >= 3 && runs <= 100, 'runs 必须在 3 到 100 之间');
  const client = new Client({ connectionString: target, ssl: { rejectUnauthorized: false }, statement_timeout: 20_000 });
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

main().catch((error) => { console.error('benchmark failed:', error instanceof Error ? error.message : 'unknown'); process.exitCode = 1; });
