import { NextRequest, NextResponse } from 'next/server';
import { getActiveMembership } from '@/lib/membership';
import { isAdminRole } from '@/lib/roles';
import { revokeCompanyInvitation } from '@/lib/invitations/company-invitations';

export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  const current = await getActiveMembership(request);
  if (!current) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isAdminRole(current.membership.role)) return NextResponse.json({ error: '无权限' }, { status: 403 });
  const result = await revokeCompanyInvitation({ companyId: current.membership.companyId, invitationId: context.params.id, revokedBy: current.session.id });
  if (!result.ok && result.kind === 'accepted') return NextResponse.json({ error: '已接受的邀请不能撤销' }, { status: 409 });
  if (!result.ok) return NextResponse.json({ error: '邀请不存在或已失效' }, { status: 404 });
  return NextResponse.json({ success: true });
}
