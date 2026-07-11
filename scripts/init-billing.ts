import { loadEnvConfig } from '@next/env';

// 必须在导入数据库/计费模块之前加载 Next.js 环境变量。
loadEnvConfig(process.cwd());

function hasPostgresUrl() {
  const url = process.env.DATABASE_URL || '';
  return url.startsWith('postgres://') || url.startsWith('postgresql://');
}

async function main() {
  if (!hasPostgresUrl()) {
    // 不输出 URL，避免泄露用户名、密码或主机信息。
    console.error('billing:init 未连接 PostgreSQL，已停止初始化');
    process.exitCode = 1;
    return;
  }
  process.env.DATABASE_REQUIRE_POSTGRES = 'true';

  // Dynamic import prevents lib/db.ts from caching an empty DATABASE_URL before loadEnvConfig().
  const [{ getDb }, { ensureCompanySubscription, ensurePlans }] = await Promise.all([
    import('../lib/db'),
    import('../lib/billing/plans'),
  ]);
  let stage = '连接 PostgreSQL';
  try {
    const db = getDb();
    stage = '读取现有积分账户';
    const accountCountBefore = await db.prepare(`SELECT COUNT(*) as count FROM "CreditAccount"`).get();

    stage = '初始化套餐';
    await ensurePlans();
    const plans = await db.prepare(`SELECT COUNT(*) as count FROM "Plan"`).get();
    stage = '读取已有企业';
    const companies = await db.prepare(`SELECT id FROM "Company"`).all();
    stage = '初始化企业订阅与积分';
    for (const company of companies) await ensureCompanySubscription(company.id);

    stage = '读取初始化结果';
    const accountCountAfter = await db.prepare(`SELECT COUNT(*) as count FROM "CreditAccount"`).get();
    const duplicateTrials = await db.prepare(`SELECT "companyId" FROM "CreditGrant" WHERE "sourceType" = 'trial' GROUP BY "companyId" HAVING COUNT(*) > 1`).all();

    console.log('billing:init PostgreSQL initialization completed');
    console.log(`Plan 套餐初始化数量：${Number(plans?.count || 0)}`);
    console.log(`处理已有企业：${companies.length}`);
    console.log(`创建积分账户：${Math.max(0, Number(accountCountAfter?.count || 0) - Number(accountCountBefore?.count || 0))}`);
    console.log(`重复发放体验积分：${duplicateTrials.length ? '发现异常' : '否'}`);
    if (duplicateTrials.length) process.exitCode = 1;
  } catch (error: any) {
    const safeReason = error?.message || error?.code || error?.name || 'unknown error';
    console.error(`Billing initialization failed at ${stage}: ${safeReason}`);
    process.exitCode = 1;
  }
}

main().catch((error: any) => {
  // 仅保留通用错误文本，绝不输出 DATABASE_URL。
  console.error(`Billing initialization failed: ${error?.message || 'unknown error'}`);
  process.exitCode = 1;
});
