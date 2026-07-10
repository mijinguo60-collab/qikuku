import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const c = await pool.connect();
  try {
    const dc = await c.query(`SELECT COUNT(*) as c FROM "Document"`);
    const docs = Number(dc.rows[0].c);
    console.log('documents count:', docs);

    const cc = await c.query(`SELECT COUNT(*) as c FROM "KnowledgeChunk"`);
    const chunks = Number(cc.rows[0].c);
    console.log('chunks count:', chunks);

    const ec = await c.query(`SELECT COUNT(*) as c FROM "KnowledgeChunk" WHERE embedding IS NOT NULL AND embedding != '' AND embedding != '[]'`);
    const embedded = Number(ec.rows[0].c);
    console.log('chunks with embedding:', embedded);

    const rc = await c.query(`SELECT COUNT(*) as c FROM "Document" WHERE status = 'ready'`);
    console.log('ready documents:', Number(rc.rows[0].c));

    console.log('EMBEDDING_API_KEY exists:', !!process.env.EMBEDDING_API_KEY);
    console.log('EMBEDDING_BASE_URL exists:', !!process.env.EMBEDDING_BASE_URL);
    console.log('EMBEDDING_MODEL:', process.env.EMBEDDING_MODEL || 'not set');

    if (docs === 0) console.log('\n→ RAG readiness: no documents');
    else if (chunks === 0) console.log('\n→ RAG readiness: documents without chunks');
    else if (embedded === 0) console.log('\n→ RAG readiness: ready for keyword search');
    else console.log('\n→ RAG readiness: ready for semantic search');
  } catch (e) { console.error('Error:', e.message); }
  finally { c.release(); await pool.end(); }
}
main();
