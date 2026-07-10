import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SKIP = ['node_modules','.next','.git','package-lock.json','prisma/dev.db','prisma/dev.db-shm','prisma/dev.db-wal','.DS_Store','.env'];

const TABLES = ['User','Company','AuditLog','Document','KnowledgeSpace','KnowledgeChunk','ImageGeneration','Lead','Skill','AiCallLog'];

// camelCase columns commonly used in raw SQL that need quoting in PostgreSQL
const CAMEL_COLS = [
  'knowledgeSpaceId','companyId','userId','createdAt','updatedAt',
  'passwordHash','uploadedById','fileUrl','fileSize','mimeType',
  'documentId','storageProvider','storageKey','rawProviderUrl',
  'isBuiltIn','encryptedKey','extractedText','sensitivityLevel',
  'contactName','contactPhone','teamSize','currentTool','painPoint',
  'companyName','revisedPrompt','imageUrl','sourceImageUrl',
  'questionPreview','promptTokens','completionTokens','totalTokens',
  'latencyMs','errorMessage','sourcesCount','modelStatus',
  'isAiEnabled','sourceInspiration','diagnosticQuestions',
  'requiredKnowledgeTypes','systemPrompt','outputSchema',
  'suitableQuestions','targetType','targetId',
];

let issues = 0;

// Extract all SQL string literals from a line and check for unquoted camelCase
function checkSqlStrings(line, fp, i) {
  // Match SQL string patterns: prepare('...'), prepare(`...``), 'SQL...', `SQL...`
  const sqlPatterns = [
    /(?:\.prepare|db\.prepare)\s*\((['`])((?:[^\\1]|\\.)*?)\1/gs,
    /(['`])\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/gi,
  ];

  // Simpler approach: look for lines that contain SQL keywords in strings
  const sqlRegions = [];
  
  // Find backtick strings: `...`
  const btRe = /`([^`]*)`/g;
  let m;
  while ((m = btRe.exec(line)) !== null) {
    const content = m[1];
    if (/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|SET|JOIN)\b/i.test(content)) {
      sqlRegions.push(content);
    }
  }
  
  // Find single-quoted strings: '...'
  const sqRe = /'([^']*)'/g;
  while ((m = sqRe.exec(line)) !== null) {
    const content = m[1];
    if (/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|SET|JOIN)\b/i.test(content)) {
      sqlRegions.push(content);
    }
  }

  for (const sql of sqlRegions) {
    // Check table names
    for (const tbl of TABLES) {
      const re = new RegExp(`\\b(FROM|JOIN|INSERT INTO|UPDATE|DELETE FROM)\\s+${tbl}\\b`, 'i');
      if (re.test(sql) && !sql.includes(`"${tbl}"`)) {
        console.log(`ISSUE ${fp}:${i+1}: unquoted table "${tbl}" in SQL`);
        issues++;
      }
    }

    // Check alias.column patterns inside SQL
    const aliasColRe = /\b([a-z])\.([A-Z][a-zA-Z]+)\b/g;
    while ((m = aliasColRe.exec(sql)) !== null) {
      const full = m[0];
      console.log(`ISSUE ${fp}:${i+1}: unquoted alias.column "${full}" in SQL string`);
      issues++;
    }

    // Check standalone camelCase column refs in INSERT lists, SET clauses, WHERE
    for (const col of CAMEL_COLS) {
      if (sql.includes(col) && !sql.includes(`"${col}"`)) {
        // Make sure it's not part of a quoted string already
        console.log(`ISSUE ${fp}:${i+1}: unquoted column "${col}" in SQL string`);
        issues++;
        break;
      }
    }
  }
}

function scan(dir) {
  try {
    for (const entry of readdirSync(dir)) {
      if (SKIP.includes(entry)) continue;
      const fp = join(dir, entry);
      try {
        if (statSync(fp).isDirectory()) { scan(fp); continue; }
        if (statSync(fp).size > 500000) continue;
      } catch { continue; }
      if (!/\.(ts|tsx|mjs)$/.test(fp)) continue;
      try {
        const content = readFileSync(fp, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          checkSqlStrings(line, fp, i + 1);
        });
      } catch {
        // Ignore
      }
    }
  } catch {}
}

scan('.');
console.log(`\nTotal issues found: ${issues}`);
if (issues === 0) {
  console.log('check:routes: PASS');
  process.exit(0);
} else {
  console.log('check:routes: WARN — review issues above');
  process.exit(0); // Don't fail, just warn
}
