import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { pathToFileURL } from 'node:url';
import { PLAN_CATALOG } from '../lib/billing/pricing';
import { validateProductionEnvironment } from '../lib/deploy/production-env';
import { connectionStringWithoutTlsParameters, strictPostgresTlsConfig } from '../lib/strict-pg-tls';
import {
  isReadableDirectPostgresUrl,
  parseMaintenanceArgs,
} from './lib/maintenance-policy';

export type ExistingPlan = {
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

export type PlanChange = {
  kind: 'create' | 'update' | 'unchanged';
  code: string;
  existing?: ExistingPlan;
};

type FieldDiff = {
  field: string;
  existing: unknown;
  planned: unknown;
};

function diffFields(existing: ExistingPlan, plan: (typeof PLAN_CATALOG)[number]): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  if (existing.name !== plan.name) diffs.push({ field: 'name', existing: existing.name, planned: plan.name });
  if (Number(existing.monthlyPrice) !== plan.monthlyPrice) diffs.push({ field: 'monthlyPrice', existing: Number(existing.monthlyPrice), planned: plan.monthlyPrice });
  if (Number(existing.yearlyPrice) !== plan.yearlyPrice) diffs.push({ field: 'yearlyPrice', existing: Number(existing.yearlyPrice), planned: plan.yearlyPrice });
  if (Number(existing.monthlyCredits) !== plan.monthlyCredits) diffs.push({ field: 'monthlyCredits', existing: Number(existing.monthlyCredits), planned: plan.monthlyCredits });
  if (Number(existing.maxMembers) !== plan.maxMembers) diffs.push({ field: 'maxMembers', existing: Number(existing.maxMembers), planned: plan.maxMembers });
  if (Number(existing.maxKnowledgeSpaces) !== plan.maxKnowledgeSpaces) diffs.push({ field: 'maxKnowledgeSpaces', existing: Number(existing.maxKnowledgeSpaces), planned: plan.maxKnowledgeSpaces });
  if (Number(existing.storageLimitBytes) !== plan.storageLimitBytes) diffs.push({ field: 'storageLimitBytes', existing: Number(existing.storageLimitBytes), planned: plan.storageLimitBytes });
  if (stableFeatures(existing.featuresJson) !== JSON.stringify(plan.features)) diffs.push({ field: 'featuresJson', existing: existing.featuresJson, planned: JSON.stringify(plan.features) });
  if (existing.enabled !== true) diffs.push({ field: 'enabled', existing: existing.enabled, planned: true });
  return diffs;
}

export function reconcilePlans(existingPlans: readonly ExistingPlan[]): PlanChange[] {
  const existingByCode = new Map(existingPlans.map((plan) => [plan.code, plan]));
  return PLAN_CATALOG.map((plan) => {
    const existing = existingByCode.get(plan.code);
    if (!existing) return { kind: 'create', code: plan.code };
    const diffs = diffFields(existing, plan);
    return { kind: diffs.length === 0 ? 'unchanged' : 'update', code: plan.code, existing };
  });
}

export function parseEnsurePlansArguments(args: readonly string[]) {
  const parsed = parseMaintenanceArgs(args);
  return {
    ...parsed,
    writeAllowed: parsed.mode !== 'apply' || parsed.allowProduction,
  };
}

