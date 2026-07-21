import { loadEnvConfig } from '@next/env';
import {
  buildInitBillingDryRunSummary,
  classifyDatabaseTarget,
  formatMaintenanceTarget,
  isReadableDirectPostgresUrl,
  parseMaintenanceArgs,
  resolveMaintenanceWriteDecision,
} from './lib/maintenance-policy';

// 禁止在顶部静态导入会触达 lib/db.ts 的模块。lib/db.ts 在模块加载时读取
// process.env.DATABASE_URL，必须等 loadDb() 设置环境变量后再动态导入。

type DbLike = {
  prepare(sql: string): {
    get: (..._params: readonly unknown[]) => Promise<any>;
    all: (..._params: readonly unknown[]) => Promise<any[]>;
    run: (..._params: readonly unknown[]) => Promise<{ changes: number }>;
  };
  transactionAsync?<T>(..._args: [fn: (tx: DbLike) => Promise<T>]): Promise<T>;
};

type CompanyRow = { id: string };
type SubscriptionRow = {
  companyId: string;
  planCode: string;
  createdAt: string | Date | null;
  updatedAt: string | Date | null;
  id: string;
};
type WelcomeGrantRow = { companyId: string; idempotencyKey: string };

type InitModules = {
  db: DbLike;
  initializeTrialSubscriptionForCompany: typeof import('../lib/billing/plans')['initializeTrialSubscriptionForCompany'];
  TRIAL_CREDITS: number;
};

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'unknown error';
}

function getDirectDatabaseUrl() {
  loadEnvConfig(process.cwd());
  const databaseUrl = process.env.DATABASE_DIRECT_URL;
  if (!databaseUrl) {
    console.error('billing:init 缺少 DATABASE_DIRECT_URL');
    return null;
  }
  if (!isReadableDirectPostgresUrl(databaseUrl)) {
    console.error('billing:init 仅允许 PostgreSQL direct 地址，已拒绝 pooler 或无效连接串');
    return null;
  }
  return databaseUrl;
}

async function loadModules(directUrl: string): Promise<InitModules> {
  // 必须在动态 import 之前设置 DATABASE_URL，
  // 否则 lib/db.ts 模块加载时会读到空值并退化到 SQLite。
  process.env.DATABASE_URL = directUrl;
  process.env.DATABASE_REQUIRE_POSTGRES = 'true';

  const [{ getDb }, { initializeTrialSubscriptionForCompany }, { TRIAL_CREDITS }] = await Promise.all([
    import('../lib/db'),
    import('../lib/billing/plans'),
    import('../lib/billing/pricing'),
  ]);

  return { db: getDb() as DbLike, initializeTrialSubscriptionForCompany, TRIAL_CREDITS };
}

async function readCompanies(db: DbLike): Promise<CompanyRow[]> {
  return db.prepare('SELECT id FROM "Company" ORDER BY "createdAt" ASC').all();
}

async function readLatestSubscriptions(db: DbLike): Promise<SubscriptionRow[]> {
  return db.prepare(
    `SELECT DISTINCT ON (s."companyId") s."companyId", p.code AS "planCode", s.id, s."createdAt", s."updatedAt"
     FROM "Subscription" s
     LEFT JOIN "Plan" p ON p.id = s."planId"
     ORDER BY s."companyId" ASC, COALESCE(s."updatedAt", s."createdAt") DESC, s."createdAt" DESC, s.id DESC`
  ).all();
}

async function readWelcomeGrants(db: DbLike): Promise<WelcomeGrantRow[]> {
  return db.prepare('SELECT DISTINCT "companyId", "idempotencyKey" FROM "CreditLedger" WHERE "idempotencyKey" LIKE ?').all('WELCOME:%');
}

async function companyHasWelcomeGrant(db: DbLike, companyId: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 FROM "CreditLedger" WHERE "companyId" = ? AND "idempotencyKey" = ? LIMIT 1').get(companyId, `WELCOME:${companyId}`);
  return Boolean(row);
}

