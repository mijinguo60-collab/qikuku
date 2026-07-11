/**
 * Database adapter: PostgreSQL (Neon/Vercel) or SQLite (local dev)
 * Returns a unified interface supporting .prepare().get()/.all()/.run()
 */
import { Pool } from 'pg';
import path from 'path';

let db: any = undefined;
const URL = process.env.DATABASE_URL || '';
const REQUIRE_POSTGRES = process.env.DATABASE_REQUIRE_POSTGRES === 'true';

function toPgParams(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => '$' + (++n));
}

function createPgDb(): any {
  const pool = new Pool({ connectionString: URL, max: 5 });
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
      try {
        await client.query('BEGIN');
        const result = await fn(createClientDb(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
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
