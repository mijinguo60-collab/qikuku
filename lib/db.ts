import path from 'path';
import { Pool } from 'pg';

let db: any = undefined;
let dbType: 'sqlite' | 'pg' | 'mock' = 'mock';

function toPgParams(sql: string, params: any[]): string {
  let n = 0;
  return sql.replace(/\?/g, () => '$' + (++n));
}

function createPgDb(pool: Pool) {
  return {
    prepare: (sql: string) => ({
      get: (...params: any[]) => {
        return pool.query(toPgParams(sql, params), params).then(r => r.rows[0] || null);
      },
      all: (...params: any[]) => {
        return pool.query(toPgParams(sql, params), params).then(r => r.rows);
      },
      run: (...params: any[]) => {
        return pool.query(toPgParams(sql, params), params).then(r => ({ changes: r.rowCount || 0 }));
      },
    }),
    transaction: (fn: any) => fn(),
  };
}

function createMockDb() {
  const noop = () => ({ get: () => null, all: () => [], run: () => ({ changes: 0 }) });
  return { prepare: () => noop(), transaction: (fn: any) => fn, pragma: () => {} };
}

export function getDb(): any {
  if (!db) {
    // 1. PostgreSQL (Vercel/Neon)
    try {
      const pgPool = new Pool({ connectionString: process.env.DATABASE_URL!, max: 5 });
      dbType = 'pg';
      db = createPgDb(pgPool);
      console.log('[DB] PostgreSQL connected');
      return db;
    } catch (e: any) {
      console.error('[DB] PostgreSQL failed:', e.message);
    }

    // 2. SQLite (local dev)
    try {
      import('better-sqlite3').then(m => {
        const sq = new m.default(path.join(process.cwd(), 'prisma', 'dev.db'));
        sq.pragma('journal_mode = WAL');
        sq.pragma('foreign_keys = ON');
        dbType = 'sqlite';
        db = sq;
        console.log('[DB] SQLite connected (async)');
      });
      // Return pg stubs for now - SQLite will replace on next call
      db = createPgDb(new Pool({ connectionString: process.env.DATABASE_URL! }));
      dbType = 'pg';
      console.warn('[DB] SQLite delayed init, using PG temporarily');
      return db;
    } catch (e: any) {
      console.error('[DB] SQLite failed:', e.message);
    }

    // 3. Mock
    dbType = 'mock';
    db = createMockDb();
    console.warn('[DB] Using mock database');
  }
  return db;
}
