import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getActiveMembership } from '@/lib/membership';
import { isAdminRole } from '@/lib/roles';
import { maskPhone } from '@/lib/sms/security';

async function requireTeamOwner(request: NextRequest) {
  const current = await getActiveMembership(request);
  if (!current) return { response: NextResponse.json({ error: '未登录' }, { status: 401 }) };
  if (!isAdminRole(current.membership.role)) return { response: NextResponse.json({ error: '无权限' }, { status: 403 }) };
  return { current };
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireTeamOwner(request);
    if ('response' in access) return access.response;
    const db = getDb();
    const rows = await db.prepare(`SELECT m.id as "membershipId",u.id as "userId",u.name,u."phoneE164",u.phone,m.role as "membershipRole",m.status as "membershipStatus",u.status as "userStatus",m."joinedAt" FROM "CompanyMembership" m JOIN "User" u ON u.id=m."userId" WHERE m."companyId"=? ORDER BY m."joinedAt" ASC,m."createdAt" ASC`).all(access.current.membership.companyId);
    return NextResponse.json({ members: rows.map((row: any) => {
      const phone = typeof row.phoneE164 === 'string' ? row.phoneE164 : typeof row.phone === 'string' ? row.phone : '';
      const maskedPhone = /^\+861[3-9]\d{9}$/.test(phone) ? maskPhone(phone) : /^1[3-9]\d{9}$/.test(phone) ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : '未绑定';
      return { membershipId: row.membershipId, userId: row.userId, name: row.name, maskedPhone, membershipRole: row.membershipRole, membershipStatus: row.membershipStatus, userStatus: row.userStatus, joinedAt: row.joinedAt };
    }) });
  } catch { return NextResponse.json({ error: '成员列表加载失败，请稍后重试' }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireTeamOwner(request);
    if ('response' in access) return access.response;
    return NextResponse.json({ error: '成员邀请功能即将开放' }, { status: 410 });
  } catch { return NextResponse.json({ error: '成员操作失败，请稍后重试' }, { status: 500 }); }
}

export async function PATCH(request: NextRequest) {
  try {
    const access = await requireTeamOwner(request);
    if ('response' in access) return access.response;
    return NextResponse.json({ error: '成员邀请功能即将开放' }, { status: 410 });
  } catch { return NextResponse.json({ error: '成员操作失败，请稍后重试' }, { status: 500 }); }
}
