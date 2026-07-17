import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MAINTENANCE_WRITER = 'scripts/ensure-plans.ts';
const SELF = 'scripts/check-billing-readonly.mjs';
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function filesUnder(relativeDirectory) {
  const absoluteDirectory = path.join(ROOT, relativeDirectory);
  if (!fs.existsSync(absoluteDirectory)) return [];
  const entries = fs.readdirSync(absoluteDirectory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) return filesUnder(relativePath);
    return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [relativePath] : [];
  });
}

function fail(message) {
  console.error(`Billing readonly check failed: ${message}`);
  process.exitCode = 1;
}

const planMutation = /(?:\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+["`]?Plan["`]?\b|\b(?:prisma\s*\.\s*plan\s*\.\s*(?:create|createMany|update|updateMany|upsert|delete|deleteMany))\b)/i;
const runtimeFiles = [
  ...filesUnder('app'),
  ...filesUnder('lib'),
  'middleware.ts',
].filter((relativePath) => fs.existsSync(path.join(ROOT, relativePath)));
const maintenanceFiles = filesUnder('scripts').filter((relativePath) => relativePath !== SELF);

for (const relativePath of runtimeFiles) {
  const source = read(relativePath);
  if (/\bensurePlans\b/.test(source)) fail(`${relativePath} must not reference plan initialization`);
  if (planMutation.test(source)) fail(`${relativePath} must not mutate Plan`);
}

for (const relativePath of maintenanceFiles) {
  const source = read(relativePath);
  if (relativePath !== MAINTENANCE_WRITER && planMutation.test(source)) {
    fail(`${relativePath} must not mutate Plan; use ${MAINTENANCE_WRITER} --apply explicitly`);
  }
  if (relativePath !== MAINTENANCE_WRITER && /\bensurePlans\b/.test(source)) {
    fail(`${relativePath} must not call plan initialization`);
  }
}

const writer = read(MAINTENANCE_WRITER);
if (!writer.includes("args[0] === '--apply'")) fail(`${MAINTENANCE_WRITER} must require --apply for writes`);
if (!writer.includes('DATABASE_DIRECT_URL')) fail(`${MAINTENANCE_WRITER} must use the Direct connection`);
if (writer.includes('DATABASE_URL ||')) fail(`${MAINTENANCE_WRITER} must not fall back to DATABASE_URL`);

console.log('✓ Billing readonly check passed: Plan writes are isolated to scripts/ensure-plans.ts --apply.');