async function main() {
  let parsed;
  try {
    parsed = parseMaintenanceArgs(process.argv.slice(2));
  } catch {
    console.error('billing:init 参数无效，仅允许 --dry-run / --apply / --apply --allow-production');
    process.exitCode = 1;
    return;
  }

  const directUrl = getDirectDatabaseUrl();
  if (!directUrl) {
    process.exitCode = 1;
    return;
  }

  const databaseTarget = classifyDatabaseTarget(directUrl);
  const targetInfo = formatMaintenanceTarget(directUrl);
  const writeDecision = resolveMaintenanceWriteDecision(databaseTarget, parsed.allowProduction);

  console.log(`billing:init 数据库目标：${databaseTarget}`);
  console.log(`billing:init host：${targetInfo.host}`);
  console.log(`billing:init database：${targetInfo.database}`);
  console.log(`billing:init direct：${targetInfo.direct ? '是' : '否'}`);

  if (parsed.mode === 'apply' && !writeDecision.allowed) {
    console.error(writeDecision.reason === 'production_without_allow'
      ? 'billing:init 检测到生产数据库，必须同时提供 --apply --allow-production'
      : 'billing:init 数据库目标无法识别，拒绝写入');
    process.exitCode = 1;
    return;
  }

  const { db, initializeTrialSubscriptionForCompany, TRIAL_CREDITS } = await loadModules(directUrl);

  const companies = await readCompanies(db);
  const latestSubscriptions = await readLatestSubscriptions(db);
  const welcomeGrants = await readWelcomeGrants(db);

  const summary = buildInitBillingDryRunSummary({ companies, subscriptions: latestSubscriptions, welcomeGrants, trialCredits: TRIAL_CREDITS });
  if (parsed.mode === 'dry-run') {
    console.log(JSON.stringify(summary));
    return;
  }

  if (typeof db.transactionAsync !== 'function') {
    console.error('billing:init 当前数据库适配器不支持事务');
    process.exitCode = 1;
    return;
  }

  // 基于最新订阅构建状态映射，不遍历历史订阅
  const latestPlanByCompany = new Map<string, string | null>();
  const welcomeByCompany = new Set<string>();
  for (const subscription of latestSubscriptions) {
    latestPlanByCompany.set(subscription.companyId, subscription.planCode);
  }
  for (const grant of welcomeGrants) {
    welcomeByCompany.add(grant.companyId);
  }

  const result = {
    processedCompanies: 0,
    createdTrialSubscriptions: 0,
    repairedWelcomeGrants: 0,
    skippedCompanies: 0,
    createdCreditAccounts: 0,
    duplicateTrialWelcomeGrants: false,
  };

  const accountCountBefore = Number((await db.prepare('SELECT COUNT(*)::int AS count FROM "CreditAccount"').get())?.count || 0);

  await db.transactionAsync!(async (tx) => {
    for (const company of companies) {
      result.processedCompanies += 1;
      const latestPlan = latestPlanByCompany.get(company.id) || null;
      const hasWelcome = welcomeByCompany.has(company.id);

      if (latestPlan === null) {
        // 没有任何订阅：创建 trial + 欢迎积分
        result.createdTrialSubscriptions += 1;
        await initializeTrialSubscriptionForCompany({ companyId: company.id, source: 'ADMIN_REPAIR', tx });
        continue;
      }

      if (latestPlan !== 'trial') {
        // 最新订阅是付费套餐：跳过
        result.skippedCompanies += 1;
        continue;
      }

      // 最新订阅是 trial
      if (hasWelcome) {
        // 已有欢迎积分：跳过
        result.skippedCompanies += 1;
        continue;
      }

      // trial 但缺少欢迎积分：修复
      result.repairedWelcomeGrants += 1;
      const beforeWelcome = await companyHasWelcomeGrant(tx, company.id);
      await initializeTrialSubscriptionForCompany({ companyId: company.id, source: 'ADMIN_REPAIR', tx });
      if (beforeWelcome) result.duplicateTrialWelcomeGrants = true;
    }
  });

  const accountCount = await db.prepare('SELECT COUNT(*)::int AS count FROM "CreditAccount"').get();
  result.createdCreditAccounts = Math.max(0, Number(accountCount?.count || 0) - accountCountBefore);
  const duplicateWelcome = await db.prepare('SELECT "companyId" FROM "CreditLedger" WHERE "idempotencyKey" LIKE ? GROUP BY "companyId" HAVING COUNT(*) > 1').all('WELCOME:%');
  if (duplicateWelcome.length) result.duplicateTrialWelcomeGrants = true;

  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(`billing:init failed: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
});
