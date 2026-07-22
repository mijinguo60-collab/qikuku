import assert from 'node:assert/strict';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { readFileSync } from 'node:fs';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

type SequenceState = { lastValue: string; isCalled: boolean };
type Snapshot = { tables: Record<string, number>; migrations: string[]; indexes: string[]; constraints: string[]; sequences: Record<string, SequenceState> };

function endpoint(label: string, url: string) {
  const parsed = new URL(url);
  assert.ok(['postgres:', 'postgresql:'].includes(parsed.protocol), `${label} 必须是 PostgreSQL 连接串`);
  return parsed;
}

function clientOptions(url: string, certificatePath?: string) {
  const parsed = new URL(url);
  for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) parsed.searchParams.delete(key);
  if (!certificatePath) return { connectionString: parsed.toString(), ssl: { rejectUnauthorized: false }, statement_timeout: 30_000 };
  return { connectionString: parsed.toString(), ssl: { ca: readFileSync(certificatePath, 'utf8'), rejectUnauthorized: true }, statement_timeout: 30_000 };
}

async function snapshot(label: 'source' | 'target', url: string, certificatePath?: string): Promise<Snapshot> {
  const client = new Client(clientOptions(url, certificatePath));
  try {
    await client.connect();
    const tableNames = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`);
    const tableCounts: Record<string, number> = {};
    for (const row of tableNames.rows as Array<{ table_name: string }>) {
      assert.match(row.table_name, /^[A-Za-z_][A-Za-z0-9_]*$/);
      const count = await client.query(`SELECT COUNT(*)::int AS count FROM "${row.table_name}"`);
      tableCounts[row.table_name] = Number(count.rows[0]?.count || 0);
    }
    const migrations = await client.query(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name`);
    const indexes = await client.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public' ORDER BY indexname`);
    const constraints = await client.query(`SELECT conname FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conname`);
    const sequenceNames = await client.query(`SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema='public' ORDER BY sequence_name`);
    const sequences: Record<string, SequenceState> = {};
    for (const row of sequenceNames.rows as Array<{ sequence_name: string }>) {
      assert.match(row.sequence_name, /^[A-Za-z_][A-Za-z0-9_]*$/);
      const state = await client.query(`SELECT last_value::text AS "lastValue", is_called AS "isCalled" FROM "public"."${row.sequence_name}"`);
      sequences[row.sequence_name] = { lastValue: String(state.rows[0]?.lastValue), isCalled: Boolean(state.rows[0]?.isCalled) };
    }
    return {
      tables: tableCounts,
      migrations: migrations.rows.map((row) => row.migration_name),
      indexes: indexes.rows.map((row) => row.indexname),
      constraints: constraints.rows.map((row) => row.conname),
      sequences,
    };
  } catch (error) {
    const databaseError = error as { code?: unknown; message?: unknown };
    const code = typeof databaseError.code === 'string' ? ` (${databaseError.code})` : '';
    const message = typeof databaseError.message === 'string' && databaseError.message ? `: ${databaseError.message}` : '';
    throw new Error(`${label} migration snapshot failed${code}${message}`);
  } finally { await client.end().catch(() => undefined); }
}

async function main() {
  if (!process.argv.includes('--verify')) throw new Error('迁移校验必须显式传入 --verify');
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.TARGET_DATABASE_URL;
  if (!sourceUrl || !targetUrl) throw new Error('缺少 SOURCE_DATABASE_URL 或 TARGET_DATABASE_URL');
  const source = endpoint('SOURCE_DATABASE_URL', sourceUrl);
  const target = endpoint('TARGET_DATABASE_URL', targetUrl);
  assert.equal(source.hostname, 'ep-snowy-tooth-ata0virv.c-9.us-east-1.aws.neon.tech', 'source 只能是指定 Neon 测试 direct endpoint');
  assert.notEqual(source.href, target.href, 'source 与 target 不能相同');
  assert.equal(target.hostname.includes('neon.tech'), false, 'target 必须是新的国内 PostgreSQL，不可误写 Neon');
  const [before, after] = await Promise.all([snapshot('source', sourceUrl), snapshot('target', targetUrl, process.env.TARGET_DATABASE_SSL_CA_PATH)]);
  assert.deepEqual(after.tables, before.tables, '所有表行数估计值必须一致');
  assert.deepEqual(after.migrations, before.migrations, 'Prisma migration 历史必须一致');
  assert.deepEqual(after.indexes, before.indexes, '索引必须一致');
  assert.deepEqual(after.constraints, before.constraints, '约束必须一致');
  assert.deepEqual(after.sequences, before.sequences, '序列必须一致');
  console.log(JSON.stringify({ source: source.hostname, target: target.hostname, tablesMatch: true, migrationsMatch: true, indexesMatch: true, constraintsMatch: true, sequencesMatch: true, sequenceValuesMatch: true, ok: true }, null, 2));
}

main().catch((error) => { console.error('migration verification failed:', error instanceof Error ? error.message : 'unknown'); process.exitCode = 1; });
