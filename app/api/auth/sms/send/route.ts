import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { randomInt } from 'crypto';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { getSmsProvider } from '@/lib/sms';
import { SmsProviderError } from '@/lib/sms/types';

const isMainlandPhone = (phone: string) => /^1[3-9]\d{9}$/.test(phone);
const maskPhone = (phone: string) => `${phone.slice(0, 3)}****${phone.slice(-4)}`;

function logError(error: unknown): void {
  const value = (error && typeof error === 'object' ? error : {}) as Record<string, unknown>;
  console.error('[SMS SEND]', {
    type: error instanceof Error ? error.constructor.name : typeof error,
    message: value.message || String(error),
    code: value.code || null,
    detail: value.detail || null,
    constraint: value.constraint || null,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    if (!isMainlandPhone(phone)) {
      return NextResponse.json({ error: '请输入有效的中国大陆手机号' }, { status: 400 });
    }

    const db = getDb();
    const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    const recent = await db.prepare(`SELECT id FROM "SmsVerification" WHERE phone=? AND "createdAt">NOW()-INTERVAL '60 seconds' ORDER BY "createdAt" DESC LIMIT 1`).get(phone);
    if (recent) return NextResponse.json({ error: '验证码发送过于频繁，请稍后再试' }, { status: 429 });

    const today = await db.prepare(`SELECT COUNT(*) AS count FROM "SmsVerification" WHERE phone=? AND "createdAt">=DATE_TRUNC('day', NOW())`).get(phone);
    if (Number(today?.count || 0) >= 10) return NextResponse.json({ error: '该手机号今日获取验证码次数已达上限' }, { status: 429 });

    const hourly = await db.prepare(`SELECT COUNT(*) AS count FROM "SmsVerification" WHERE "sendIp"=? AND "createdAt">NOW()-INTERVAL '1 hour'`).get(ip);
    if (Number(hourly?.count || 0) >= 20) return NextResponse.json({ error: '请求过于频繁，请稍后再试' }, { status: 429 });

    const code = String(randomInt(100000, 1000000));
    await getSmsProvider().send({ phone, code });
    const codeHash = await hash(code, 12);

    await db.transactionAsync(async (tx: any) => {
      await tx.prepare(`UPDATE "SmsVerification" SET "verifiedAt"=NOW() WHERE phone=? AND "verifiedAt" IS NULL`).run(phone);
      await tx.prepare(`INSERT INTO "SmsVerification" (id,phone,purpose,"codeHash","expiresAt","attemptCount","sendIp","userAgent","createdAt") VALUES (?,?,?, ?,NOW()+INTERVAL '5 minutes',?,?,?,NOW())`)
        .run(uuid(), phone, 'login', codeHash, 0, ip, request.headers.get('user-agent') || null);
    });

    console.info(`[SMS SEND] accepted phone=${maskPhone(phone)}`);
    return NextResponse.json({ success: true, message: '验证码已发送' });
  } catch (error) {
    logError(error);
    if (error instanceof SmsProviderError) {
      return NextResponse.json({ error: '腾讯云短信发送失败，请稍后重试或联系管理员', code: error.code || undefined }, { status: 502 });
    }
    const message = error instanceof Error ? error.message : '';
    if (message === '手机号验证码服务暂未开通' || message === '腾讯云短信服务配置不完整') {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: '验证码发送失败，请稍后重试' }, { status: 500 });
  }
}
