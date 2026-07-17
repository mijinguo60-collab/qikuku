import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestSession } from '@/lib/session';
import { requirePlatformAdmin } from '@/lib/platform-admin/auth';

type Row = Record<string, unknown>;

function isValidCompanyId(value: string | undefined) {
  return Boolean(value && value.length <= 100 && /^[A-Za-z0-9_-]+$/.test(value));
}

function maskPhone(value: unknown) {
  if (typeof value !== 'string' || !value) return '未绑定';
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

function maskEmail(value: unknown) {
  if (typeof value !== 'string' || !value) return '未绑定';
  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) return '***';
  return `${value.slice(0, Math.min(2, at))}***@${value.slice(at + 1)}`;
}

function sanitizeText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .slice(0, 500)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [已隐藏]')
    .replace(/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'<>]+/gi, '[已隐藏数据库地址]')
    .replace(/\b\d{11}\b/g, '[已隐藏手机号]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (email) => maskEmail(email));
}

function nullableText(value: unknown) {
  return typeof value === 'string' && value ? sanitizeText(value) : null;
}

function toSafeNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && Math.abs(number) <= Number.MAX_SAFE_INTEGER ? number : null;
}

function membershipItem(row: Row) {
  return {
    membershipId: sanitizeText(row.membershipId),
    userId: sanitizeText(row.userId),
    userName: sanitizeText(row.userName) || '未设置姓名',
    maskedPhone: maskPhone(row.userPhone),
    maskedEmail: maskEmail(row.userEmail),
    role: sanitizeText(row.role),
    status: sanitizeText(row.status),
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
    lastLoginAt: row.lastLoginAt || null,
  };
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const companyId = params.id;
  if (!isValidCompanyId(companyId)) {
    return NextResponse.json({ error: '企业 ID 格式错误' }, { status: 400 });
  }

  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const platformAdmin = await requirePlatformAdmin(request);
  if (!platformAdmin) {
    return NextResponse.json({ error: '无平台运营权限' }, { status: 403 });
  }

  try {
    const db = getDb();
    const company = (await db
      .prepare(
        `SELECT id,name,industry,description,plan,"createdAt"
         FROM "Company"
         WHERE id=?`,
      )
      .get(companyId)) as Row | null;

    if (!company) return NextResponse.json({ error: '企业不存在' }, { status: 404 });

    const membershipRows = (await db
      .prepare(
        `SELECT
           membership.id AS "membershipId",
           membership."userId" AS "userId",
           membership.role,
           membership.status,
           membership."createdAt" AS "createdAt",
           membership."updatedAt" AS "updatedAt",
           member.id AS "memberId",
           member.name AS "userName",
           member.phone AS "userPhone",
           member.email AS "userEmail",
           member."lastLoginAt" AS "lastLoginAt"
         FROM "CompanyMembership" membership
         JOIN "User" member ON member.id=membership."userId"
         WHERE membership."companyId"=?
         ORDER BY membership."createdAt" ASC,membership.id ASC`,
      )
      .all(companyId)) as Row[];
    const memberships = membershipRows.map(membershipItem);
    const owners = memberships
      .filter((membership) => membership.role === 'owner' && membership.status === 'active')
      .map((membership) => ({
        membershipId: membership.membershipId,
        userId: membership.userId,
        name: membership.userName,
        maskedPhone: membership.maskedPhone,
        maskedEmail: membership.maskedEmail,
        role: membership.role,
        membershipStatus: membership.status,
        createdAt: membership.createdAt,
      }));

    const subscription = (await db
      .prepare(
        `SELECT
           subscription.id,
           subscription.status,
           subscription."planId" AS "planId",
           plan.code AS "planCode",
           plan.name AS "planName",
           subscription."startedAt" AS "currentPeriodStart",
           subscription."expiresAt" AS "currentPeriodEnd",
           subscription."createdAt" AS "createdAt"
         FROM "Subscription" subscription
         JOIN "Plan" plan ON plan.id=subscription."planId"
         WHERE subscription."companyId"=?
           AND subscription.status IN ('trialing','active','past_due')
         ORDER BY subscription."createdAt" DESC,subscription.id DESC
         LIMIT 1`,
      )
      .get(companyId)) as Row | null;

    const creditAccount = (await db
      .prepare(
        `SELECT id,"totalBalance","packageBalance","purchasedBalance","bonusBalance","updatedAt"
         FROM "CreditAccount"
         WHERE "companyId"=?`,
      )
      .get(companyId)) as Row | null;
    const creditSummary = (await db
      .prepare(
        `SELECT
           COUNT(*)::int AS "ledgerCount",
           COALESCE(SUM(CASE WHEN type='credit' AND "createdAt">=DATE_TRUNC('month',NOW()) THEN GREATEST(amount,0) ELSE 0 END),0) AS "currentMonthGranted",
           COALESCE(SUM(CASE WHEN type='debit' AND "createdAt">=DATE_TRUNC('month',NOW()) THEN ABS(amount) ELSE 0 END),0) AS "currentMonthUsed"
         FROM "CreditLedger"
         WHERE "companyId"=?`,
      )
      .get(companyId)) as Row | null;

    const resources = (await db
      .prepare(
        `SELECT
           (SELECT COUNT(*)::int FROM "KnowledgeSpace" WHERE "companyId"=?) AS "knowledgeSpaceCount",
           (SELECT COUNT(*)::int FROM "Document" WHERE "companyId"=?) AS "documentCount",
           (SELECT COUNT(*)::int FROM "Skill" WHERE "companyId"=?) AS "skillCount",
           (SELECT COALESCE(SUM("fileSize"),0) FROM "Document" WHERE "companyId"=?) AS "totalDocumentSize",
           (SELECT COUNT(*)::int FROM "Document" WHERE "companyId"=? AND "createdAt">=DATE_TRUNC('month',NOW())) AS "currentMonthUploadedDocumentCount"`,
      )
      .get(companyId, companyId, companyId, companyId, companyId)) as Row | null;

    const usage = (await db
      .prepare(
        `SELECT
           (SELECT COUNT(*)::int FROM "AiCallLog" WHERE "companyId"=? AND "createdAt">=DATE_TRUNC('month',NOW())) AS "aiCallCount",
           (SELECT COUNT(*)::int FROM "AiCallLog" WHERE "companyId"=? AND success=true AND "createdAt">=DATE_TRUNC('month',NOW())) AS "successfulAiCallCount",
           (SELECT COUNT(*)::int FROM "AiCallLog" WHERE "companyId"=? AND success=false AND "createdAt">=DATE_TRUNC('month',NOW())) AS "failedAiCallCount",
           (SELECT COALESCE(SUM("chargedCredits"),0) FROM "UsageRecord" WHERE "companyId"=? AND success=true AND "createdAt">=DATE_TRUNC('month',NOW())) AS "creditsUsed",
           (SELECT COUNT(*)::int FROM "ImageGeneration" WHERE "companyId"=? AND "createdAt">=DATE_TRUNC('month',NOW())) AS "imageGenerationCount",
           (SELECT AVG("latencyMs") FROM "AiCallLog" WHERE "companyId"=? AND "createdAt">=DATE_TRUNC('month',NOW()) AND "latencyMs" IS NOT NULL) AS "averageLatencyMs"`,
      )
      .get(companyId, companyId, companyId, companyId, companyId, companyId)) as Row | null;

    const orders = (await db
      .prepare(
        `SELECT
           (SELECT COUNT(*)::int FROM "RechargeOrder" WHERE "companyId"=?) AS "rechargeOrderCount",
           (SELECT COUNT(*)::int FROM "PaymentOrder" WHERE "companyId"=?) AS "paymentOrderCount",
           (SELECT COUNT(*)::int FROM "PaymentOrder" WHERE "companyId"=? AND status='paid') AS "paidOrderCount",
           (SELECT COALESCE(SUM("amountCents"),0) FROM "PaymentOrder" WHERE "companyId"=? AND status='paid' AND "paidAt">=DATE_TRUNC('month',NOW())) AS "currentMonthPaidAmount",
           (SELECT COALESCE(SUM("amountCents"),0) FROM "RechargeOrder" WHERE "companyId"=? AND status='paid' AND "paidAt">=DATE_TRUNC('month',NOW())) AS "currentMonthRechargeAmount"`,
      )
      .get(companyId, companyId, companyId, companyId, companyId)) as Row | null;

    return NextResponse.json({
      company: {
        id: sanitizeText(company.id),
        name: sanitizeText(company.name) || '未命名企业',
        industry: nullableText(company.industry),
        description: nullableText(company.description),
        plan: nullableText(company.plan),
        createdAt: company.createdAt || null,
      },
      owners,
      memberships,
      membershipStats: {
        totalMemberCount: memberships.length,
        activeMemberCount: memberships.filter((membership) => membership.status === 'active').length,
        ownerCount: owners.length,
      },
      subscription: subscription
        ? {
            id: sanitizeText(subscription.id),
            status: sanitizeText(subscription.status),
            planId: sanitizeText(subscription.planId),
            planCode: sanitizeText(subscription.planCode),
            planName: sanitizeText(subscription.planName),
            currentPeriodStart: subscription.currentPeriodStart || null,
            currentPeriodEnd: subscription.currentPeriodEnd || null,
            createdAt: subscription.createdAt || null,
          }
        : null,
      credits: {
        account: creditAccount
          ? {
              id: sanitizeText(creditAccount.id),
              totalBalance: toSafeNumber(creditAccount.totalBalance),
              packageBalance: toSafeNumber(creditAccount.packageBalance),
              purchasedBalance: toSafeNumber(creditAccount.purchasedBalance),
              bonusBalance: toSafeNumber(creditAccount.bonusBalance),
              updatedAt: creditAccount.updatedAt || null,
            }
          : null,
        currentMonthGranted: toSafeNumber(creditSummary?.currentMonthGranted),
        currentMonthUsed: toSafeNumber(creditSummary?.currentMonthUsed),
        ledgerCount: toSafeNumber(creditSummary?.ledgerCount),
      },
      resources: {
        knowledgeSpaceCount: toSafeNumber(resources?.knowledgeSpaceCount),
        documentCount: toSafeNumber(resources?.documentCount),
        skillCount: toSafeNumber(resources?.skillCount),
        totalDocumentSize: toSafeNumber(resources?.totalDocumentSize),
        currentMonthUploadedDocumentCount: toSafeNumber(resources?.currentMonthUploadedDocumentCount),
      },
      usage: {
        aiCallCount: toSafeNumber(usage?.aiCallCount),
        successfulAiCallCount: toSafeNumber(usage?.successfulAiCallCount),
        failedAiCallCount: toSafeNumber(usage?.failedAiCallCount),
        creditsUsed: toSafeNumber(usage?.creditsUsed),
        imageGenerationCount: toSafeNumber(usage?.imageGenerationCount),
        averageLatencyMs: toSafeNumber(usage?.averageLatencyMs),
      },
      orders: {
        rechargeOrderCount: toSafeNumber(orders?.rechargeOrderCount),
        paymentOrderCount: toSafeNumber(orders?.paymentOrderCount),
        paidOrderCount: toSafeNumber(orders?.paidOrderCount),
        currentMonthPaidAmount: toSafeNumber(orders?.currentMonthPaidAmount),
        currentMonthRechargeAmount: toSafeNumber(orders?.currentMonthRechargeAmount),
      },
    });
  } catch {
    return NextResponse.json({ error: '加载企业详情失败，请稍后重试' }, { status: 500 });
  }
}
