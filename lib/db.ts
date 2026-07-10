import Database from 'better-sqlite3';
import path from 'path';

let db: any = undefined;
let dbFailed = false;

function createMockDb() {
  const noop = () => ({ get: () => null, all: () => [], run: () => ({ changes: 0 }) });
  return { prepare: () => noop(), transaction: (fn: any) => fn, pragma: () => {} };
}

export function getDb(): any {
  if (dbFailed) return createMockDb();
  if (!db) {
    try {
      db = new Database(path.join(process.cwd(), 'prisma', 'dev.db'));
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
    } catch (e: any) {
      console.error('[DB] Failed to open database, using mock fallback:', e.message);
      dbFailed = true;
      return createMockDb();
    }
  }
  return db as any;
}

export default getDb;
