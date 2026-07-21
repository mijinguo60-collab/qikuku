import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit-log';
import { getActiveMembership } from '@/lib/membership';
import { isAdminRole } from '@/lib/roles';

export async function PUT(request: NextRequest) {
  try {
    const current = await getActiveMembership(request);
    if (!current) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (!isAdminRole(current.membership.role)) {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }
    const body = await request.json();
    const { name, industry, description, contactName, contactPhone } = body;
    const db = getDb();
    await db.prepare(`UPDATE "Company" SET name=COALESCE(?,name), industry=COALESCE(?,industry), description=COALESCE(?,description), "contactName"=COALESCE(?,"contactName"), "contactPhone"=COALESCE(?,"contactPhone") WHERE id=?`)
      .run(name||null, industry||null, description||null, contactName||null, contactPhone||null, current.membership.companyId);
    await writeAuditLog({ companyId: current.membership.companyId, userId: current.session.id, action: 'company_updated', detail: JSON.stringify({ name, industry }) });
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: '企业信息更新失败，请稍后重试' }, { status: 500 }); }
}
