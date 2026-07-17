import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestSession } from '@/lib/session';
import { requirePlatformAdmin } from '@/lib/platform-admin/auth';

const MAX_PAGE = 100_000;
const MAX_SEARCH_LENGTH = 100;
const MAX_FILTER_LENGTH = 100;
const MAX_ENUM_FILTER_LENGTH = 50;
const PAGE_SIZES = [20, 50, 100] as const;

const SORT_COLUMNS = {
  createdAt: 'subscription."createdAt"',
  updatedAt: 'subscription."updatedAt"',
  startedAt: 'subscription."startedAt"',
  expiresAt: 'subscription."expiresAt"',
  status: 'subscription.status',
  billingCycle: 'subscription."billingCycle"',
} as const;

type SortBy = keyof typeof SORT_COLUMNS;
type Row = Record<string, unknown>;

function normalizePage(value: string | null) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? Math.min(page, MAX_PAGE) : 1;
}

function normalizePageSize(value: string | null) {
  const pageSize = Number(value);
  return PAGE_SIZES.includes(pageSize as (typeof PAGE_SIZES)[number])
    ? (pageSize as (typeof PAGE_SIZES)[number])
    : 20;
}

function normalizeSearch(value: string | null) {
  return (value || '').trim().slice(0, MAX_SEARCH_LENGTH);
}

