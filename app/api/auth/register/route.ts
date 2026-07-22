import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { hashLoginPassword, validateLoginPassword } from '@/lib/auth/password';
import { PhoneRegistrationError, registerPhoneEnterprise } from '@/lib/auth/phone-registration';
import { normalizeMainlandPhone } from '@/lib/sms/security';
import { setSessionCookie } from '@/lib/session';

const text = z.string().trim().min(2).max(80).refine((value) => value !== '企业库用户' && value !== '企库库用户', '请填写真实信息');
const inputSchema = z.object({
  phone: z.string().max(32), code: z.string().regex(/^\d{6}$/), companyName: text, personalName: text,
  password: z.string().min(8).max(128), confirmPassword: z.string().min(8).max(128), agreed: z.literal(true), rememberMe: z.boolean().optional().default(true),
}).refine((value) => value.password === value.confirmPassword, { path: ['confirmPassword'], message: '两次密码输入不一致' });

export async function POST(request: NextRequest) {
  const raw = await request.json().catch(() => null);
  if (raw && typeof raw === 'object' && 'email' in raw) return NextResponse.json({ error: '邮箱注册已关闭，请使用手机号注册企业' }, { status: 410 });
  const input = inputSchema.safeParse(raw);
  const phoneE164 = input.success ? normalizeMainlandPhone(input.data.phone) : null;
  if (!input.success || !phoneE164) return NextResponse.json({ error: input.success ? '请输入有效的中国大陆手机号' : input.error.issues[0]?.message || '注册信息不完整' }, { status: 400 });
  const passwordIssue = validateLoginPassword(input.data.password);
  if (passwordIssue) return NextResponse.json({ error: passwordIssue }, { status: 400 });
  try {
    const passwordHash = await hashLoginPassword(input.data.password);
    const result = await registerPhoneEnterprise({ phoneE164, code: input.data.code, companyName: input.data.companyName, personalName: input.data.personalName, passwordHash, rememberMe: input.data.rememberMe });
    const response = NextResponse.json({ success: true, redirect: '/dashboard' }, { status: 201 });
    setSessionCookie(response, result.session.token, result.session.maxAgeSeconds);
    return response;
  } catch (error) {
    if (error instanceof PhoneRegistrationError) {
      if (error.code === 'phone_already_registered') return NextResponse.json({ error: '该手机号已注册，请直接登录', code: 'PHONE_ALREADY_REGISTERED' }, { status: 409 });
      if (error.code === 'invalid_code') return NextResponse.json({ error: '验证码错误或已失效' }, { status: 400 });
    }
    return NextResponse.json({ error: '服务暂时不可用，请稍后重试' }, { status: 503 });
  }
}
