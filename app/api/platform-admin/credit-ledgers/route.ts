import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestSession } from '@/lib/session';
import { requirePlatformAdmin } from '@/lib/platform-admin/auth';

const PAGE_SIZES = [20, 50, 100] as const;
const MAX_PAGE = 100_000;
const MAX_SEARCH_LENGTH = 100;
const MAX_FILTER_LENGTH = 100;

const SORT_COLUMNS = {
  createdAt: 'ledger."createdAt"',
  amount: 'ledger.amount',
  balanceBefore: 'ledger."balanceBefore"',
  balanceAfter: 'ledger."balanceAfter"',
  type: 'ledger.type',
  featureType: 'ledger."featureType"',
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

function normalizeExactFilter(value: string | null) {
  const normalized = (value || '').trim();
  return normalized.length <= MAX_FILTER_LENGTH ? normalized : null;
}

function parseInteger(value: string | null) {
  if (value === null) return { valid: true, value: undefined as number | undefined };
  const normalized = value.trim();
  if (!/^-?\d+$/.test(normalized)) return { valid: false, value: undefined as number | undefined };
  const number = Number(normalized);
  return { valid: Number.isSafeInteger(number), value: number };
}

function parseIsoDate(value: string | null) {
  if (value === null || !value.trim()) return { valid: true, value: undefined as string | undefined };
  const normalized = value.trim();
  const isIsoDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized);
  const date = isIsoDateTime ? new Date(normalized) : null;
  return date && !Number.isNaN(date.getTime())
    ? { valid: true, value: date.toISOString() }
    : { valid: false, value: undefined as string | undefined };
}

function isSortBy(value: string): value is SortBy {
  return Object.prototype.hasOwnProperty.call(SORT_COLUMNS, value);
}

function maskEmail(value: unknown) {
  if (typeof value !== 'string' || !value) return '未绑定';
  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) return '***';
  return `${value.slice(0, Math.min(2, at))}***@${value.slice(at + 1)}`;
}

function maskPhone(value: unknown) {
  if (typeof value !== 'string' || !value) return '未绑定';
  return value.length >= 7 ? `${value.slice(0, 3)}****${value.slice(-4)}` : '***';
}

