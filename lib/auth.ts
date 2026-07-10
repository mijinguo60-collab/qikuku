import { getDb } from './db';
import { compare, hash } from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  companyId: string;
  companyName?: string;
}

export interface Company {
  id: string;
  name: string;
  logo: string | null;
  industry: string | null;
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 12);
}

export async function verifyPassword(password: string, hashed: string): Promise<boolean> {
  return compare(password, hashed);
}

export async function createUser(
  name: string,
  email: string,
  password: string,
  companyName: string
): Promise<User | null> {
  const db = getDb();
  const passwordHash = await hashPassword(password);
  const companyId = uuidv4();
  const userId = uuidv4();

  const insertCompany = db.prepare(
    'INSERT INTO Company (id, name, industry, plan) VALUES (?, ?, ?, ?)'
  );
  const insertUser = db.prepare(
    'INSERT INTO User (id, name, email, passwordHash, role, companyId) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const tx = db.transaction(() => {
    insertCompany.run(companyId, companyName, null, 'free');
    insertUser.run(userId, name, email, passwordHash, 'super_admin', companyId);
  });

  try {
    tx();
    return { id: userId, name, email, role: 'super_admin', companyId };
  } catch {
    return null;
  }
}

export async function authenticateUser(email: string, password: string): Promise<User | null> {
  // Demo account: unconditional bypass, no database dependency
  if (email === 'admin@zhucheng.com' && password === '123456') {
    return {
      id: 'demo-user-admin',
      name: '张老板',
      email: 'admin@zhucheng.com',
      role: 'super_admin',
      companyId: 'demo-company-zhucheng',
      companyName: '诸城吃喝玩乐',
    };
  }

  try {
  const db = getDb();
  const row = db.prepare(`
    SELECT u.id, u.name, u.email, u.passwordHash, u.role, u.companyId, c.name as companyName
    FROM User u JOIN Company c ON u.companyId = c.id
    WHERE u.email = ?
  `).get(email) as any;

  if (!row) return null;

  const valid = await verifyPassword(password, row.passwordHash);
  if (!valid) return null;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    companyId: row.companyId,
    companyName: row.companyName,
  };
  } catch (e: any) {
    console.error('[AUTH] Database query failed:', e.message);
    return null;
  }
}

export function getUserById(id: string): User | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.companyId, c.name as companyName
    FROM User u JOIN Company c ON u.companyId = c.id
    WHERE u.id = ?
  `).get(id) as any;

  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    companyId: row.companyId,
    companyName: row.companyName,
  };
}

export function getCompany(id: string): Company | null {
  const db = getDb();
  return db.prepare('SELECT id, name, logo, industry FROM Company WHERE id = ?').get(id) as any;
}
