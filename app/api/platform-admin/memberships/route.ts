import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestSession } from '@/lib/session';
import { requirePlatformAdmin } from '@/lib/platform-admin/auth';

const MAX_TEXT_LENGTH = 100;
const MAX_ROLE_OR_STATUS_LENGTH = 50;

const SORT_COLUMNS = {
  createdAt: 'membership."createdAt"',
  updatedAt: 'membership."updatedAt"',
  role: 'membership.role',
  status: 'membership.status',
} as const;

type SortBy = keyof typeof SORT_COLUMNS;
type Row = Record<string, unknown>;

function positiveParam(value: string | null, fallback: number, maximum: number) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, maximum) : fallback;
}

function sanitizeText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .slice(0, 500)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [已隐藏]')
    .replace(/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'<>]+/gi, '[已隐藏数据库地址]')
    .replace(/\d{11,}/g, '[已隐藏数字]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (email) => maskEmail(email));
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

function toSafeNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function isSortBy(value: string): value is SortBy {
  return Object.prototype.hasOwnProperty.call(SORT_COLUMNS, value);
}

function tooLong(value: string, maximum: number) {
  return value.length > maximum;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getRequestSession(request);
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const platformAdmin = await requirePlatformAdmin(request);
    if (!platformAdmin) return NextResponse.json({ error: '无平台运营权限' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const page = positiveParam(searchParams.get('page'), 1, 100000);
    const pageSize = positiveParam(searchParams.get('pageSize'), 20, 100);
    const search = (searchParams.get('search') || '').trim().slice(0, MAX_TEXT_LENGTH);
    const companyId = (searchParams.get('companyId') || '').trim();
    const userId = (searchParams.get('userId') || '').trim();
    const role = (searchParams.get('role') || '').trim();
    const status = (searchParams.get('status') || '').trim();
    const rawSortBy = (searchParams.get('sortBy') || 'createdAt').trim();
    const rawSortOrder = (searchParams.get('sortOrder') || 'desc').trim();

    if (tooLong(companyId, MAX_TEXT_LENGTH) || tooLong(userId, MAX_TEXT_LENGTH)) {
      return NextResponse.json({ error: '企业或用户 ID 筛选参数过长' }, { status: 400 });
    }
    if (tooLong(role, MAX_ROLE_OR_STATUS_LENGTH) || tooLong(status, MAX_ROLE_OR_STATUS_LENGTH)) {
      return NextResponse.json({ error: '角色或状态筛选参数过长' }, { status: 400 });
    }
    if (!isSortBy(rawSortBy)) {
      return NextResponse.json({ error: 'sortBy 参数错误' }, { status: 400 });
    }
    if (rawSortOrder !== 'asc' && rawSortOrder !== 'desc') {
      return NextResponse.json({ error: 'sortOrder 参数错误' }, { status: 400 });
    }

    const db = getDb();
    const roleRows = (await db
      .prepare(`SELECT DISTINCT role FROM "CompanyMembership" ORDER BY role ASC LIMIT 100`)
      .all()) as Row[];
    const statusRows = (await db
      .prepare(`SELECT DISTINCT status FROM "CompanyMembership" ORDER BY status ASC LIMIT 100`)
      .all()) as Row[];
    const roles = roleRows.map((row) => sanitizeText(row.role)).filter(Boolean);
    const statuses = statusRows.map((row) => sanitizeText(row.status)).filter(Boolean);

    if (role && !roles.includes(role)) {
      return NextResponse.json({ error: 'role 筛选参数错误' }, { status: 400 });
    }
    if (status && !statuses.includes(status)) {
      return NextResponse.json({ error: 'status 筛选参数错误' }, { status: 400 });
    }

    const clauses: string[] = [];
    const values: unknown[] = [];
    if (search) {
      const partial = `%${search}%`;
      const phoneSuffix = search.replace(/\D/g, '').slice(-4);
      const searchClauses = [
        'membership.id ILIKE ?',
        'company.id ILIKE ?',
        'company.name ILIKE ?',
        'member.id ILIKE ?',
        'member.name ILIKE ?',
        'member.email ILIKE ?',
      ];
      const searchValues: unknown[] = [partial, partial, partial, partial, partial, partial];
      if (phoneSuffix.length === 4) {
        searchClauses.push(`RIGHT(COALESCE(member.phone,''),4)=?`);
        searchValues.push(phoneSuffix);
      }
      clauses.push(`(${searchClauses.join(' OR ')})`);
      values.push(...searchValues);
    }
    if (companyId) {
      clauses.push('membership."companyId"=?');
      values.push(companyId);
    }
    if (userId) {
      clauses.push('membership."userId"=?');
      values.push(userId);
    }
    if (role) {
      clauses.push('membership.role=?');
      values.push(role);
    }
    if (status) {
      clauses.push('membership.status=?');
      values.push(status);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const orderColumn = SORT_COLUMNS[rawSortBy];
    const orderDirection = rawSortOrder === 'asc' ? 'ASC' : 'DESC';
    const totalRow = (await db
      .prepare(
        `SELECT COUNT(*)::int AS total
         FROM "CompanyMembership" membership
         JOIN "Company" company ON company.id=membership."companyId"
         JOIN "User" member ON member.id=membership."userId"
         ${where}`,
      )
      .get(...values)) as Row | null;
    const rows = (await db
      .prepare(
        `SELECT
          membership.id AS "membershipId",
          membership.role,
          membership.status,
          membership."createdAt" AS "createdAt",
          membership."updatedAt" AS "updatedAt",
          company.id AS "companyId",
          company.name AS "companyName",
          member.id AS "userId",
          member.name AS "userName",
          member.phone AS "userPhone",
          member.email AS "userEmail",
          member.status AS "accountStatus",
          member."lastLoginAt" AS "lastLoginAt",
          (
            SELECT COUNT(*)::int
            FROM "UserSession" userSession
            WHERE userSession."userId"=membership."userId"
              AND userSession."activeCompanyId"=membership."companyId"
              AND userSession."expiresAt">NOW()
          ) AS "activeCompanySessionCount",
          (
            SELECT COALESCE(SUM(GREATEST(usageRecord."chargedCredits",0)),0)
            FROM "UsageRecord" usageRecord
            WHERE usageRecord."userId"=membership."userId"
              AND usageRecord."companyId"=membership."companyId"
              AND usageRecord.success=true
              AND usageRecord."createdAt">=DATE_TRUNC('month',NOW())
          ) AS "currentMonthCreditsUsed"
        FROM "CompanyMembership" membership
        JOIN "Company" company ON company.id=membership."companyId"
        JOIN "User" member ON member.id=membership."userId"
        ${where}
        ORDER BY ${orderColumn} ${orderDirection},membership.id ${orderDirection}
        LIMIT ? OFFSET ?`,
      )
      .all(...values, pageSize, (page - 1) * pageSize)) as Row[];

    const total = Number(totalRow?.total || 0);
    return NextResponse.json({
      items: rows.map((row) => ({
        membershipId: sanitizeText(row.membershipId),
        role: sanitizeText(row.role),
        status: sanitizeText(row.status),
        createdAt: row.createdAt || null,
        updatedAt: row.updatedAt || null,
        company: {
          id: sanitizeText(row.companyId),
          name: sanitizeText(row.companyName) || '未命名企业',
        },
        user: {
          id: sanitizeText(row.userId),
          name: sanitizeText(row.userName) || '未设置姓名',
          maskedPhone: maskPhone(row.userPhone),
          maskedEmail: maskEmail(row.userEmail),
          accountStatus: sanitizeText(row.accountStatus),
          lastLoginAt: row.lastLoginAt || null,
        },
        activeCompanySessionCount: toSafeNumber(row.activeCompanySessionCount),
        currentMonthCreditsUsed: toSafeNumber(row.currentMonthCreditsUsed),
        // invitedBy 是一个未建立外键关系的可空字段，且当前数据没有可验证关联；不推断邀请人。
        invitation: null,
      })),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      filters: {
        roles,
        statuses,
      },
    });
  } catch {
    return NextResponse.json({ error: '加载企业成员列表失败，请稍后重试' }, { status: 500 });
  }
}
