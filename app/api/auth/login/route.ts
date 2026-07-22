import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateWithPhonePassword } from '@/lib/auth/password';
import { normalizeMainlandPhone } from '@/lib/sms/security';
import { setSessionCookie } from '@/lib/session';

const inputSchema = z.object({ phone: z.string().max(32), password: z.string().min(1).max(128), rememberMe: z.boolean().optional().default(true) });
function metadata(request: NextRequest) { return { ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || 'unknown', userAgent: request.headers.get('user-agent') || 'unknown' }; }

export async function POST(request: NextRequest) {
  const raw = await request.json().catch(() => null);
  if (raw && typeof raw === 'object' && 'email' in raw) return NextResponse.json({ error: '邮箱密码登录已关闭，请使用手机号密码登录' }, { status: 410 });
  const input = inputSchema.safeParse(raw);
  const phoneE164 = input.success ? normalizeMainlandPhone(input.data.phone) : null;
  if (!input.success || !phoneE164) return NextResponse.json({ error: '手机号或密码错误' }, { status: 401 });
  const result = await authenticateWithPhonePassword(phoneE164, input.data.password, metadata(request), undefined, undefined, { rememberMe: input.data.rememberMe, createSession: true });
  if (!result.ok) {
    if (result.kind === 'password_not_set') return NextResponse.json({ error: '请通过短信设置登录密码', code: 'PASSWORD_NOT_SET' }, { status: 409 });
    if (result.kind === 'account_disabled') return NextResponse.json({ error: '账号当前不可用，请联系管理员' }, { status: 403 });
    if (result.kind === 'membership_invalid') return NextResponse.json({ error: '当前账号企业信息异常，请联系管理员' }, { status: 403 });
    if (result.kind === 'account_locked') return NextResponse.json({ error: '登录尝试过多，请稍后再试' }, { status: 429 });
    if (result.kind === 'service_unavailable') return NextResponse.json({ error: '服务暂时不可用，请稍后重试' }, { status: 503 });
    return NextResponse.json({ error: '手机号或密码错误' }, { status: 401 });
  }
  if (!result.session) return NextResponse.json({ error: '服务暂时不可用，请稍后重试' }, { status: 503 });
  const response = NextResponse.json({ success: true, redirect: '/dashboard' });
  setSessionCookie(response, result.session.token, result.session.maxAgeSeconds);
  return response;
}
