import { config } from 'dotenv';
import path from 'node:path';
import { validateProductionEnvironment } from '@/lib/deploy/production-env';

function getEnvFile() {
  const args = process.argv.slice(2);
  if (args.length === 0) return process.env.QIKUKU_ENV_FILE || '.env.production.local';
  if (args.length === 2 && args[0] === '--file') return args[1];
  throw new Error('用法：tsx scripts/deploy/check-production-env.ts [--file <env-file>]');
}

async function main() {
  const envFile = getEnvFile();
  const loaded = config({ path: path.resolve(envFile), override: true });
  if (loaded.error) throw new Error('无法读取生产环境文件');
  // The runtime path is inside the container. Host scripts separately verify
  // the source CA path before mounting it read-only, so this check must not
  // incorrectly require /run/secrets to exist on the CVM host.
  const result = validateProductionEnvironment(process.env, { checkCaFile: false });
  if (!result.valid) {
    for (const error of result.errors) console.error(`[deploy-env] ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log('[deploy-env] production environment validation passed');
}

main().catch(() => {
  console.error('[deploy-env] production environment validation failed');
  process.exitCode = 1;
});
