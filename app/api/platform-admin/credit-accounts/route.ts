import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestSession } from '@/lib/session';
import { requirePlatformAdmin } from '@/lib/platform-admin/auth';

const PAGE_SIZES = [20, 50, 100] as const;
const MAX_PAGE = 100_000;
const MAX_SEARCH_LENGTH = 100;
const MAX_COMPANY_ID_LENGTH = 100;

const SORT_COLUMNS = {
  updatedAt: 'account."updatedAt"',
  totalBalance: 'account."totalBalance"',
  packageBalance: 'account."packageBalance"',
  purchasedBalance: 'account."purchasedBalance"',
  bonusBalance: 'account."bonusBalance"',
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

function normalizeCompanyId(value: string | null) {
  const companyId = (value || '').trim();
  return companyId.length <= MAX_COMPANY_ID_LENGTH ? companyId : null;
}

function parseBoolean(value: string | null) {
  if (value === null || value === '') return { valid: true, value: undefined as boolean | undefined };
  if (value === 'true') return { valid: true, value: true };
  if (value === 'false') return { valid: true, value: false };
  return { valid: false, value: undefined as boolean | undefined };
}

function parseInteger(value: string | null) {
  if (value === null) return { valid: true, value: undefined as number | undefined };
  const normalized = value.trim();
  if (!/^-?\d+$/.test(normalized)) return { valid: false, value: undefined as number | undefined };
  const number = Number(normalized);
  return { valid: Number.isSafeInteger(number), value: number };
}

function isSortBy(value: string): value is SortBy {
  return Object.prototype.hasOwnProperty.call(SORT_COLUMNS, value);
}

function sanitizeText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[已隐藏邮箱]')
    .replace(/\b1\d{10}\b/g, '[已隐藏手机号]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [已隐藏]')
    .replace(/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'<>]+/gi, '[已隐藏数据库地址]')
    .slice(0, 500);
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
    const companyId = normalizeCompanyId(searchParams.get('companyId'));
    const hasNegativeBalance = parseBoolean(searchParams.get('hasNegativeBalance'));
    const minBalance = parseInteger(searchParams.get('minBalance'));
    const maxBalance = parseInteger(searchParams.get('maxBalance'));
    const rawSortBy = (searchParams.get('sortBy') || 'updatedAt').trim();
    const rawSortOrder = (searchParams.get('sortOrder') || 'desc').trim();

    if (
      companyId === null ||
      !hasNegativeBalance.valid ||
      !minBalance.valid ||
      !maxBalance.valid ||
      (minBalance.value !== undefined && maxBalance.value !== undefined && minBalance.value > maxBalance.value) ||
      !isSortBy(rawSortBy) ||
      (rawSortOrder !== 'asc' && rawSortOrder !== 'desc')
    ) {
      return NextResponse.json({ error: '积分账户查询参数无效' }, { status: 400 });
    }

    const clauses: string[] = [];
    const values: unknown[] = [];
    if (search) {
      const partial = `%${search}%`;
      clauses.push('(account.id ILIKE ? OR account."companyId" ILIKE ? OR company.name ILIKE ?)');
      values.push(partial, partial, partial);
    }
    if (companyId) {
      clauses.push('account."companyId"=?');
      values.push(companyId);
    }
    if (hasNegativeBalance.value === true) clauses.push('account."totalBalance"<0');
    if (hasNegativeBalance.value === false) clauses.push('account."totalBalance">=0');
    if (minBalance.value !== undefined) {
      clauses.push('account."totalBalance">=?');
      values.push(minBalance.value);
    }
    if (maxBalance.value !== undefined) {
      clauses.push('account."totalBalance"<=?');
      values.push(maxBalance.value);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const db = getDb();
    const summaryRow = (await db
      .prepare(
        `SELECT
          COUNT(*)::int AS "accountCount",
          COALESCE(SUM(account."totalBalance"),0) AS "totalBalance",
          COUNT(*) FILTER (WHERE account."totalBalance"<0)::int AS "negativeAccountCount"
         FROM "CreditAccount" account
         LEFT JOIN "Company" company ON company.id=account."companyId"
         ${where}`,
      )
      .get(...values)) as Row | null;
    const total = toSafeNumber(summaryRow?.accountCount) || 0;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const now = new Date().toISOString();
    const orderColumn = SORT_COLUMNS[rawSortBy];
    const orderDirection = rawSortOrder === 'asc' ? 'ASC' : 'DESC';
    const accountRows = (await db
      .prepare(
        `SELECT
          account.id AS "creditAccountId",
          account."totalBalance",
          account."packageBalance",
          account."purchasedBalance",
          account."bonusBalance",
          account."updatedAt",
          company.id AS "companyId",
          company.name AS "companyName",
          company.industry AS "companyIndustry",
          subscription.id AS "subscriptionId",
          subscription.status AS "subscriptionStatus",
          subscription."billingCycle" AS "subscriptionBillingCycle",
          subscription."expiresAt" AS "subscriptionExpiresAt",
          plan.id AS "planId",
          plan.code AS "planCode",
          plan.name AS "planName",
          plan."monthlyCredits" AS "planMonthlyCredits",
          plan.enabled AS "planEnabled",
          ledger."ledgerCount" AS "ledgerCount",
          ledger."lifetimeCreditsGranted" AS "lifetimeCreditsGranted",
          ledger."lifetimeCreditsUsed" AS "lifetimeCreditsUsed",
          ledger."currentMonthCreditsGranted" AS "currentMonthCreditsGranted",
          ledger."currentMonthCreditsUsed" AS "currentMonthCreditsUsed",
          ledger."lastLedgerAt" AS "lastLedgerAt"
        FROM "CreditAccount" account
        LEFT JOIN "Company" company ON company.id=account."companyId"
        LEFT JOIN LATERAL (
          SELECT id,status,"billingCycle","expiresAt","planId"
          FROM "Subscription"
          WHERE "companyId"=account."companyId"
            AND status IN ('trialing','active','past_due')
          ORDER BY "createdAt" DESC,id DESC
          LIMIT 1
        ) subscription ON TRUE
        LEFT JOIN "Plan" plan ON plan.id=subscription."planId"
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS "ledgerCount",
            COALESCE(SUM(CASE WHEN type='credit' AND amount>0 THEN amount ELSE 0 END),0) AS "lifetimeCreditsGranted",
            COALESCE(SUM(CASE WHEN type='debit' AND amount<0 THEN -amount ELSE 0 END),0) AS "lifetimeCreditsUsed",
            COALESCE(SUM(CASE WHEN type='credit' AND amount>0 AND "createdAt">=? AND "createdAt"<=? THEN amount ELSE 0 END),0) AS "currentMonthCreditsGranted",
            COALESCE(SUM(CASE WHEN type='debit' AND amount<0 AND "createdAt">=? AND "createdAt"<=? THEN -amount ELSE 0 END),0) AS "currentMonthCreditsUsed",
            MAX("createdAt") AS "lastLedgerAt"
          FROM "CreditLedger"
          WHERE "companyId"=account."companyId"
        ) ledger ON TRUE
        ${where}
        ORDER BY ${orderColumn} ${orderDirection},account.id ${orderDirection}
        LIMIT ? OFFSET ?`,
      )
      .all(monthStart, now, monthStart, now, ...values, pageSize, (page - 1) * pageSize)) as Row[];

    return NextResponse.json({
      items: accountRows.map((row) => {
        const companyIdValue = sanitizeText(row.companyId);
        const subscriptionId = sanitizeText(row.subscriptionId);
        const planId = sanitizeText(row.planId);
        return {
          creditAccountId: sanitizeText(row.creditAccountId),
          totalBalance: toSafeNumber(row.totalBalance),
          packageBalance: toSafeNumber(row.packageBalance),
          purchasedBalance: toSafeNumber(row.purchasedBalance),
          bonusBalance: toSafeNumber(row.bonusBalance),
          updatedAt: row.updatedAt || null,
          company: companyIdValue
            ? { id: companyIdValue, name: sanitizeText(row.companyName), industry: sanitizeText(row.companyIndustry) || null }
            : null,
          subscription: subscriptionId
            ? {
                id: subscriptionId,
                status: sanitizeText(row.subscriptionStatus),
                billingCycle: sanitizeText(row.subscriptionBillingCycle),
                expiresAt: row.subscriptionExpiresAt || null,
              }
            : null,
          plan: planId
            ? {
                id: planId,
                code: sanitizeText(row.planCode),
                name: sanitizeText(row.planName),
                monthlyCredits: toSafeNumber(row.planMonthlyCredits),
                enabled: toSafeBoolean(row.planEnabled),
              }
            : null,
          ledgerSummary: {
            ledgerCount: toSafeNumber(row.ledgerCount),
            lifetimeCreditsGranted: toSafeNumber(row.lifetimeCreditsGranted),
            lifetimeCreditsUsed: toSafeNumber(row.lifetimeCreditsUsed),
            currentMonthCreditsGranted: toSafeNumber(row.currentMonthCreditsGranted),
            currentMonthCreditsUsed: toSafeNumber(row.currentMonthCreditsUsed),
            lastLedgerAt: row.lastLedgerAt || null,
          },
          ledgerCalculatedBalance: null,
          balanceMismatch: null,
          dataIntegrityWarning: !companyIdValue || Boolean(subscriptionId && !planId),
        };
      }),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      summary: {
        accountCount: total,
        totalBalance: toSafeNumber(summaryRow?.totalBalance),
        negativeAccountCount: toSafeNumber(summaryRow?.negativeAccountCount),
      },
    });
  } catch {
    return NextResponse.json({ error: '企业积分账户加载失败，请稍后重试' }, { status: 500 });
  }
}
