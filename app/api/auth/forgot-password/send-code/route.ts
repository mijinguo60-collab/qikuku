import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { requestPasswordResetCode } from '@/lib/sms/auth-service';
import { generateVerificationCode, normalizeMainlandPhone } from '@/lib/sms/security';

const inputSchema = z.object({ phone: z.string().max(32) });
function metadata(request: NextRequest) { return { ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || 'unknown', userAgent: request.headers.get('user-agent') || 'unknown' }; }

export async function POST(request: NextRequest) {
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  const phoneE164 = input.success ? normalizeMainlandPhone(input.data.phone) : null;
  if (!phoneE164) return NextResponse.json({ error: '请输入有效的中国大陆手机号' }, { status: 400 });
  const user = await getDb().prepare(`SELECT id FROM "User" WHERE "phoneE164"=? OR phone=? OR phone=? LIMIT 1`).get(phoneE164, phoneE164.slice(3), phoneE164);
  if (!user) return NextResponse.json({ error: '该手机号尚未注册' }, { status: 404 });
  const result = await requestPasswordResetCode(phoneE164, metadata(request), generateVerificationCode());
  if (result.ok) return NextResponse.json({ success: true, message: '验证码已发送' });
  if (result.kind === 'configuration') return NextResponse.json({ error: '短信服务尚未配置' }, { status: 503 });
  if (result.kind === 'rate_limited') return NextResponse.json({ error: '请求过于频繁，请稍后再试' }, { status: 429 });
  return NextResponse.json({ error: '短信暂时发送失败' }, { status: 502 });
}
