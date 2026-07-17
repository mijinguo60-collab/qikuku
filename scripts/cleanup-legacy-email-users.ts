import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const maskEmail = (email: string | null) => !email ? '—' : email.replace(/^(.{1,2}).*(@.*)$/, '$1***$2');
const isDryRun = process.argv.includes('--dry-run') || process.env.CONFIRM_LEGACY_USER_DELETE !== 'DELETE_TWO_LEGACY_USERS';

function printDiagnostic(error: unknown) {
  const value: any = error && typeof error === 'object' ? error : {};
  const type = error === null ? 'null' : Array.isArray(error) ? 'array' : typeof error;
  const message = typeof error === 'string' ? error : value.message || String(error || 'unknown');
  console.error('Legacy cleanup diagnostic:', {
    type,
    message,
    code: value.code || null,
    detail: value.detail || null,
    hint: value.hint || null,
    constraint: value.constraint || null,
  });
  if (process.env.NODE_ENV !== 'production' && value.stack) console.error(value.stack);
}

async function main() {
  if (!isDryRun) {
    console.error('真实删除流程未在本脚本启用；请先执行并确认 dry-run。');
    process.exitCode = 1;
    return;
  }
  const { getDb } = await import('../lib/db');
  const db = getDb();

  // Only SELECT statements are used in dry-run.
  const requiredTables = ['User', 'UserSession', 'AuthIdentity', 'CompanyMembership'];
  const tableCheck = await db.prepare(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY(?)`).all(requiredTables);
  const existing = new Set(tableCheck.map((row: any) => row.table_name));
  const missing = requiredTables.filter((name) => !existing.has(name));
  if (missing.length) {
    console.error(`dry-run 已停止：缺少迁移表 ${missing.join(', ')}。请先完成受控 Prisma migration/db push 后重试。`);
    process.exitCode = 1;
    return;
  }

  const platformEmails = new Set((process.env.PLATFORM_ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
  const rows = await db.prepare(`
    SELECT
      u.id,
      u.email,
      u."companyId" AS "companyId",
      u.role,
      (SELECT COUNT(*) FROM "UserSession" s WHERE s."userId" = u.id) AS "sessionCount",
      (SELECT COUNT(*) FROM "CompanyMembership" m WHERE m."userId" = u.id) AS "membershipCount",
      (SELECT COUNT(*) FROM "AuthIdentity" i WHERE i."userId" = u.id) AS "identityCount",
      EXISTS (SELECT 1 FROM "AuthIdentity" i WHERE i."userId" = u.id AND i.provider = 'phone') AS "hasPhoneIdentity",
      EXISTS (SELECT 1 FROM "AuthIdentity" i WHERE i."userId" = u.id AND i.provider = 'wechat') AS "hasWechatIdentity"
    FROM "User" u
    WHERE u.email IS NOT NULL
      AND u."passwordHash" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "AuthIdentity" i WHERE i."userId" = u.id AND i.provider IN ('phone', 'wechat'))
    ORDER BY u."createdAt" ASC
  `).all();

  const candidates = rows.filter((row: any) => row.role !== 'platform_super_admin' && !platformEmails.has(String(row.email).toLowerCase()));
  console.log(`dry-run 候选账号数量：${candidates.length}`);
  for (const row of candidates) {
    console.log({
      email: maskEmail(row.email), userId: row.id, companyId: row.companyId,
      sessionCount: Number(row.sessionCount), membershipCount: Number(row.membershipCount), identityCount: Number(row.identityCount),
      isPlatformAdmin: row.role === 'platform_super_admin' || platformEmails.has(String(row.email).toLowerCase()),
      qualifiesForCleanup: !row.hasPhoneIdentity && !row.hasWechatIdentity && row.role !== 'platform_super_admin' && !platformEmails.has(String(row.email).toLowerCase()),
    });
  }
  if (candidates.length !== 2) {
    console.log(`dry-run 正常停止：实际候选数量为 ${candidates.length}，不是 2；未修改任何数据库数据。`);
    return;
  }
  console.log('dry-run 完成：识别到正好 2 个候选账号；未设置删除确认变量，未修改任何数据库数据。');
}

main().catch((error) => { printDiagnostic(error); process.exitCode = 1; });
