import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveMembership } from '@/lib/membership';
import { isAdminRole } from '@/lib/roles';
import { createPhoneInvitation, InvitationError, listCompanyInvitations } from '@/lib/invitations/company-invitations';
import { normalizeMainlandPhone } from '@/lib/sms/security';

const inputSchema = z.object({ phone: z.string().max(32) });

async function requireInvitationManager(request: NextRequest) {
  const current = await getActiveMembership(request);
  if (!current) return { response: NextResponse.json({ error: '未登录' }, { status: 401 }) };
  if (!isAdminRole(current.membership.role)) return { response: NextResponse.json({ error: '无权限' }, { status: 403 }) };
  return { current };
}

export async function GET(request: NextRequest) {
  const access = await requireInvitationManager(request);
  if ('response' in access) return access.response;
  try {
    return NextResponse.json(await listCompanyInvitations(access.current.membership.companyId));
  } catch {
    return NextResponse.json({ error: '邀请列表加载失败，请稍后重试' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireInvitationManager(request);
  if ('response' in access) return access.response;
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  const phoneE164 = input.success ? normalizeMainlandPhone(input.data.phone) : null;
  if (!phoneE164) return NextResponse.json({ error: '请输入有效的中国大陆手机号' }, { status: 400 });
  try {
    const invitation = await createPhoneInvitation({ companyId: access.current.membership.companyId, inviterId: access.current.session.id, phoneE164 });
    return NextResponse.json({ invitation: { id: invitation.invitationId, inviteCode: invitation.inviteCode, inviteUrl: invitation.inviteUrl, maskedPhone: invitation.maskedPhone, expiresAt: invitation.expiresAt } }, { status: 201 });
  } catch (error) {
    if (error instanceof InvitationError && error.code === 'member_limit_reached') return NextResponse.json({ error: '成员名额已满' }, { status: 409 });
    return NextResponse.json({ error: '创建邀请失败，请稍后重试' }, { status: 500 });
  }
}
