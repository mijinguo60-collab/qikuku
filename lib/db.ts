import Database from 'better-sqlite3';
import path from 'path';

let db: InstanceType<typeof Database>;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(path.join(process.cwd(), 'prisma', 'dev.db'));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db as any;
}

export default getDb;
