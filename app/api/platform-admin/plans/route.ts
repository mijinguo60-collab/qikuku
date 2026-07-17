import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestSession } from '@/lib/session';
import { requirePlatformAdmin } from '@/lib/platform-admin/auth';

const MAX_SEARCH_LENGTH = 100;
const PAGE_SIZES = [20, 50, 100] as const;

const SORT_COLUMNS = {
  createdAt: 'plan."createdAt"',
  updatedAt: 'plan."updatedAt"',
  name: 'plan.name',
  code: 'plan.code',
  monthlyPrice: 'plan."monthlyPrice"',
  yearlyPrice: 'plan."yearlyPrice"',
} as const;

type SortBy = keyof typeof SORT_COLUMNS;
type Row = Record<string, unknown>;

function pageParam(value: string | null) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? Math.min(page, 100_000) : 1;
}

function pageSizeParam(value: string | null) {
  const pageSize = Number(value);
  return PAGE_SIZES.includes(pageSize as (typeof PAGE_SIZES)[number])
    ? (pageSize as (typeof PAGE_SIZES)[number])
    : 20;
}

function limitedSearch(value: string | null) {
  return (value || '').trim().slice(0, MAX_SEARCH_LENGTH);
}

function isSortBy(value: string): value is SortBy {
  return Object.prototype.hasOwnProperty.call(SORT_COLUMNS, value);
}

function sanitizeText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .slice(0, 500)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [已隐藏]')
    .replace(/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'<>]+/gi, '[已隐藏数据库地址]');
}

function toSafeNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function countForStatus(
  counts: ReadonlyMap<string, number>,
  availableStatuses: readonly string[],
  status: string,
) {
  return availableStatuses.includes(status) ? counts.get(status) || 0 : null;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getRequestSession(request);
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const platformAdmin = await requirePlatformAdmin(request);
    if (!platformAdmin) return NextResponse.json({ error: '无平台运营权限' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const page = pageParam(searchParams.get('page'));
    const pageSize = pageSizeParam(searchParams.get('pageSize'));
    const search = limitedSearch(searchParams.get('search'));
    const rawSortBy = (searchParams.get('sortBy') || 'createdAt').trim();
    const rawSortOrder = (searchParams.get('sortOrder') || 'asc').trim();

    if (!isSortBy(rawSortBy) || (rawSortOrder !== 'asc' && rawSortOrder !== 'desc')) {
      return NextResponse.json({ error: '套餐查询参数无效' }, { status: 400 });
    }

    const db = getDb();
    const statusRows = (await db
      .prepare('SELECT DISTINCT status FROM "Subscription" ORDER BY status ASC LIMIT 100')
      .all()) as Row[];
    const subscriptionStatuses = statusRows.map((row) => sanitizeText(row.status)).filter(Boolean);

    const clauses: string[] = [];
    const values: unknown[] = [];
    if (search) {
      const partial = `%${search}%`;
      clauses.push('(plan.id ILIKE ? OR plan.code ILIKE ? OR plan.name ILIKE ?)');
      values.push(partial, partial, partial);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const totalRow = (await db
      .prepare(`SELECT COUNT(*)::int AS total FROM "Plan" plan ${where}`)
      .get(...values)) as Row | null;
    const orderColumn = SORT_COLUMNS[rawSortBy];
    const orderDirection = rawSortOrder === 'asc' ? 'ASC' : 'DESC';
    const planRows = (await db
      .prepare(
        `SELECT
          plan.id,
          plan.code,
          plan.name,
          plan."monthlyPrice",
          plan."yearlyPrice",
          plan."monthlyCredits",
          plan."maxMembers",
          plan."maxKnowledgeSpaces",
          plan."storageLimitBytes",
          plan.enabled,
          plan."createdAt",
          plan."updatedAt",
          COUNT(subscription.id)::int AS "subscriptionCount",
          COUNT(DISTINCT subscription."companyId")::int AS "companyCount"
        FROM "Plan" plan
        LEFT JOIN "Subscription" subscription ON subscription."planId"=plan.id
        ${where}
        GROUP BY plan.id
        ORDER BY ${orderColumn} ${orderDirection},plan.id ${orderDirection}
        LIMIT ? OFFSET ?`,
      )
      .all(...values, pageSize, (page - 1) * pageSize)) as Row[];

    const planIds = planRows.map((row) => sanitizeText(row.id)).filter(Boolean);
    const statusCountRows = planIds.length
      ? (await db
        .prepare(
          `SELECT "planId",status,COUNT(*)::int AS count
           FROM "Subscription"
           WHERE "planId" IN (${planIds.map(() => '?').join(',')})
           GROUP BY "planId",status`,
        )
        .all(...planIds)) as Row[]
      : [];
    const statusCountsByPlan = new Map<string, Map<string, number>>();
    for (const row of statusCountRows) {
      const planId = sanitizeText(row.planId);
      const status = sanitizeText(row.status);
      const count = toSafeNumber(row.count);
      if (!planId || !status || count === null) continue;
      const statusCounts = statusCountsByPlan.get(planId) || new Map<string, number>();
      statusCounts.set(status, count);
      statusCountsByPlan.set(planId, statusCounts);
    }

    const total = toSafeNumber(totalRow?.total) || 0;
    return NextResponse.json({
      items: planRows.map((row) => {
        const planId = sanitizeText(row.id);
        const statusCounts = statusCountsByPlan.get(planId) || new Map<string, number>();
        return {
          id: planId,
          code: sanitizeText(row.code),
          name: sanitizeText(row.name),
          monthlyPrice: toSafeNumber(row.monthlyPrice),
          yearlyPrice: toSafeNumber(row.yearlyPrice),
          monthlyCredits: toSafeNumber(row.monthlyCredits),
          maxMembers: toSafeNumber(row.maxMembers),
          maxKnowledgeSpaces: toSafeNumber(row.maxKnowledgeSpaces),
          storageLimitBytes: toSafeNumber(row.storageLimitBytes),
          enabled: typeof row.enabled === 'boolean' ? row.enabled : null,
          createdAt: row.createdAt || null,
          updatedAt: row.updatedAt || null,
          subscriptionCount: toSafeNumber(row.subscriptionCount),
          activeSubscriptionCount: countForStatus(statusCounts, subscriptionStatuses, 'active'),
          trialingSubscriptionCount: countForStatus(statusCounts, subscriptionStatuses, 'trialing'),
          pastDueSubscriptionCount: countForStatus(statusCounts, subscriptionStatuses, 'past_due'),
          canceledSubscriptionCount: countForStatus(statusCounts, subscriptionStatuses, 'canceled'),
          companyCount: toSafeNumber(row.companyCount),
        };
      }),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      currency: 'CNY',
      priceUnit: 'cents',
      filters: { subscriptionStatuses },
    });
  } catch {
    return NextResponse.json({ error: '套餐列表加载失败，请稍后重试' }, { status: 500 });
  }
}