function sanitizeText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [已隐藏]')
    .replace(/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'<>]+/gi, '[已隐藏数据库地址]')
    .replace(/\b1\d{10}\b/g, '[已隐藏手机号]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (email) => maskEmail(email))
    .slice(0, 500);
}

function toSafeNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) ? number : null;
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
    const companyId = normalizeExactFilter(searchParams.get('companyId'));
    const userId = normalizeExactFilter(searchParams.get('userId'));
    const grantId = normalizeExactFilter(searchParams.get('grantId'));
    const type = normalizeExactFilter(searchParams.get('type'));
    const featureType = normalizeExactFilter(searchParams.get('featureType'));
    const minAmount = parseInteger(searchParams.get('minAmount'));
    const maxAmount = parseInteger(searchParams.get('maxAmount'));
    const createdFrom = parseIsoDate(searchParams.get('createdFrom'));
    const createdTo = parseIsoDate(searchParams.get('createdTo'));
    const rawSortBy = (searchParams.get('sortBy') || 'createdAt').trim();
    const rawSortOrder = (searchParams.get('sortOrder') || 'desc').trim();

    if (
      companyId === null ||
      userId === null ||
      grantId === null ||
      type === null ||
      featureType === null ||
      !minAmount.valid ||
      !maxAmount.valid ||
      !createdFrom.valid ||
      !createdTo.valid ||
      (minAmount.value !== undefined && maxAmount.value !== undefined && minAmount.value > maxAmount.value) ||
      (createdFrom.value !== undefined && createdTo.value !== undefined && createdFrom.value >= createdTo.value) ||
      !isSortBy(rawSortBy) ||
      (rawSortOrder !== 'asc' && rawSortOrder !== 'desc')
    ) {
      return NextResponse.json({ error: '积分流水查询参数无效' }, { status: 400 });
    }

    const db = getDb();
    const [typeRows, featureTypeRows, grantSourceTypeRows] = await Promise.all([
      db.prepare('SELECT DISTINCT type FROM "CreditLedger" ORDER BY type ASC LIMIT 100').all() as Promise<Row[]>,
      db.prepare('SELECT DISTINCT "featureType" FROM "CreditLedger" WHERE "featureType" IS NOT NULL AND "featureType"<>\'\' ORDER BY "featureType" ASC LIMIT 100').all() as Promise<Row[]>,
      db.prepare('SELECT DISTINCT "sourceType" FROM "CreditGrant" WHERE "sourceType" IS NOT NULL AND "sourceType"<>\'\' ORDER BY "sourceType" ASC LIMIT 100').all() as Promise<Row[]>,
    ]);
    const types = typeRows.map((row) => sanitizeText(row.type)).filter(Boolean);
    const featureTypes = featureTypeRows.map((row) => sanitizeText(row.featureType)).filter(Boolean);
    const grantSourceTypes = grantSourceTypeRows.map((row) => sanitizeText(row.sourceType)).filter(Boolean);

    if ((type && !types.includes(type)) || (featureType && !featureTypes.includes(featureType))) {
      return NextResponse.json({ error: '积分流水查询参数无效' }, { status: 400 });
    }

    const clauses: string[] = [];
    const values: unknown[] = [];
    if (search) {
      const partial = `%${search}%`;
      clauses.push(`(
        ledger.id ILIKE ?
        OR ledger."companyId" ILIKE ?
        OR company.name ILIKE ?
        OR ledger."userId" ILIKE ?
        OR ledgerUser.name ILIKE ?
        OR ledger."grantId" ILIKE ?
        OR ledger."featureType" ILIKE ?
      )`);
      values.push(partial, partial, partial, partial, partial, partial, partial);
    }
    if (companyId) {
      clauses.push('ledger."companyId"=?');
      values.push(companyId);
    }
    if (userId) {
      clauses.push('ledger."userId"=?');
      values.push(userId);
    }
    if (grantId) {
      clauses.push('ledger."grantId"=?');
      values.push(grantId);
    }
    if (type) {
      clauses.push('ledger.type=?');
      values.push(type);
    }
    if (featureType) {
      clauses.push('ledger."featureType"=?');
      values.push(featureType);
    }
    if (minAmount.value !== undefined) {
      clauses.push('ledger.amount>=?');
      values.push(minAmount.value);
    }
    if (maxAmount.value !== undefined) {
      clauses.push('ledger.amount<=?');
      values.push(maxAmount.value);
    }
    if (createdFrom.value !== undefined) {
      clauses.push('ledger."createdAt">=?');
      values.push(createdFrom.value);
    }
    if (createdTo.value !== undefined) {
      clauses.push('ledger."createdAt"<?');
      values.push(createdTo.value);
    }

    const joins = `
      LEFT JOIN "Company" company ON company.id=ledger."companyId"
      LEFT JOIN "User" ledgerUser ON ledgerUser.id=ledger."userId"
      LEFT JOIN "CreditGrant" creditGrant ON creditGrant.id=ledger."grantId"`;
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const summaryRow = (await db
      .prepare(
        `SELECT
          COUNT(*)::int AS "ledgerCount",
          COUNT(*) FILTER (WHERE ledger.type='credit' AND ledger.amount>0)::int AS "creditCount",
          COUNT(*) FILTER (WHERE ledger.type='debit' AND ledger.amount<0)::int AS "debitCount",
          COALESCE(SUM(CASE WHEN ledger.type='credit' AND ledger.amount>0 THEN ledger.amount ELSE 0 END),0) AS "creditsGranted",
          COALESCE(SUM(CASE WHEN ledger.type='debit' AND ledger.amount<0 THEN -ledger.amount ELSE 0 END),0) AS "creditsUsed",
          COALESCE(SUM(ledger.amount),0) AS "netBalanceChange",
          COUNT(*) FILTER (WHERE
            (ledger.type='credit' AND ledger.amount<=0)
            OR (ledger.type='debit' AND ledger.amount>=0)
            OR ledger.type NOT IN ('credit','debit')
            OR ledger."balanceAfter"<>ledger."balanceBefore"+ledger.amount
            OR company.id IS NULL
            OR (ledger."userId" IS NOT NULL AND ledgerUser.id IS NULL)
            OR (ledger."grantId" IS NOT NULL AND creditGrant.id IS NULL)
          )::int AS "integrityWarningCount"
         FROM "CreditLedger" ledger
         ${joins}
         ${where}`,
      )
      .get(...values)) as Row | null;

    const orderColumn = SORT_COLUMNS[rawSortBy];
    const orderDirection = rawSortOrder === 'asc' ? 'ASC' : 'DESC';
    const rows = (await db
      .prepare(
        `SELECT
          ledger.id AS "ledgerId",
          ledger.type,
          ledger."featureType",
          ledger.amount,
          ledger."balanceBefore",
          ledger."balanceAfter",
          ledger."createdAt",
          company.id AS "companyId",
          company.name AS "companyName",
          company.industry AS "companyIndustry",
          ledger."userId" AS "ledgerUserId",
          ledgerUser.id AS "userId",
          ledgerUser.name AS "userName",
          ledgerUser.email AS "userEmail",
          ledgerUser.phone AS "userPhone",
          ledgerUser.status AS "userStatus",
          ledger."grantId" AS "ledgerGrantId",
          creditGrant.id AS "grantId",
          creditGrant."sourceType" AS "grantSourceType",
          creditGrant."originalAmount" AS "grantOriginalAmount",
          creditGrant."remainingAmount" AS "grantRemainingAmount",
          creditGrant."expiresAt" AS "grantExpiresAt"
         FROM "CreditLedger" ledger
         ${joins}
         ${where}
         ORDER BY ${orderColumn} ${orderDirection},ledger.id ${orderDirection}
         LIMIT ? OFFSET ?`,
      )
      .all(...values, pageSize, (page - 1) * pageSize)) as Row[];

    const total = toSafeNumber(summaryRow?.ledgerCount) || 0;
    return NextResponse.json({
      items: rows.map((row) => {
        const companyIdValue = sanitizeText(row.companyId);
        const ledgerUserId = sanitizeText(row.ledgerUserId);
        const userIdValue = sanitizeText(row.userId);
        const ledgerGrantId = sanitizeText(row.ledgerGrantId);
        const grantIdValue = sanitizeText(row.grantId);
        const typeValue = sanitizeText(row.type);
        const amount = toSafeNumber(row.amount);
        const balanceBefore = toSafeNumber(row.balanceBefore);
        const balanceAfter = toSafeNumber(row.balanceAfter);
        const signMismatch = (typeValue === 'credit' && (amount === null || amount <= 0)) || (typeValue === 'debit' && (amount === null || amount >= 0));
        const balanceEquationMismatch = amount === null || balanceBefore === null || balanceAfter === null || balanceAfter !== balanceBefore + amount;
        const companyMissing = !companyIdValue;
        const userMissing = Boolean(ledgerUserId) && !userIdValue;
        const grantMissing = Boolean(ledgerGrantId) && !grantIdValue;
        const unknownType = typeValue !== 'credit' && typeValue !== 'debit';
        const hasWarning = signMismatch || balanceEquationMismatch || companyMissing || userMissing || grantMissing || unknownType;

        return {
          ledgerId: sanitizeText(row.ledgerId),
          type: typeValue,
          featureType: sanitizeText(row.featureType) || null,
          amount,
          balanceBefore,
          balanceAfter,
          createdAt: row.createdAt || null,
          company: companyIdValue
            ? {
                id: companyIdValue,
                name: sanitizeText(row.companyName) || '未命名企业',
                industry: sanitizeText(row.companyIndustry) || null,
              }
            : null,
          user: userIdValue
            ? {
                id: userIdValue,
                name: sanitizeText(row.userName) || '未设置姓名',
                maskedEmail: maskEmail(row.userEmail),
                maskedPhone: maskPhone(row.userPhone),
                accountStatus: sanitizeText(row.userStatus) || null,
              }
            : null,
          grant: grantIdValue
            ? {
                id: grantIdValue,
                sourceType: sanitizeText(row.grantSourceType),
                originalAmount: toSafeNumber(row.grantOriginalAmount),
                remainingAmount: toSafeNumber(row.grantRemainingAmount),
                expiresAt: row.grantExpiresAt || null,
              }
            : null,
          integrity: {
            hasWarning,
            signMismatch,
            balanceEquationMismatch,
            companyMissing,
            userMissing,
            grantMissing,
          },
        };
      }),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      summary: {
        ledgerCount: total,
        creditCount: toSafeNumber(summaryRow?.creditCount),
        debitCount: toSafeNumber(summaryRow?.debitCount),
        creditsGranted: toSafeNumber(summaryRow?.creditsGranted),
        creditsUsed: toSafeNumber(summaryRow?.creditsUsed),
        netBalanceChange: toSafeNumber(summaryRow?.netBalanceChange),
        integrityWarningCount: toSafeNumber(summaryRow?.integrityWarningCount),
      },
      filters: { types, featureTypes, grantSourceTypes },
      timeRangeSemantics: { createdFromInclusive: true, createdToExclusive: true },
    });
  } catch {
    return NextResponse.json({ error: '积分流水加载失败，请稍后重试' }, { status: 500 });
  }
}
