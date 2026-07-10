import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SKIP = ['node_modules','.next','.git','package-lock.json','prisma/dev.db','prisma/dev.db-shm','prisma/dev.db-wal','.DS_Store','.env','scripts/check-secrets.mjs'];

const TABLES = ['User','Company','AuditLog','Document','KnowledgeSpace','KnowledgeChunk','ImageGeneration','Lead','Skill','AiCallLog'];

let issues = 0;

function scan(dir) {
  try {
    for (const entry of readdirSync(dir)) {
      if (SKIP.includes(entry)) continue;
      const fp = join(dir, entry);
      try {
        if (statSync(fp).isDirectory()) { scan(fp); continue; }
        if (statSync(fp).size > 500000) continue;
      } catch { continue; }
      if (!/\.(ts|tsx)$/.test(fp)) continue;
      try {
        const lines = readFileSync(fp, 'utf8').split('\n');
        lines.forEach((line, i) => {
          for (const tbl of TABLES) {
            const re = new RegExp(`\\b(FROM|JOIN|INSERT INTO|UPDATE|DELETE FROM)\\s+${tbl}\\b`);
            if (re.test(line) && !line.includes(`"${tbl}"`)) {
              console.log(`ISSUE ${fp}:${i+1}: ${line.trim().slice(0,80)}`);
              issues++;
            }
          }
        });
      } catch {}
    }
  } catch {}
}

scan('.');
console.log(`\nTotal unquoted table references: ${issues}`);
console.log('check:routes:', issues === 0 ? 'PASS' : 'FAIL');
