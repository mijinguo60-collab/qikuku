import 'dotenv/config';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const c = await pool.connect();
  try {
    const tables = ['Company','User','AuditLog','Lead','AiCallLog','ImageGeneration','KnowledgeChunk','KnowledgeSpace','Document','Skill'];
    for (const t of tables) {
      const r = await c.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name=$1)`, [t]);
      console.log(`${t}:`, r.rows[0].exists);
    }
    const lc = await c.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='company')`);
    console.log('company (lowercase):', lc.rows[0].exists, '(should be false — correct)');
  } catch(e){ console.error(e.message); }
  finally { c.release(); await pool.end(); }
}
main();
