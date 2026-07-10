import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';

// Local role helpers (mirrors lib/roles.ts but avoids Next.js module resolution)
const MAP: Record<string, string> = {
  super_admin: 'owner', owner: 'owner', admin: 'admin',
  manager: 'manager', member: 'staff', employee: 'staff',
  staff: 'staff', sales: 'sales', content: 'content', readonly: 'readonly',
};
function normalize(r: string) { return MAP[r?.toLowerCase()] || 'readonly'; }
function isAdmin(r: string) { const n = normalize(r); return n === 'owner' || n === 'admin'; }

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const c = await pool.connect();
  try {
    for (const email of ['admin@zhucheng.com', 'employee@zhucheng.com']) {
      const r = await c.query(`SELECT "email", "passwordHash", "role" FROM "User" WHERE "email" = $1`, [email]);
      console.log(email + ' exists:', r.rowCount === 1);
      if (r.rowCount === 1) {
        const valid = await bcrypt.compare('123456', r.rows[0].passwordHash);
        console.log(email + ' password valid:', valid);
        const raw = r.rows[0].role;
        console.log(email + ' raw role:', raw);
        console.log(email + ' normalized role:', normalize(raw));
        console.log(email + ' is ' + (isAdmin(raw) ? 'admin' : 'staff') + ' role');
      }
    }
    const all = await c.query(`SELECT COUNT(*) as c FROM "User"`);
    console.log('total users:', all.rows[0].c);
  } catch (e: any) { console.error('Error:', e.message); }
  finally { c.release(); await pool.end(); }
}
main();
