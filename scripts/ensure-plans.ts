import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { PLAN_CATALOG } from '../lib/billing/pricing';

type ExistingPlan = {
  id: string;
  code: string;
  name: string;
  monthlyPrice: number | string;
  yearlyPrice: number | string;
  monthlyCredits: number | string;
  maxMembers: number | string;
  maxKnowledgeSpaces: number | string;
  storageLimitBytes: number | string;
  featuresJson: string;
  enabled: boolean;
};

type PlanChange = {
  kind: 'create' | 'update' | 'unchanged';
  code: string;
  existing?: ExistingPlan;
};

function installSafeWarningHandler() {
  process.removeAllListeners('warning');
  process.on('warning', (warning) => {
    if (warning.message.startsWith("SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca'")) return;
    console.error(JSON.stringify({ phase: 'runtime_warning', errorCode: 'RUNTIME_WARNING', timedOut: false }));
  });
}

function parseMode(args: string[]) {
  if (args.length === 0 || (args.length === 1 && args[0] === '--dry-run')) return 'dry-run' as const;
  if (args.length === 1 && args[0] === '--apply') return 'apply' as const;
  throw new Error('UNSUPPORTED_ARGUMENT');
}

function getDirectDatabaseUrl() {
  loadEnvConfig(process.cwd());
  const databaseUrl = process.env.DATABASE_DIRECT_URL;
  if (!databaseUrl) {
    console.error('DATABASE_DIRECT_URL 未配置，已停止执行');
    return null;
  }
  try {
    if (new URL(databaseUrl).hostname.toLowerCase().includes('-pooler')) {
      console.error('DATABASE_DIRECT_URL 不是 Direct connection，已停止执行');
      return null;
    }
  } catch {
    console.error(JSON.stringify({ phase: 'validate_direct_connection', errorCode: 'INVALID_DATABASE_DIRECT_URL', timedOut: false }));
    return null;
  }
  return databaseUrl;
}

function stableFeatures(value: string) {
  try {
    return JSON.stringify(JSON.parse(value));
  } catch {
    return value;
  }
}

function isEquivalent(existing: ExistingPlan, plan: (typeof PLAN_CATALOG)[number]) {
  return existing.name === plan.name
    && Number(existing.monthlyPrice) === plan.monthlyPrice
    && Number(existing.yearlyPrice) === plan.yearlyPrice
    && Number(existing.monthlyCredits) === plan.monthlyCredits
    && Number(existing.maxMembers) === plan.maxMembers
    && Number(existing.maxKnowledgeSpaces) === plan.maxKnowledgeSpaces
    && Number(existing.storageLimitBytes) === plan.storageLimitBytes
    && stableFeatures(existing.featuresJson) === JSON.stringify(plan.features)
    && existing.enabled === true;
}

function safeErrorCode(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return 'ENSURE_PLANS_FAILED';
}

async function main() {
  installSafeWarningHandler();
  let mode: 'dry-run' | 'apply';
  try {
    mode = parseMode(process.argv.slice(2));
  } catch {
    console.error(JSON.stringify({ phase: 'arguments', errorCode: 'UNSUPPORTED_ARGUMENT', timedOut: false }));
    process.exitCode = 1;
    return;
  }

  const databaseUrl = getDirectDatabaseUrl();
  if (!databaseUrl) {
    process.exitCode = 1;
    return;
  }

  console.log('数据库连接模式：Direct');
  console.log('连接池地址：否');

  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 15_000, keepAlive: true });
  try {
    await client.connect();
    const result = await client.query<ExistingPlan>(`SELECT id,code,name,"monthlyPrice","yearlyPrice","monthlyCredits","maxMembers","maxKnowledgeSpaces","storageLimitBytes","featuresJson",enabled FROM "Plan" ORDER BY code ASC`);
    const existingByCode = new Map(result.rows.map((plan) => [plan.code, plan]));
    const changes: PlanChange[] = PLAN_CATALOG.map((plan) => {
      const existing = existingByCode.get(plan.code);
      if (!existing) return { kind: 'create', code: plan.code };
      return { kind: isEquivalent(existing, plan) ? 'unchanged' : 'update', code: plan.code, existing };
    });
    const counts = {
      create: changes.filter((change) => change.kind === 'create').length,
      update: changes.filter((change) => change.kind === 'update').length,
      unchanged: changes.filter((change) => change.kind === 'unchanged').length,
    };

    if (mode === 'dry-run') {
      console.log(JSON.stringify({ mode, ...counts, applied: false }));
      return;
    }

    await client.query('BEGIN');
    try {
      const now = new Date().toISOString();
      for (const change of changes) {
        if (change.kind === 'unchanged') continue;
        const plan = PLAN_CATALOG.find((item) => item.code === change.code);
        if (!plan) throw new Error('PLAN_CATALOG_MISMATCH');
        const values = [plan.name, plan.monthlyPrice, plan.yearlyPrice, plan.monthlyCredits, plan.maxMembers, plan.maxKnowledgeSpaces, plan.storageLimitBytes, JSON.stringify(plan.features), true, now];
        if (change.kind === 'create') {
          await client.query(`INSERT INTO "Plan" (id,code,name,"monthlyPrice","yearlyPrice","monthlyCredits","maxMembers","maxKnowledgeSpaces","storageLimitBytes","featuresJson",enabled,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`, [randomUUID(), plan.code, ...values]);
          continue;
        }
        const update = await client.query(`UPDATE "Plan" SET name=$1,"monthlyPrice"=$2,"yearlyPrice"=$3,"monthlyCredits"=$4,"maxMembers"=$5,"maxKnowledgeSpaces"=$6,"storageLimitBytes"=$7,"featuresJson"=$8,enabled=$9,"updatedAt"=$10 WHERE id=$11 AND code=$12`, [...values, change.existing?.id, plan.code]);
        if (update.rowCount !== 1) throw new Error('PLAN_UPDATE_MISMATCH');
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }

    console.log(JSON.stringify({ mode, ...counts, applied: true }));
  } catch (error) {
    console.error(JSON.stringify({ phase: 'ensure_plans', errorCode: safeErrorCode(error), timedOut: safeErrorCode(error) === 'ETIMEDOUT' }));
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch(() => {
  console.error(JSON.stringify({ phase: 'ensure_plans', errorCode: 'ENSURE_PLANS_FAILED', timedOut: false }));
  process.exitCode = 1;
});
