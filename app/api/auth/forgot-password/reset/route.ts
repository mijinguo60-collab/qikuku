import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { hashLoginPassword, validateLoginPassword } from '@/lib/auth/password';
import { PhoneRegistrationError, resetPhonePassword } from '@/lib/auth/phone-registration';
import { normalizeMainlandPhone } from '@/lib/sms/security';

const inputSchema = z.object({ phone: z.string().max(32), code: z.string().regex(/^\d{6}$/), password: z.string().min(8).max(128), confirmPassword: z.string().min(8).max(128) })
  .refine((value) => value.password === value.confirmPassword, { path: ['confirmPassword'], message: '两次密码输入不一致' });

export async function POST(request: NextRequest) {
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  const phoneE164 = input.success ? normalizeMainlandPhone(input.data.phone) : null;
  if (!input.success || !phoneE164) return NextResponse.json({ error: input.success ? '请输入有效的中国大陆手机号' : input.error.issues[0]?.message || '重置资料不完整' }, { status: 400 });
  const passwordIssue = validateLoginPassword(input.data.password);
  if (passwordIssue) return NextResponse.json({ error: passwordIssue }, { status: 400 });
  try {
    await resetPhonePassword({ phoneE164, code: input.data.code, passwordHash: await hashLoginPassword(input.data.password) });
    return NextResponse.json({ success: true, message: '密码已设置，请使用新密码登录' });
  } catch (error) {
    if (error instanceof PhoneRegistrationError && error.code === 'invalid_code') return NextResponse.json({ error: '验证码错误或已失效' }, { status: 400 });
    if (error instanceof PhoneRegistrationError && error.code === 'account_unavailable') return NextResponse.json({ error: '账号当前不可用，请联系管理员' }, { status: 403 });
    return NextResponse.json({ error: '服务暂时不可用，请稍后重试' }, { status: 503 });
  }
}
