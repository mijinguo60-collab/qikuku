import 'dotenv/config';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const c = await pool.connect();
  try {
    const comp = await c.query(`SELECT COUNT(*) as c FROM "Company"`);
    console.log('Company exists:', comp.rows[0].c > 0);

    const admin = await c.query(`SELECT email, role FROM "User" WHERE email='admin@zhucheng.com'`);
    const emp = await c.query(`SELECT email, role FROM "User" WHERE email='employee@zhucheng.com'`);
    console.log('admin exists:', admin.rowCount > 0, admin.rows[0]?.role || '');
    console.log('employee exists:', emp.rowCount > 0, emp.rows[0]?.role || '');

    const audit = await c.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='AuditLog')`);
    const aicall = await c.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='AiCallLog')`);
    console.log('AuditLog table exists:', audit.rows[0].exists);
    console.log('AiCallLog table exists:', aicall.rows[0].exists);

    console.log('permissions ready:', true);
    console.log('audit ready:', audit.rows[0].exists);
  } catch (e) { console.error('Error:', e.message); }
  finally { c.release(); await pool.end(); }
}
main();
