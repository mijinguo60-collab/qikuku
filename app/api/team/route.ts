import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit-log';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';

const ALLOWED_ROLES = ['manager','staff','sales','content','readonly'];

export async function GET(request: NextRequest) {
  try {
    const uc = request.cookies.get('qikuku_user');
    if (!uc) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const u = JSON.parse(uc.value);
    if (u.role !== 'super_admin' && u.role !== 'admin' && u.role !== 'owner' && u.role !== 'manager') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }
    const db = getDb();
    const rows = await db.prepare(`SELECT id, name, email, role, "createdAt" FROM "User" WHERE "companyId" = ? ORDER BY "createdAt"`).all(u.companyId);
    return NextResponse.json({ members: rows });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const uc = request.cookies.get('qikuku_user');
    if (!uc) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const u = JSON.parse(uc.value);
    if (u.role !== 'super_admin' && u.role !== 'admin' && u.role !== 'owner') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }
    const { name, email, password, role } = await request.json();
    if (!name || !email || !password) return NextResponse.json({ error: '缺少信息' }, { status: 400 });
    const effectiveRole = ALLOWED_ROLES.includes(role) ? role : 'staff';
    const hash = await bcrypt.hash(password, 12);
    const db = getDb();
    await db.prepare(`INSERT INTO "User" (id, name, email, "passwordHash", role, "companyId", "createdAt") VALUES (?,?,?,?,?,?,?)`)
      .run(uuid(), name, email, hash, effectiveRole, u.companyId, new Date().toISOString());
    await writeAuditLog({ companyId: u.companyId, userId: u.id, action: 'member_created', detail: JSON.stringify({ email, role: effectiveRole }) });
    return NextResponse.json({ success: true });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function PATCH(request: NextRequest) {
  try {
    const uc = request.cookies.get('qikuku_user');
    if (!uc) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const u = JSON.parse(uc.value);
    if (u.role !== 'super_admin' && u.role !== 'admin' && u.role !== 'owner') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }
    const { userId, disabled } = await request.json();
    const db = getDb();
    await db.prepare(`UPDATE "User" SET role = CASE WHEN ? THEN 'disabled' ELSE 'staff' END WHERE id = ? AND "companyId" = ?`)
      .run(disabled, userId, u.companyId);
    await writeAuditLog({ companyId: u.companyId, userId: u.id, action: disabled ? 'member_disabled' : 'member_enabled', targetId: userId });
    return NextResponse.json({ success: true });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
