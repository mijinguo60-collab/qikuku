import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { getRequestSession, createServerSession, setSessionCookie } from '@/lib/session';
import { acceptInvitationWithCode } from '@/lib/sms/auth-service';
import { normalizeMainlandPhone } from '@/lib/sms/security';
import { hashLoginPassword, validateLoginPassword } from '@/lib/auth/password';

const optionalText = z.string().trim().min(2).max(80).optional();
const optionalPassword = z.string().min(8).max(128).optional();
const inputSchema = z.object({
  phone: z.string().max(32),
  code: z.string().regex(/^\d{6}$/),
  personalName: optionalText,
  password: optionalPassword,
  confirmPassword: optionalPassword,
}).refine((value) => !value.password || value.password === value.confirmPassword, { path: ['confirmPassword'], message: '两次密码输入不一致' });
function metadata(request: NextRequest) { return { ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || 'unknown', userAgent: request.headers.get('user-agent') || 'unknown' }; }

async function acceptInvitationRequest(request: NextRequest, context: { params: { inviteCode: string } }) {
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: '验证码错误或邀请已失效' }, { status: 400 });
  const phoneE164 = normalizeMainlandPhone(input.data.phone);
  if (!phoneE164) return NextResponse.json({ error: '验证码错误或邀请已失效' }, { status: 400 });
  const session = await getRequestSession(request);
  const db = getDb();
  let phoneUser = await db.prepare(`SELECT id FROM "User" WHERE "phoneE164"=? OR phone=? OR phone=? LIMIT 1`).get(phoneE164, phoneE164.slice(3), phoneE164);
  if (!phoneUser) phoneUser = await db.prepare(`SELECT "userId" AS id FROM "AuthIdentity" WHERE provider='phone' AND ("providerUserId"=? OR "providerUserId"=?) LIMIT 1`).get(phoneE164, phoneE164.slice(3));
  if (session && (!phoneUser || phoneUser.id !== session.id)) return NextResponse.json({ error: '请先退出当前账号后再加入企业' }, { status: 409 });
  let newUserProfile: { personalName: string; passwordHash: string } | undefined;
  if (!phoneUser) {
    if (!input.data.personalName || !input.data.password || !input.data.confirmPassword) return NextResponse.json({ error: '请填写个人姓名并设置登录密码' }, { status: 400 });
    const passwordIssue = validateLoginPassword(input.data.password);
    if (passwordIssue) return NextResponse.json({ error: passwordIssue }, { status: 400 });
    newUserProfile = { personalName: input.data.personalName, passwordHash: await hashLoginPassword(input.data.password) };
  }
  const result = await acceptInvitationWithCode(context.params.inviteCode, phoneE164, input.data.code, metadata(request), {}, newUserProfile);
  if (!result.ok) {
    if (result.kind === 'member_limit_reached') return NextResponse.json({ error: '成员名额已满' }, { status: 409 });
    if (result.kind === 'phone_belongs_to_other_company') return NextResponse.json({ error: '该手机号已属于其他企业' }, { status: 409 });
    if (result.kind === 'membership_conflict') return NextResponse.json({ error: '当前账号企业信息异常，请联系管理员' }, { status: 409 });
    if (result.kind === 'account_unavailable') return NextResponse.json({ error: '当前账号暂不可加入企业' }, { status: 403 });
    if (result.kind === 'profile_required') return NextResponse.json({ error: '请填写个人姓名并设置登录密码' }, { status: 400 });
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
