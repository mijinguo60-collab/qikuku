import { NextRequest, NextResponse } from 'next/server';
import { getRequestSession } from '@/lib/session';
import { getDb } from '@/lib/db';

const maskPhone = (value: string | null) => value ? `${value.slice(0, 3)}****${value.slice(-4)}` : '未绑定';
const maskEmail = (value: string | null) => {
  if (!value) return '未绑定';
  const [local, domain] = value.split('@');
  return `${local.slice(0, Math.min(2, local.length))}***@${domain || ''}`;
};
const positive = (value: string | null, fallback: number, max: number) => {
  const number = Number(value); return Number.isInteger(number) && number > 0 ? Math.min(number, max) : fallback;
};

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const db = getDb();
  const current = await db.prepare(`SELECT role FROM "User" WHERE id=?`).get(session.id);
  if (current?.role !== 'platform_super_admin') return NextResponse.json({ error: '无平台运营权限' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const page = positive(searchParams.get('page'), 1, 100000);
  const pageSize = positive(searchParams.get('pageSize'), 20, 100);
  const search = (searchParams.get('search') || '').trim().slice(0, 100);
  const where = search ? `WHERE (u.id ILIKE ? OR u.name ILIKE ? OR u.email ILIKE ? OR RIGHT(COALESCE(u.phone,''),4)=?)` : '';
  const searchParamsSql = search ? [`%${search}%`, `%${search}%`, `%${search}%`, search.replace(/\D/g, '').slice(-4)] : [];
  try {
    const totalRow = await db.prepare(`SELECT COUNT(*)::int AS total FROM "User" u ${where}`).get(...searchParamsSql);
    const rows = await db.prepare(`SELECT u.id,u.name,u.phone,u.email,u.status,u.role,u."lastLoginAt",u."createdAt",COALESCE(string_agg(DISTINCT i.provider,','),'') AS providers,COUNT(DISTINCT m."companyId")::int AS "companyCount",COUNT(DISTINCT s.id) FILTER (WHERE s."expiresAt">NOW())::int AS "activeSessionCount" FROM "User" u LEFT JOIN "AuthIdentity" i ON i."userId"=u.id LEFT JOIN "CompanyMembership" m ON m."userId"=u.id LEFT JOIN "UserSession" s ON s."userId"=u.id ${where} GROUP BY u.id ORDER BY u."createdAt" DESC LIMIT ? OFFSET ?`).all(...searchParamsSql, pageSize, (page - 1) * pageSize);
    const total = Number(totalRow?.total || 0);
    return NextResponse.json({ items: rows.map((row: any) => ({ id: row.id, name: row.name, maskedPhone: maskPhone(row.phone), maskedEmail: maskEmail(row.email), status: row.status, role: row.role, identityProviders: row.providers ? row.providers.split(',') : [], companyCount: Number(row.companyCount || 0), activeSessionCount: Number(row.activeSessionCount || 0), lastLoginAt: row.lastLoginAt || null, createdAt: row.createdAt })), page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  } catch {
    return NextResponse.json({ error: '加载用户列表失败' }, { status: 500 });
  }
}
