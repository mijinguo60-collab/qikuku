import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { PLAN_CATALOG } from '../lib/billing/pricing';
import {
  classifyDatabaseTarget,
  formatMaintenanceTarget,
  isReadableDirectPostgresUrl,
  parseMaintenanceArgs,
  resolveMaintenanceWriteDecision,
} from './lib/maintenance-policy';

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

function installSafeWarningHandler() {
  process.removeAllListeners('warning');
  process.on('warning', (warning) => {
    if (warning.message.startsWith("SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca'")) return;
    console.error(JSON.stringify({ phase: 'runtime_warning', errorCode: 'RUNTIME_WARNING', timedOut: false }));
  });
}

function getDirectDatabaseUrl() {
  loadEnvConfig(process.cwd());
  const databaseUrl = process.env.DATABASE_DIRECT_URL;
  if (!databaseUrl) {
    console.error('DATABASE_DIRECT_URL 未配置，已停止执行');
    return null;
  }
  if (!isReadableDirectPostgresUrl(databaseUrl)) {
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

function safeErrorCode(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return 'ENSURE_PLANS_FAILED';
}

async function main() {
  installSafeWarningHandler();
  let parsed: ReturnType<typeof parseMaintenanceArgs>;
  try {
    parsed = parseMaintenanceArgs(process.argv.slice(2));
  } catch {
    console.error(JSON.stringify({ phase: 'arguments', errorCode: 'UNSUPPORTED_ARGUMENT', timedOut: false }));
    process.exitCode = 1;
    return;
  }

  const { mode, allowProduction } = parsed;

  const databaseUrl = getDirectDatabaseUrl();
  if (!databaseUrl) {
    process.exitCode = 1;
    return;
  }

  const databaseTarget = classifyDatabaseTarget(databaseUrl);
  const targetInfo = formatMaintenanceTarget(databaseUrl);
  const writeDecision = resolveMaintenanceWriteDecision(databaseTarget, allowProduction);

  if (mode === 'dry-run') {
    console.log('ensure-plans dry-run：仅统计，不写数据库');
  }

  if (mode === 'apply' && !writeDecision.allowed) {
    console.error(writeDecision.reason === 'production_without_allow'
      ? 'ensure-plans 检测到生产数据库，必须同时提供 --apply --allow-production'
      : 'ensure-plans 数据库目标无法识别，拒绝执行写入');
    process.exitCode = 1;
    return;
  }

  console.log(`数据库目标：${databaseTarget}`);
  console.log(`数据库 host：${targetInfo.host}`);
  console.log(`数据库名称：${targetInfo.database}`);
  console.log(`数据库连接模式：${targetInfo.direct ? 'Direct' : 'Unknown'}`);
  console.log(`连接池地址：${targetInfo.pooled ? '是' : '否'}`);

  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 15_000, keepAlive: true });
  try {
    await client.connect();
    const result = await client.query<ExistingPlan>(`SELECT id,code,name,"monthlyPrice","yearlyPrice","monthlyCredits","maxMembers","maxKnowledgeSpaces","storageLimitBytes","featuresJson",enabled FROM "Plan" ORDER BY code ASC`);
    const existingByCode = new Map(result.rows.map((plan) => [plan.code, plan]));
    const changes: PlanChange[] = PLAN_CATALOG.map((plan) => {
      const existing = existingByCode.get(plan.code);
      if (!existing) return { kind: 'create', code: plan.code };
      const diffs = diffFields(existing, plan);
      return { kind: diffs.length === 0 ? 'unchanged' : 'update', code: plan.code, existing, diffs };
    });
    const counts = {
      create: changes.filter((change) => change.kind === 'create').length,
      update: changes.filter((change) => change.kind === 'update').length,
      unchanged: changes.filter((change) => change.kind === 'unchanged').length,
    };

    if (mode === 'dry-run') {
      console.log(JSON.stringify({ mode, ...counts, applied: false }));
      for (const change of changes) {
        if (change.kind === 'unchanged') continue;
        console.log(JSON.stringify({
          code: change.code,
          action: change.kind,
          changedFields: change.kind === 'update' ? (change as any).diffs?.map((d: FieldDiff) => d.field) : ['ALL'],
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
