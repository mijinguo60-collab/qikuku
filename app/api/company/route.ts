import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit-log';

export async function PUT(request: NextRequest) {
  try {
    const userCookie = request.cookies.get('qikuku_user');
    if (!userCookie) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const user = JSON.parse(userCookie.value);
    if (user.role !== 'super_admin' && user.role !== 'admin' && user.role !== 'owner') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }
    const body = await request.json();
    const { name, industry, description, contactName, contactPhone } = body;
    const db = getDb();
    await db.prepare(`UPDATE "Company" SET name=COALESCE(?,name), industry=COALESCE(?,industry), description=COALESCE(?,description), "contactName"=COALESCE(?,"contactName"), "contactPhone"=COALESCE(?,"contactPhone") WHERE id=?`)
      .run(name||null, industry||null, description||null, contactName||null, contactPhone||null, user.companyId);
    await writeAuditLog({ companyId: user.companyId, userId: user.id, action: 'company_updated', detail: JSON.stringify({ name, industry }) });
    return NextResponse.json({ success: true });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
