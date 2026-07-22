import assert from 'node:assert/strict';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

type Endpoint = { hostname: string; database: string };

function parseReadonlySource(url: string): Endpoint {
  const parsed = new URL(url);
  assert.ok(['postgres:', 'postgresql:'].includes(parsed.protocol), 'SOURCE_DATABASE_URL 必须是 PostgreSQL 连接串');
  assert.equal(parsed.hostname, 'ep-snowy-tooth-ata0virv.c-9.us-east-1.aws.neon.tech', '只允许检查指定 Neon 测试 direct endpoint');
  return { hostname: parsed.hostname, database: parsed.pathname.replace(/^\//, '') || 'postgres' };
}

async function main() {
  const url = process.env.SOURCE_DATABASE_URL || process.env.DATABASE_DIRECT_URL;
  if (!url) throw new Error('缺少 SOURCE_DATABASE_URL 或 DATABASE_DIRECT_URL');
  const endpoint = parseReadonlySource(url);
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, statement_timeout: 20_000 });
  await client.connect();
  try {
    // One pg Client must execute queries sequentially. Parallel client.query()
    // calls otherwise queue ambiguously and are deprecated by pg.
    const version = await client.query('SHOW server_version');
    const extensions = await client.query(`SELECT extname, extversion FROM pg_extension ORDER BY extname`);
    const tables = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`);
    const indexes = await client.query(`SELECT tablename, indexname FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`);
    const constraints = await client.query(`SELECT conrelid::regclass::text AS table_name, conname, contype FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2`);
    const enums = await client.query(`SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values FROM pg_type t JOIN pg_enum e ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' GROUP BY t.typname ORDER BY t.typname`);
    const migrations = await client.query(`SELECT migration_name, finished_at IS NOT NULL AS applied FROM "_prisma_migrations" ORDER BY started_at`);
    const size = await client.query(`SELECT pg_database_size(current_database())::bigint AS bytes`);
    const exactRows: Record<string, number> = {};
    for (const row of tables.rows as Array<{ table_name: string }>) {
      assert.match(row.table_name, /^[A-Za-z_][A-Za-z0-9_]*$/);
      const count = await client.query(`SELECT COUNT(*)::int AS count FROM "${row.table_name}"`);
      exactRows[row.table_name] = Number(count.rows[0]?.count || 0);
    }
    console.log(JSON.stringify({
      endpoint,
      serverVersion: version.rows[0]?.server_version,
      extensions: extensions.rows,
      tables: tables.rows.map((row) => row.table_name),
      indexes: indexes.rows,
      constraints: constraints.rows,
      enums: enums.rows,
      migrations: migrations.rows,
      databaseBytes: Number(size.rows[0]?.bytes || 0),
      exactRows,
      readonly: true,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error('source inspection failed:', error instanceof Error ? error.message : 'unknown'); process.exitCode = 1; });
