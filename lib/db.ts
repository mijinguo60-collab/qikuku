/**
 * Database adapter: PostgreSQL (Neon/Vercel) or SQLite (local dev)
 * Returns a unified interface supporting .prepare().get()/.all()/.run()
 */
import { Pool } from 'pg';
import path from 'path';

let db: any = undefined;
const URL = process.env.DATABASE_URL || '';

function toPgParams(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => '$' + (++n));
}

function createPgDb(): any {
  const pool = new Pool({ connectionString: URL, max: 5 });
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
  };
}

function createSqliteDb(): any {
  const Database = require('better-sqlite3');
  const sq = new Database(path.join(process.cwd(), 'prisma', 'dev.db'));
  sq.pragma('journal_mode = WAL');
  sq.pragma('foreign_keys = ON');
  return sq;
}

function createMockDb(): any {
  const noop = () => ({ get: () => null, all: () => [], run: () => ({ changes: 0 }) });
  return { prepare: () => noop(), transaction: (fn: any) => fn, pragma: () => {} };
}

export function getDb(): any {
  if (db) return db;
  const isPg = URL.startsWith('postgresql://') || URL.startsWith('postgres://');
  if (isPg) {
    try {
      db = createPgDb();
      console.log('[DB] PostgreSQL connected');
      return db;
    } catch (e: any) {
      console.error('[DB] PostgreSQL failed:', e.message);
    }
  }
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
