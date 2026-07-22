/**
 * Database adapter: PostgreSQL (Neon/Vercel) or SQLite (local dev)
 * Returns a unified interface supporting .prepare().get()/.all()/.run()
 */
import { Pool, types as pgTypes } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import path from 'path';

const serverTestDbContext = new AsyncLocalStorage<any>();
const URL = process.env.DATABASE_URL || '';
const REQUIRE_POSTGRES = process.env.DATABASE_REQUIRE_POSTGRES === 'true';
const PG_POOL_MAX = 5;
const PG_CONNECTION_TIMEOUT_MS = 10_000;
const PG_IDLE_TIMEOUT_MS = 30_000;

const PG_TIMESTAMP_WITHOUT_TIMEZONE_OID = 1114;

type DatabaseGlobal = {
  db?: any;
};

// Next.js can evaluate a server module more than once during development hot
// reloads (and from different route bundles). Keep the process-local adapter on
// globalThis so those evaluations still share one PostgreSQL pool. This is an
// infrastructure cache only: it never stores request, user, or company data.
const databaseGlobal = globalThis as typeof globalThis & { __qikukuDatabase?: DatabaseGlobal };
const globalDatabase = databaseGlobal.__qikukuDatabase ?? (databaseGlobal.__qikukuDatabase = {});

// Prisma DateTime 在 PostgreSQL 中使用不带时区的 timestamp。
// 自定义 pg 适配器必须按 UTC 解析，避免受运行机器本地时区影响。
pgTypes.setTypeParser(PG_TIMESTAMP_WITHOUT_TIMEZONE_OID, (value) => {
  const isoLike = value.includes('T') ? value : value.replace(' ', 'T');
  return new Date(`${isoLike}Z`);
});

function toPgParams(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => '$' + (++n));
}

function getPostgresSslConfig() {
  const certificatePath = process.env.DATABASE_SSL_CA_PATH;
  if (!certificatePath) return undefined;
  try {
    return { ca: readFileSync(certificatePath, 'utf8'), rejectUnauthorized: true };
  } catch {
    throw new Error('DATABASE_SSL_CA_PATH 证书文件无法读取');
  }
}

function getPostgresConnectionString() {
  if (!process.env.DATABASE_SSL_CA_PATH) return URL;
  // pg gives SSL parameters embedded in a connection string precedence over
  // the explicit ssl object. Remove them so our pinned local CA below is the
  // single source of truth and rejectUnauthorized remains enforced.
  const parsed = new globalThis.URL(URL);
  for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) parsed.searchParams.delete(key);
  return parsed.toString();
}

function createPgDb(): any {
  const pool = new Pool({
    connectionString: getPostgresConnectionString(),
    max: PG_POOL_MAX,
    connectionTimeoutMillis: PG_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: PG_IDLE_TIMEOUT_MS,
    keepAlive: true,
    ssl: getPostgresSslConfig(),
  });
  pool.on('error', (error: NodeJS.ErrnoException) => {
    console.error('[DB] Idle PostgreSQL client error:', error.code || 'UNKNOWN');
  });
  if (process.env.NODE_ENV === 'development') console.info('[DB] PostgreSQL pool created');
  const createClientDb = (client: any) => ({
    prepare: (sql: string) => ({
      get: async (...params: any[]) => {
        const r = await client.query(toPgParams(sql), params);
        return r.rows[0] || null;
      },
      all: async (...params: any[]) => {
        const r = await client.query(toPgParams(sql), params);
        return r.rows;
      },
      run: async (...params: any[]) => {
        const r = await client.query(toPgParams(sql), params);
        return { changes: r.rowCount || 0 };
      },
    }),
  });
  return {
    prepare: (sql: string) => ({
      get: async (...params: any[]) => {
        const r = await pool.query(toPgParams(sql), params);
        return r.rows[0] || null;
      },
      all: async (...params: any[]) => {
        const r = await pool.query(toPgParams(sql), params);
        return r.rows;
      },
      run: async (...params: any[]) => {
        const r = await pool.query(toPgParams(sql), params);
        return { changes: r.rowCount || 0 };
      },
    }),
    transaction: (fn: any) => fn(),
    // New code that needs real atomicity (such as balance deductions) should use this.
    transactionAsync: async (fn: Function) => {
      const client = await pool.connect();
      let releaseError: Error | undefined;
      try {
        await client.query('BEGIN');
        const result = await fn(createClientDb(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        releaseError = error instanceof Error ? error : new Error('transaction_failed');
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release(releaseError);
      }
    },
  };
}

function createSqliteDb(): any {
  const Database = require('better-sqlite3');
  const sq = new Database(path.join(process.cwd(), 'prisma', 'dev.db'));
  sq.pragma('journal_mode = WAL');
  sq.pragma('foreign_keys = ON');
  (sq as any).transactionAsync = async (fn: Function) => {
    sq.exec('BEGIN IMMEDIATE');
    try {
      const result = await fn(sq);
      sq.exec('COMMIT');
      return result;
    } catch (error) {
      try { sq.exec('ROLLBACK'); } catch {}
      throw error;
    }
  };
  return sq;
}

function createMockDb(): any {
  const noop = () => ({ get: () => null, all: () => [], run: () => ({ changes: 0 }) });
  return { prepare: () => noop(), transaction: (fn: any) => fn, transactionAsync: async (fn: any) => fn(createMockDb()), pragma: () => {} };
}

export function getDb(): any {
  const scopedDb = serverTestDbContext.getStore();
  if (scopedDb) return scopedDb;
  if (globalDatabase.db) return globalDatabase.db;
  const isPg = URL.startsWith('postgresql://') || URL.startsWith('postgres://');
  if (REQUIRE_POSTGRES && !isPg) {
    throw new Error('PostgreSQL is required for this operation');
  }
  if (isPg) {
    try {
      globalDatabase.db = createPgDb();
      return globalDatabase.db;
    } catch (e: any) {
      console.error('[DB] PostgreSQL failed:', e.message);
      if (REQUIRE_POSTGRES) throw e;
    }
  }
  if (REQUIRE_POSTGRES) throw new Error('PostgreSQL connection could not be created');
  try {
    globalDatabase.db = createSqliteDb();
    console.log('[DB] SQLite connected');
    return globalDatabase.db;
  } catch (e: any) {
    console.error('[DB] SQLite failed:', e.message);
  }
  globalDatabase.db = createMockDb();
  console.warn('[DB] Using mock database');
  return globalDatabase.db;
}

/** Server-test-only async scope; never derived from HTTP request data. */
export async function withServerTestDb<T>(testDb: any, fn: () => Promise<T>): Promise<T> {
  if (process.env.NODE_ENV !== 'test') throw new Error('仅测试环境可以注入数据库');
  return serverTestDbContext.run(testDb, fn);
}

export default getDb;