function getDirectDatabaseUrl() {
  loadEnvConfig(process.cwd());
  const databaseUrl = process.env.DATABASE_DIRECT_URL;
  if (!databaseUrl) {
    console.error(JSON.stringify({ phase: 'validate_database_config', errorCode: 'DATABASE_DIRECT_URL_MISSING' }));
    return null;
  }
  const productionEnvironment = validateProductionEnvironment(process.env, { checkCaFile: true });
  if (!productionEnvironment.valid || !isReadableDirectPostgresUrl(databaseUrl)) {
    console.error(JSON.stringify({ phase: 'validate_database_config', errorCode: 'INVALID_PRODUCTION_DATABASE_CONFIG' }));
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

function safeErrorCode(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return 'ENSURE_PLANS_FAILED';
}

async function main() {
  let parsed: ReturnType<typeof parseEnsurePlansArguments>;
  try {
    parsed = parseEnsurePlansArguments(process.argv.slice(2));
  } catch {
    console.error(JSON.stringify({ phase: 'arguments', errorCode: 'UNSUPPORTED_ARGUMENT', timedOut: false }));
    process.exitCode = 1;
    return;
  }

  const { mode, writeAllowed } = parsed;

  const databaseUrl = getDirectDatabaseUrl();
  if (!databaseUrl) {
    process.exitCode = 1;
    return;
  }

  if (!writeAllowed) {
    console.error(JSON.stringify({ phase: 'authorization', errorCode: 'ALLOW_PRODUCTION_REQUIRED', timedOut: false }));
    process.exitCode = 1;
    return;
  }

  const client = new Client({
    connectionString: connectionStringWithoutTlsParameters(databaseUrl),
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
    ssl: strictPostgresTlsConfig(databaseUrl, process.env.DATABASE_SSL_CA_PATH!),
  });
  try {
    await client.connect();
    const result = await client.query<ExistingPlan>(`SELECT id,code,name,"monthlyPrice","yearlyPrice","monthlyCredits","maxMembers","maxKnowledgeSpaces","storageLimitBytes","featuresJson",enabled FROM "Plan" ORDER BY code ASC`);
    const changes = reconcilePlans(result.rows);
    const counts = {
      create: changes.filter((change) => change.kind === 'create').length,
      update: changes.filter((change) => change.kind === 'update').length,
      unchanged: changes.filter((change) => change.kind === 'unchanged').length,
      delete: 0,
    };

    if (mode === 'dry-run') {
      console.log(JSON.stringify({ mode, strictTls: true, ...counts, applied: false }));
      for (const change of changes) {
        if (change.kind === 'unchanged') continue;
        console.log(JSON.stringify({
          code: change.code,
          action: change.kind,
          changedFields: change.kind === 'update'
            ? diffFields(change.existing!, PLAN_CATALOG.find((plan) => plan.code === change.code)!).map((difference) => difference.field)
            : ['ALL'],
        }));
      }
      return;
    }

    await client.query('BEGIN');
    try {
      for (const change of changes) {
        if (change.kind === 'unchanged') continue;
        const plan = PLAN_CATALOG.find((item) => item.code === change.code);
        if (!plan) throw new Error('PLAN_CATALOG_MISMATCH');
        const now = new Date().toISOString();
        const values = [plan.name, plan.monthlyPrice, plan.yearlyPrice, plan.monthlyCredits, plan.maxMembers, plan.maxKnowledgeSpaces, plan.storageLimitBytes, JSON.stringify(plan.features), true];
        if (change.kind === 'create') {
          // INSERT: 13 列，13 个 $N 占位符，参数数组 13 个元素
          // id($1) code($2) name($3) monthlyPrice($4) yearlyPrice($5) monthlyCredits($6)
          // maxMembers($7) maxKnowledgeSpaces($8) storageLimitBytes($9) featuresJson($10)
          // enabled($11) createdAt($12) updatedAt($13)
          await client.query(`INSERT INTO "Plan" (id,code,name,"monthlyPrice","yearlyPrice","monthlyCredits","maxMembers","maxKnowledgeSpaces","storageLimitBytes","featuresJson",enabled,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [randomUUID(), plan.code, ...values, now, now]);
          continue;
        }
        // UPDATE: 12 列，12 个 $N 占位符，参数数组 12 个元素
        // name($1) monthlyPrice($2) yearlyPrice($3) monthlyCredits($4) maxMembers($5)
        // maxKnowledgeSpaces($6) storageLimitBytes($7) featuresJson($8) enabled($9)
        // updatedAt($10) id($11) code($12)
        const update = await client.query(`UPDATE "Plan" SET name=$1,"monthlyPrice"=$2,"yearlyPrice"=$3,"monthlyCredits"=$4,"maxMembers"=$5,"maxKnowledgeSpaces"=$6,"storageLimitBytes"=$7,"featuresJson"=$8,enabled=$9,"updatedAt"=$10 WHERE id=$11 AND code=$12`, [...values, now, change.existing?.id, plan.code]);
        if (update.rowCount !== 1) throw new Error('PLAN_UPDATE_MISMATCH');
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }

    console.log(JSON.stringify({ mode, strictTls: true, ...counts, applied: true }));
  } catch (error) {
    console.error(JSON.stringify({ phase: 'ensure_plans', errorCode: safeErrorCode(error), timedOut: safeErrorCode(error) === 'ETIMEDOUT' }));
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error(JSON.stringify({ phase: 'ensure_plans', errorCode: 'ENSURE_PLANS_FAILED', timedOut: false }));
    process.exitCode = 1;
  });
}
