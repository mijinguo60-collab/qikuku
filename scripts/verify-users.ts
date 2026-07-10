import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const c = await pool.connect();
  try {
    // Check admin
    const admin = await c.query(`SELECT "email", "passwordHash", "role", "companyId" FROM "User" WHERE "email" = 'admin@zhucheng.com'`);
    console.log('admin exists:', admin.rowCount === 1);
    if (admin.rowCount === 1) {
      const valid = await bcrypt.compare('123456', admin.rows[0].passwordHash);
      console.log('admin password valid:', valid);
      console.log('admin role:', admin.rows[0].role);
    }

    // Check employee
    const emp = await c.query(`SELECT "email", "passwordHash", "role", "companyId" FROM "User" WHERE "email" = 'employee@zhucheng.com'`);
    console.log('employee exists:', emp.rowCount === 1);
    if (emp.rowCount === 1) {
      const valid = await bcrypt.compare('123456', emp.rows[0].passwordHash);
      console.log('employee password valid:', valid);
      console.log('employee role:', emp.rows[0].role);
    }

    // Total users
    const all = await c.query(`SELECT COUNT(*) as c FROM "User"`);
    console.log('total users:', all.rows[0].c);
  } catch (e: any) {
    console.error('Error:', e.message);
  } finally { c.release(); await pool.end(); }
}
main();
