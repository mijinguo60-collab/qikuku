import { readFileSync, existsSync } from 'fs';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

const PATTERNS = [
  /DATABASE_URL=postgresql:\/\/[^$\s]+/,
  /DEEPSEEK_API_KEY=sk-[^\s]+/,
  /IMAGE_API_KEY=sk-[^\s]+/,
  /EMBEDDING_API_KEY=sk-[^\s]+/,
  /BLOB_READ_WRITE_TOKEN=[^\s]{20,}/,
];

const SKIP = ['node_modules','.next','.git','package-lock.json','prisma/dev.db','prisma/dev.db-shm','prisma/dev.db-wal','.DS_Store','.env'];

function scan(dir) {
  try {
    for (const entry of readdirSync(dir)) {
      if (SKIP.includes(entry)) continue;
      const fp = join(dir, entry);
      try {
        const st = statSync(fp);
        if (st.isDirectory()) { scan(fp); continue; }
        if (st.size > 500000) continue;
      } catch { continue; }
      try {
        const lines = readFileSync(fp, 'utf8').split('\n');
        lines.forEach((line, i) => {
          if (fp.includes('.env') && line.trim().startsWith('#') && !line.includes('your_')) return;
          for (const re of PATTERNS) {
            if (re.test(line)) {
              const masked = line.replace(/([A-Z_]+=)([^\s]+)/, '$1***MASKED***');
              if (!line.includes('your_') && !line.includes('example') && !fp.includes('.example') && !fp.includes('DEPLOYMENT')) {
                console.log(`WARN ${fp}:${i+1}: ${masked}`);
              }
            }
          }
        });
      } catch {}
    }
  } catch {}
}

scan('.');
console.log('\ncheck:secrets done');