function normalizeExactFilter(value: string | null, maxLength: number) {
  const normalized = (value || '').trim();
  return normalized.length <= maxLength ? normalized : null;
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

function toSafeBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getRequestSession(request);
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const platformAdmin = await requirePlatformAdmin(request);
    if (!platformAdmin) return NextResponse.json({ error: '无平台运营权限' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const page = normalizePage(searchParams.get('page'));
    const pageSize = normalizePageSize(searchParams.get('pageSize'));
    const search = normalizeSearch(searchParams.get('search'));
    const companyId = normalizeExactFilter(searchParams.get('companyId'), MAX_FILTER_LENGTH);
    const planId = normalizeExactFilter(searchParams.get('planId'), MAX_FILTER_LENGTH);
    const status = normalizeExactFilter(searchParams.get('status'), MAX_ENUM_FILTER_LENGTH);
    const billingCycle = normalizeExactFilter(searchParams.get('billingCycle'), MAX_ENUM_FILTER_LENGTH);
    const rawSortBy = (searchParams.get('sortBy') || 'createdAt').trim();
    const rawSortOrder = (searchParams.get('sortOrder') || 'desc').trim();

    if (
      companyId === null ||
      planId === null ||
      status === null ||
      billingCycle === null ||
      !isSortBy(rawSortBy) ||
      (rawSortOrder !== 'asc' && rawSortOrder !== 'desc')
    ) {
      return NextResponse.json({ error: '订阅查询参数无效' }, { status: 400 });
    }

    const db = getDb();
    const statusRows = (await db
      .prepare('SELECT DISTINCT status FROM "Subscription" ORDER BY status ASC LIMIT 100')
      .all()) as Row[];
    const billingCycleRows = (await db
      .prepare('SELECT DISTINCT "billingCycle" FROM "Subscription" ORDER BY "billingCycle" ASC LIMIT 100')
      .all()) as Row[];
    const planRows = (await db
      .prepare(
        `SELECT id,code,name,enabled
         FROM "Plan"
         ORDER BY name ASC,id ASC
         LIMIT 100`,
      )
      .all()) as Row[];

    const statuses = statusRows.map((row) => sanitizeText(row.status)).filter(Boolean);
    const billingCycles = billingCycleRows
      .map((row) => sanitizeText(row.billingCycle))
      .filter(Boolean);

    if ((status && !statuses.includes(status)) || (billingCycle && !billingCycles.includes(billingCycle))) {
      return NextResponse.json({ error: '订阅查询参数无效' }, { status: 400 });
    }

    const clauses: string[] = [];
    const values: unknown[] = [];
    if (search) {
      const partial = `%${search}%`;
      clauses.push(`(
        subscription.id ILIKE ?
        OR subscription."companyId" ILIKE ?
        OR company.name ILIKE ?
        OR subscription."planId" ILIKE ?
        OR plan.code ILIKE ?
        OR plan.name ILIKE ?
      )`);
      values.push(partial, partial, partial, partial, partial, partial);
    }
    if (companyId) {
      clauses.push('subscription."companyId"=?');
      values.push(companyId);
    }
    if (planId) {
      clauses.push('subscription."planId"=?');
      values.push(planId);
    }
    if (status) {
      clauses.push('subscription.status=?');
      values.push(status);
    }
    if (billingCycle) {
      clauses.push('subscription."billingCycle"=?');
      values.push(billingCycle);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const joins = `
      LEFT JOIN "Company" company ON company.id=subscription."companyId"
      LEFT JOIN "Plan" plan ON plan.id=subscription."planId"`;
    const totalRow = (await db
      .prepare(`SELECT COUNT(*)::int AS total FROM "Subscription" subscription ${joins} ${where}`)
      .get(...values)) as Row | null;
    const orderColumn = SORT_COLUMNS[rawSortBy];
    const orderDirection = rawSortOrder === 'asc' ? 'ASC' : 'DESC';
    const subscriptionRows = (await db
      .prepare(
        `SELECT
          subscription.id AS "subscriptionId",
          subscription.status,
          subscription."billingCycle",
          subscription."startedAt",
          subscription."expiresAt",
          subscription."createdAt",
          subscription."updatedAt",
          company.id AS "companyId",
          company.name AS "companyName",
          company.industry AS "companyIndustry",
          plan.id AS "planId",
          plan.code AS "planCode",
          plan.name AS "planName",
          plan."monthlyPrice" AS "monthlyPrice",
          plan."yearlyPrice" AS "yearlyPrice",
          plan."monthlyCredits" AS "monthlyCredits",
          plan.enabled AS "planEnabled"
        FROM "Subscription" subscription
        ${joins}
        ${where}
        ORDER BY ${orderColumn} ${orderDirection},subscription.id ${orderDirection}
        LIMIT ? OFFSET ?`,
      )
      .all(...values, pageSize, (page - 1) * pageSize)) as Row[];

    const total = toSafeNumber(totalRow?.total) || 0;
    return NextResponse.json({
      items: subscriptionRows.map((row) => {
        const companyIdValue = sanitizeText(row.companyId);
        const planIdValue = sanitizeText(row.planId);
        return {
          subscriptionId: sanitizeText(row.subscriptionId),
          status: sanitizeText(row.status),
          billingCycle: sanitizeText(row.billingCycle),
          startedAt: row.startedAt || null,
          expiresAt: row.expiresAt || null,
          createdAt: row.createdAt || null,
          updatedAt: row.updatedAt || null,
          company: companyIdValue
            ? {
                id: companyIdValue,
                name: sanitizeText(row.companyName),
                industry: sanitizeText(row.companyIndustry) || null,
              }
            : null,
          plan: planIdValue
            ? {
                id: planIdValue,
                code: sanitizeText(row.planCode),
                name: sanitizeText(row.planName),
                monthlyPrice: toSafeNumber(row.monthlyPrice),
                yearlyPrice: toSafeNumber(row.yearlyPrice),
                monthlyCredits: toSafeNumber(row.monthlyCredits),
                enabled: toSafeBoolean(row.planEnabled),
              }
            : null,
          dataIntegrityWarning: !companyIdValue || !planIdValue,
        };
      }),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      currency: 'CNY',
      priceUnit: 'cents',
      filters: {
        statuses,
        billingCycles,
        plans: planRows.map((row) => ({
          id: sanitizeText(row.id),
          code: sanitizeText(row.code),
          name: sanitizeText(row.name),
          enabled: toSafeBoolean(row.enabled),
        })),
      },
    });
  } catch {
    return NextResponse.json({ error: '企业订阅列表加载失败，请稍后重试' }, { status: 500 });
  }
}
