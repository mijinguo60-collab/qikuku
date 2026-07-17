import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit-log';
import { getRequestSession } from '@/lib/session';

function isAdmin(role: string) { return ['super_admin','admin','owner'].includes(role); }

export async function GET(request: NextRequest) {
  const u = await getRequestSession(request);
  if (!u) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isAdmin(u.role)) return NextResponse.json({ error: '无权限' }, { status: 403 });
  const db = getDb();
  const rows = await db.prepare(`SELECT * FROM "Lead" ORDER BY "createdAt" DESC LIMIT 100`).all();
  return NextResponse.json({ leads: rows });
}

export async function PATCH(request: NextRequest) {
  const u = await getRequestSession(request);
  if (!u) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isAdmin(u.role)) return NextResponse.json({ error: '无权限' }, { status: 403 });
  const { leadId, status } = await request.json();
  const validStatuses = ['new','contacted','demo_scheduled','closed'];
  if (!validStatuses.includes(status)) return NextResponse.json({ error: '无效状态' }, { status: 400 });
  const db = getDb();
  await db.prepare(`UPDATE "Lead" SET status=?, "updatedAt"=? WHERE id=?`).run(status, new Date().toISOString(), leadId);
  await writeAuditLog({ companyId: u.companyId, userId: u.id, action: 'lead_status_updated', targetId: leadId, detail: JSON.stringify({ status }) });
  return NextResponse.json({ success: true });
}
