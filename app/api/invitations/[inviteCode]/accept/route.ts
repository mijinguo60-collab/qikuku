import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { getRequestSession, createServerSession, setSessionCookie } from '@/lib/session';
import { acceptInvitationWithCode } from '@/lib/sms/auth-service';
import { normalizeMainlandPhone } from '@/lib/sms/security';

const inputSchema = z.object({ phone: z.string().max(32), code: z.string().regex(/^\d{6}$/) });
function metadata(request: NextRequest) { return { ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || 'unknown', userAgent: request.headers.get('user-agent') || 'unknown' }; }

async function acceptInvitationRequest(request: NextRequest, context: { params: { inviteCode: string } }) {
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: '验证码错误或邀请已失效' }, { status: 400 });
  const phoneE164 = normalizeMainlandPhone(input.data.phone);
  if (!phoneE164) return NextResponse.json({ error: '验证码错误或邀请已失效' }, { status: 400 });
  const session = await getRequestSession(request);
  const phoneUser = await getDb().prepare(`SELECT id FROM "User" WHERE "phoneE164"=? OR phone=? OR phone=? LIMIT 1`).get(phoneE164, phoneE164.slice(3), phoneE164);
  if (session && (!phoneUser || phoneUser.id !== session.id)) return NextResponse.json({ error: '请先退出当前账号后再加入企业' }, { status: 409 });
  const result = await acceptInvitationWithCode(context.params.inviteCode, phoneE164, input.data.code, metadata(request));
  if (!result.ok) {
    if (result.kind === 'member_limit_reached') return NextResponse.json({ error: '成员名额已满' }, { status: 409 });
    if (result.kind === 'phone_belongs_to_other_company') return NextResponse.json({ error: '该手机号已属于其他企业' }, { status: 409 });
    if (result.kind === 'membership_conflict') return NextResponse.json({ error: '当前账号企业信息异常，请联系管理员' }, { status: 409 });
    if (result.kind === 'account_unavailable') return NextResponse.json({ error: '当前账号暂不可加入企业' }, { status: 403 });
    if (result.kind === 'service_unavailable') return NextResponse.json({ error: '服务暂时不可用，请稍后重试' }, { status: 503 });
    return NextResponse.json({ error: result.kind === 'invalid_code' ? '验证码错误或已失效' : '邀请无效或手机号不匹配' }, { status: 400 });
  }
  try {
    const serverSession = await createServerSession(result.acceptance.user);
    const response = NextResponse.json({ success: true, redirect: '/dashboard' });
    setSessionCookie(response, serverSession.token);
    return response;
  } catch {
    return NextResponse.json({ success: true, redirect: '/auth/login', message: '加入成功，请使用手机号重新登录' });
  }
}

export async function POST(request: NextRequest, context: { params: { inviteCode: string } }) {
  try {
    return await acceptInvitationRequest(request, context);
  } catch {
    return NextResponse.json({ error: '服务暂时不可用，请稍后重试' }, { status: 503 });
  }
}
