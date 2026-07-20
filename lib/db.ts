/**
 * Database adapter: PostgreSQL (Neon/Vercel) or SQLite (local dev)
 * Returns a unified interface supporting .prepare().get()/.all()/.run()
 */
import { Pool, types as pgTypes } from 'pg';
import path from 'path';

let db: any = undefined;
const URL = process.env.DATABASE_URL || '';
const REQUIRE_POSTGRES = process.env.DATABASE_REQUIRE_POSTGRES === 'true';
const PG_POOL_MAX = 5;
const PG_CONNECTION_TIMEOUT_MS = 10_000;
const PG_IDLE_TIMEOUT_MS = 30_000;

const PG_TIMESTAMP_WITHOUT_TIMEZONE_OID = 1114;

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

function createPgDb(): any {
  const pool = new Pool({
    connectionString: URL,
    max: PG_POOL_MAX,
    connectionTimeoutMillis: PG_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: PG_IDLE_TIMEOUT_MS,
    keepAlive: true,
  });
  pool.on('error', (error: NodeJS.ErrnoException) => {
    console.error('[DB] Idle PostgreSQL client error:', error.code || 'UNKNOWN');
  });
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
    transactionAsync: async (fn: (tx: any) => Promise<any>) => {
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
  (sq as any).transactionAsync = async (fn: (tx: any) => Promise<any>) => {
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
  if (db) return db;
  const isPg = URL.startsWith('postgresql://') || URL.startsWith('postgres://');
  if (REQUIRE_POSTGRES && !isPg) {
    throw new Error('PostgreSQL is required for this operation');
  }
  if (isPg) {
    try {
      db = createPgDb();
      console.log('[DB] PostgreSQL connected');
      return db;
    } catch (e: any) {
      console.error('[DB] PostgreSQL failed:', e.message);
      if (REQUIRE_POSTGRES) throw e;
    }
  }
  if (REQUIRE_POSTGRES) throw new Error('PostgreSQL connection could not be created');
  try {
    db = createSqliteDb();
    console.log('[DB] SQLite connected');
    return db;
  } catch (e: any) {
    console.error('[DB] SQLite failed:', e.message);
  }
  db = createMockDb();
  console.warn('[DB] Using mock database');
  return db;
}

export default getDb;
