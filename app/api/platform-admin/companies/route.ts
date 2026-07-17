import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestSession } from '@/lib/session';
import { requirePlatformAdmin } from '@/lib/platform-admin/auth';

const MAX_FILTER_LENGTH = 100;
const MAX_STATUS_LENGTH = 50;

const SORT_COLUMNS = {
  createdAt: 'c."createdAt"',
  name: 'c.name',
} as const;

type SortBy = keyof typeof SORT_COLUMNS | 'updatedAt';

function positiveParam(value: string | null, fallback: number, maximum: number) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, maximum) : fallback;
}

function limitedText(value: string | null) {
  return (value || '').trim().slice(0, MAX_FILTER_LENGTH);
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

function toSafeNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function isSortBy(value: string): value is SortBy {
  return value === 'createdAt' || value === 'updatedAt' || value === 'name';
}

export async function GET(request: NextRequest) {
  try {
    const session = await getRequestSession(request);
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const platformAdmin = await requirePlatformAdmin(request);
    if (!platformAdmin) {
      return NextResponse.json({ error: '无平台运营权限' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = positiveParam(searchParams.get('page'), 1, 100000);
    const pageSize = positiveParam(searchParams.get('pageSize'), 20, 100);
    const search = limitedText(searchParams.get('search'));
    const rawStatus = (searchParams.get('status') || '').trim();
    const rawSortBy = (searchParams.get('sortBy') || 'createdAt').trim();
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';

    // Company 当前没有 status 或 updatedAt 字段；不能为了筛选或排序猜测字段。
    if (rawStatus.length > MAX_STATUS_LENGTH) {
      return NextResponse.json({ error: '企业状态筛选参数过长' }, { status: 400 });
    }
    if (rawStatus) {
      return NextResponse.json({ error: '企业状态字段尚未配置，暂不支持状态筛选' }, { status: 400 });
    }
    if (!isSortBy(rawSortBy)) {
      return NextResponse.json({ error: 'sortBy 参数错误' }, { status: 400 });
    }
    if (rawSortBy === 'updatedAt') {
      return NextResponse.json({ error: '企业更新时间字段尚未配置，无法按更新时间排序' }, { status: 400 });
    }

    const clauses: string[] = [];
    const values: unknown[] = [];
    if (search) {
      const partial = `%${search}%`;
      const phoneSuffix = search.replace(/\D/g, '').slice(-4);
      const ownerSearchClauses = [
        'ownerSearch.id ILIKE ?',
        'ownerSearch.name ILIKE ?',
        'ownerSearch.email ILIKE ?',
      ];
      const ownerSearchValues: unknown[] = [partial, partial, partial];
      if (phoneSuffix.length === 4) {
        ownerSearchClauses.push(`RIGHT(COALESCE(ownerSearch.phone,''),4)=?`);
        ownerSearchValues.push(phoneSuffix);
      }

      clauses.push(`(
        c.id ILIKE ? OR c.name ILIKE ? OR EXISTS (
          SELECT 1
          FROM "CompanyMembership" ownerMembershipSearch
          JOIN "User" ownerSearch ON ownerSearch.id=ownerMembershipSearch."userId"
          WHERE ownerMembershipSearch."companyId"=c.id
            AND ownerMembershipSearch.role='owner'
            AND ownerMembershipSearch.status='active'
            AND (${ownerSearchClauses.join(' OR ')})
        )
      )`);
      values.push(partial, partial, ...ownerSearchValues);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const orderColumn = SORT_COLUMNS[rawSortBy];
    const orderDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';
    const db = getDb();
    const totalRow = await db
      .prepare(`SELECT COUNT(*)::int AS total FROM "Company" c ${where}`)
      .get(...values);
    const rows = await db
      .prepare(
        `SELECT
          c.id,
          c.name,
          c."createdAt",
          owner.id AS "ownerId",
          owner.name AS "ownerName",
          owner.phone AS "ownerPhone",
          owner.email AS "ownerEmail",
          (SELECT COUNT(*)::int FROM "CompanyMembership" membership WHERE membership."companyId"=c.id) AS "memberCount",
          (SELECT COUNT(*)::int FROM "CompanyMembership" membership WHERE membership."companyId"=c.id AND membership.status='active') AS "activeMemberCount",
          (SELECT COUNT(*)::int FROM "KnowledgeSpace" knowledgeSpace WHERE knowledgeSpace."companyId"=c.id) AS "knowledgeSpaceCount",
          (SELECT COUNT(*)::int FROM "Document" document WHERE document."companyId"=c.id) AS "documentCount",
          (SELECT COUNT(*)::int FROM "Skill" skill WHERE skill."companyId"=c.id) AS "skillCount",
          subscription.id AS "subscriptionId",
          subscription.status AS "subscriptionStatus",
          subscription."planCode" AS "subscriptionPlanCode",
          subscription."planName" AS "subscriptionPlanName",
          subscription."currentPeriodEnd" AS "subscriptionCurrentPeriodEnd",
          creditAccount."totalBalance" AS "creditBalance",
          (SELECT COUNT(*)::int FROM "AiCallLog" aiCall WHERE aiCall."companyId"=c.id AND aiCall."createdAt">=DATE_TRUNC('month',NOW())) AS "currentMonthAiCalls",
          (SELECT COALESCE(SUM("chargedCredits"),0) FROM "UsageRecord" usageRecord WHERE usageRecord."companyId"=c.id AND usageRecord.success=true AND usageRecord."createdAt">=DATE_TRUNC('month',NOW())) AS "currentMonthCreditsUsed"
        FROM "Company" c
        LEFT JOIN LATERAL (
          SELECT ownerUser.id,ownerUser.name,ownerUser.phone,ownerUser.email
          FROM "CompanyMembership" ownerMembership
          JOIN "User" ownerUser ON ownerUser.id=ownerMembership."userId"
          WHERE ownerMembership."companyId"=c.id
            AND ownerMembership.role='owner'
            AND ownerMembership.status='active'
          ORDER BY ownerMembership."createdAt" ASC,ownerMembership.id ASC
          LIMIT 1
        ) owner ON true
        LEFT JOIN LATERAL (
          SELECT subscriptionRow.id,subscriptionRow.status,plan.code AS "planCode",plan.name AS "planName",subscriptionRow."expiresAt" AS "currentPeriodEnd"
          FROM "Subscription" subscriptionRow
          JOIN "Plan" plan ON plan.id=subscriptionRow."planId"
          WHERE subscriptionRow."companyId"=c.id
            AND subscriptionRow.status IN ('trialing','active','past_due')
          ORDER BY subscriptionRow."createdAt" DESC,subscriptionRow.id DESC
          LIMIT 1
        ) subscription ON true
        LEFT JOIN "CreditAccount" creditAccount ON creditAccount."companyId"=c.id
        ${where}
        ORDER BY ${orderColumn} ${orderDirection},c.id ${orderDirection}
        LIMIT ? OFFSET ?`,
      )
      .all(...values, pageSize, (page - 1) * pageSize);

    const total = Number(totalRow?.total || 0);
    return NextResponse.json({
      items: rows.map((row: any) => ({
        id: sanitizeText(row.id),
        name: sanitizeText(row.name),
        status: null,
        createdAt: row.createdAt || null,
        updatedAt: null,
        owner: row.ownerId
          ? {
              id: sanitizeText(row.ownerId),
              name: sanitizeText(row.ownerName) || '未设置姓名',
              maskedPhone: maskPhone(row.ownerPhone),
              maskedEmail: maskEmail(row.ownerEmail),
            }
          : null,
        memberCount: toSafeNumber(row.memberCount),
        activeMemberCount: toSafeNumber(row.activeMemberCount),
        knowledgeSpaceCount: toSafeNumber(row.knowledgeSpaceCount),
        documentCount: toSafeNumber(row.documentCount),
        skillCount: toSafeNumber(row.skillCount),
        subscription: row.subscriptionId
          ? {
              id: sanitizeText(row.subscriptionId),
              status: sanitizeText(row.subscriptionStatus),
              planCode: sanitizeText(row.subscriptionPlanCode),
              planName: sanitizeText(row.subscriptionPlanName),
              currentPeriodEnd: row.subscriptionCurrentPeriodEnd || null,
            }
          : null,
        creditBalance: row.creditBalance === null || row.creditBalance === undefined
          ? null
          : toSafeNumber(row.creditBalance),
        currentMonthAiCalls: toSafeNumber(row.currentMonthAiCalls),
        currentMonthCreditsUsed: toSafeNumber(row.currentMonthCreditsUsed),
      })),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      filters: {
        // Company.status 当前不存在，故不能返回臆造的状态选项。
        statuses: [],
      },
    });
  } catch {
    return NextResponse.json({ error: '加载企业列表失败，请稍后重试' }, { status: 500 });
  }
}
