import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySmsLoginCode } from '@/lib/sms/auth-service';
import { normalizeMainlandPhone, SMS_PURPOSE_LOGIN } from '@/lib/sms/security';
import { createServerSession, setSessionCookie } from '@/lib/session';

const inputSchema = z.object({ phone: z.string().max(32), code: z.string().regex(/^\d{6}$/), purpose: z.literal(SMS_PURPOSE_LOGIN) });

function requestMetadata(request: NextRequest) {
  return {
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || 'unknown',
    userAgent: request.headers.get('user-agent') || 'unknown',
  };
}

export async function POST(request: NextRequest) {
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: '验证码错误或已失效' }, { status: 400 });
  const phoneE164 = normalizeMainlandPhone(input.data.phone);
  if (!phoneE164) return NextResponse.json({ error: '验证码错误或已失效' }, { status: 400 });
  const result = await verifySmsLoginCode(phoneE164, input.data.code, requestMetadata(request));
  if (!result.ok) {
    if (result.kind === 'configuration') return NextResponse.json({ error: '短信服务尚未配置' }, { status: 503 });
    return NextResponse.json({ error: result.kind === 'login_rejected' ? '当前手机号暂不可登录' : '验证码错误或已失效' }, { status: 401 });
  }
  try {
    const { token, activeCompanyId } = await createServerSession({
      id: result.user.id, name: result.user.name, email: result.user.email || '', role: result.user.role, companyId: result.user.companyId || '',
    });
    const response = NextResponse.json({ success: true, redirect: activeCompanyId ? '/dashboard' : '/onboarding' });
    setSessionCookie(response, token);
    return response;
  } catch {
    return NextResponse.json({ error: '登录服务暂不可用，请稍后重试' }, { status: 500 });
  }
}
