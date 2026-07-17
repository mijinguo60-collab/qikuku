import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestSession } from '@/lib/session';
import { requirePlatformAdmin } from '@/lib/platform-admin/auth';

const MAX_FILTER_LENGTH = 100;
const MAX_FILTER_OPTIONS = 100;
const MAX_AUDIT_DEPTH = 12;
const MAX_AUDIT_ARRAY_ITEMS = 100;
const MAX_AUDIT_OBJECT_KEYS = 100;
const MAX_AUDIT_STRING_LENGTH = 5000;

const SENSITIVE_KEY_PARTS = [
  'password',
  'token',
  'cookie',
  'authorization',
  'secret',
  'apikey',
  'openid',
  'unionid',
  'phone',
  'email',
  'identifier',
  'databaseurl',
  'sessionsecret',
] as const;

type DateBound = { value: string | null; invalid: boolean };

function positiveParam(value: string | null, fallback: number, maximum: number) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, maximum) : fallback;
}

function limitedText(value: string | null) {
  return (value || '').trim().slice(0, MAX_FILTER_LENGTH);
}

function parseDateBound(value: string | null, endOfDay: boolean): DateBound {
  const input = (value || '').trim();
  if (!input) return { value: null, invalid: false };
  if (input.length > 50) return { value: null, invalid: true };

  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const date = new Date(`${input}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input) {
      return { value: null, invalid: true };
    }
    if (endOfDay) date.setUTCHours(23, 59, 59, 999);
    return { value: date.toISOString(), invalid: false };
  }

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return { value: null, invalid: true };
  return { value: date.toISOString(), invalid: false };
}

function normalizeKey(key: string) {
  return key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function isSensitiveKey(key: string) {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

function maskEmail(value: string | null | undefined) {
  if (!value) return '未绑定';
  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) return '***';
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}

function sanitizeString(value: string) {
  const withoutControls = value.replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, MAX_AUDIT_STRING_LENGTH);
  return withoutControls
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [已隐藏]')
    .replace(/(?:cookie|set-cookie)\s*[:=]\s*[^;\r\n]+/gi, '[已隐藏 Cookie]')
    .replace(/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'<>]+/gi, '[已隐藏数据库地址]')
    .replace(
      /\b(?:api[ _-]?key|secret(?:id|key)?|access[ _-]?token|refresh[ _-]?token|session[ _-]?secret|database[ _-]?url)\s*[:=]\s*[^\s,;]+/gi,
      (matched) => `${matched.split(/[:=]/, 1)[0]}=[已隐藏]`,
    )
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|AKID[A-Za-z0-9]{16,})\b/g, '[已隐藏密钥]')
    .replace(/\b\d{11}\b/g, '[已隐藏手机号]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (email) => maskEmail(email));
}

function sanitizeAuditValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (depth >= MAX_AUDIT_DEPTH) return '[内容层级过深，已隐藏]';
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_AUDIT_ARRAY_ITEMS).map((item) => sanitizeAuditValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value).slice(0, MAX_AUDIT_OBJECT_KEYS)) {
      if (!isSensitiveKey(key)) sanitized[key] = sanitizeAuditValue(nestedValue, depth + 1);
    }
    return sanitized;
  }
  return '[不支持的审计数据类型]';
}

function parseAndSanitizeAuditData(value: unknown) {
  if (typeof value !== 'string') return sanitizeAuditValue(value);
  try {
    return sanitizeAuditValue(JSON.parse(value) as unknown);
  } catch {
    return sanitizeString(value);
  }
}

function maskIp(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ip = value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  const ipv4 = ip.split('.');
  if (
    ipv4.length === 4 &&
    ipv4.every((segment) => /^\d{1,3}$/.test(segment) && Number(segment) <= 255)
  ) {
    return `${ipv4[0]}.${ipv4[1]}.${ipv4[2]}.*`;
  }
  if (ip.includes(':')) {
    const segments = ip.split(':').filter(Boolean).slice(0, 2);
    return segments.length ? `${segments.join(':')}:*` : '*';
  }
  return '*';
}

function safeUserAgent(value: unknown) {
  return typeof value === 'string' && value.trim()
    ? sanitizeString(value).slice(0, 300)
    : null;
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
    const action = limitedText(searchParams.get('action'));
    const targetType = limitedText(searchParams.get('targetType'));
    const adminUserId = limitedText(searchParams.get('adminUserId'));
    const companyId = limitedText(searchParams.get('companyId'));
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';
    const dateFrom = parseDateBound(searchParams.get('dateFrom'), false);
    const dateTo = parseDateBound(searchParams.get('dateTo'), true);

    if (dateFrom.invalid || dateTo.invalid) {
      return NextResponse.json({ error: '日期参数格式错误' }, { status: 400 });
    }
    if (dateFrom.value && dateTo.value && dateFrom.value > dateTo.value) {
      return NextResponse.json({ error: '开始日期不能晚于结束日期' }, { status: 400 });
    }

    const clauses: string[] = [];
    const values: unknown[] = [];
    if (search) {
      const partial = `%${search}%`;
      clauses.push(`(
        a.id ILIKE ? OR a.action ILIKE ? OR a."targetType" ILIKE ? OR
        a."targetId" ILIKE ? OR a."companyId" ILIKE ? OR a.reason ILIKE ? OR
        a."adminUserId" ILIKE ? OR u.name ILIKE ? OR u.email ILIKE ?
      )`);
      values.push(partial, partial, partial, partial, partial, partial, partial, partial, partial);
    }
    if (action) {
      clauses.push('a.action=?');
      values.push(action);
    }
    if (targetType) {
      clauses.push('a."targetType"=?');
      values.push(targetType);
    }
    if (adminUserId) {
      clauses.push('a."adminUserId"=?');
      values.push(adminUserId);
    }
    if (companyId) {
      clauses.push('a."companyId"=?');
      values.push(companyId);
    }
    if (dateFrom.value) {
      clauses.push('a."createdAt">=?');
      values.push(dateFrom.value);
    }
    if (dateTo.value) {
      clauses.push('a."createdAt"<=?');
      values.push(dateTo.value);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const db = getDb();
    const totalRow = await db
      .prepare(`SELECT COUNT(*)::int AS total FROM "PlatformAuditLog" a LEFT JOIN "User" u ON u.id=a."adminUserId" ${where}`)
      .get(...values);
    const rows = await db
      .prepare(
        `SELECT a.id,a.action,a."targetType",a."targetId",a."companyId",a.reason,a."beforeData",a."afterData",a.ip,a."userAgent",a."createdAt",u.id AS "adminId",u.name AS "adminName",u.email AS "adminEmail",u.role AS "adminRole" FROM "PlatformAuditLog" a LEFT JOIN "User" u ON u.id=a."adminUserId" ${where} ORDER BY a."createdAt" ${sortOrder === 'asc' ? 'ASC' : 'DESC'},a.id ${sortOrder === 'asc' ? 'ASC' : 'DESC'} LIMIT ? OFFSET ?`,
      )
      .all(...values, pageSize, (page - 1) * pageSize);
    const actionRows = await db
      .prepare(`SELECT DISTINCT action FROM "PlatformAuditLog" WHERE action IS NOT NULL AND action<>'' ORDER BY action ASC LIMIT ?`)
      .all(MAX_FILTER_OPTIONS);
    const targetTypeRows = await db
      .prepare(`SELECT DISTINCT "targetType" FROM "PlatformAuditLog" WHERE "targetType" IS NOT NULL AND "targetType"<>'' ORDER BY "targetType" ASC LIMIT ?`)
      .all(MAX_FILTER_OPTIONS);

    const total = Number(totalRow?.total || 0);
    return NextResponse.json({
      items: rows.map((row: any) => ({
        id: sanitizeString(String(row.id)),
        action: sanitizeString(String(row.action)),
        targetType: sanitizeString(String(row.targetType)),
        targetId: row.targetId ? sanitizeString(String(row.targetId)) : null,
        companyId: row.companyId ? sanitizeString(String(row.companyId)) : null,
        reason: row.reason ? sanitizeString(String(row.reason)) : null,
        beforeData: parseAndSanitizeAuditData(row.beforeData),
        afterData: parseAndSanitizeAuditData(row.afterData),
        ip: maskIp(row.ip),
        userAgent: safeUserAgent(row.userAgent),
        createdAt: row.createdAt,
        admin: {
          id: row.adminId ? sanitizeString(String(row.adminId)) : null,
          name: row.adminName ? sanitizeString(String(row.adminName)) : '未知管理员',
          maskedEmail: maskEmail(row.adminEmail),
          role: row.adminRole ? sanitizeString(String(row.adminRole)) : null,
        },
      })),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      filters: {
        actions: actionRows
          .map((row: { action?: unknown }) => row.action)
          .filter((value: unknown): value is string => typeof value === 'string')
          .map(sanitizeString),
        targetTypes: targetTypeRows
          .map((row: { targetType?: unknown }) => row.targetType)
          .filter((value: unknown): value is string => typeof value === 'string')
          .map(sanitizeString),
      },
    });
  } catch {
    return NextResponse.json({ error: '加载平台审计日志失败，请稍后重试' }, { status: 500 });
  }
}
