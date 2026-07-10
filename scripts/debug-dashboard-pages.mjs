import 'dotenv/config';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const c = await pool.connect();
  try {
    const tests = [
      ['KnowledgeSpace', 'SELECT ks.*, (SELECT COUNT(*) FROM "Document" d WHERE d.knowledgeSpaceId = ks.id) as fileCount FROM "KnowledgeSpace" ks WHERE ks."companyId" = $1 ORDER BY ks."createdAt" DESC LIMIT 5', ['demo-company-zhucheng']],
      ['Document', 'SELECT d.*, ks.name as spaceName FROM "Document" d JOIN "KnowledgeSpace" ks ON d."knowledgeSpaceId" = ks.id WHERE d."companyId" = $1 ORDER BY d."createdAt" DESC LIMIT 5', ['demo-company-zhucheng']],
      ['Skill', 'SELECT * FROM "Skill" WHERE "enabled" = 1 AND ("companyId" = $1 OR "isBuiltIn" = 1) ORDER BY "createdAt" ASC LIMIT 5', ['demo-company-zhucheng']],
    ];
    for (const [name, sql, params] of tests) {
      try {
        const r = await c.query(sql, params);
        console.log(name + ' query ok, rows:', r.rowCount);
      } catch (e) { console.log(name + ' query FAILED:', e.message.split('\n')[0]); }
    }
  } catch (e) { console.error(e.message); }
  finally { c.release(); await pool.end(); }
}
main();
