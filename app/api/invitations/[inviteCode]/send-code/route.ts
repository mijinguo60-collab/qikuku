import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendInvitationAcceptCode } from '@/lib/sms/auth-service';
import { generateVerificationCode, normalizeMainlandPhone } from '@/lib/sms/security';

const inputSchema = z.object({ phone: z.string().max(32) });
const genericError = { error: '邀请无效或手机号不匹配' };
function metadata(request: NextRequest) { return { ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || 'unknown', userAgent: request.headers.get('user-agent') || 'unknown' }; }

export async function POST(request: NextRequest, context: { params: { inviteCode: string } }) {
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  const phoneE164 = input.success ? normalizeMainlandPhone(input.data.phone) : null;
  if (!phoneE164) return NextResponse.json(genericError, { status: 400 });
  const result = await sendInvitationAcceptCode(context.params.inviteCode, phoneE164, metadata(request), generateVerificationCode());
  if (result.ok) return NextResponse.json({ success: true, message: '验证码已发送' });
  if (result.kind === 'configuration') return NextResponse.json({ error: '短信服务尚未配置' }, { status: 503 });
  if (result.kind === 'rate_limited') return NextResponse.json({ error: '请求过于频繁，请稍后再试' }, { status: 429 });
  if (result.kind === 'send_failed') return NextResponse.json({ error: '短信暂时发送失败' }, { status: 502 });
  return NextResponse.json(genericError, { status: 400 });
}
