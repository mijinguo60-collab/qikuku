import { NextRequest, NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { createServerSession, setSessionCookie } from '@/lib/session';

const isMainlandPhone = (phone: string) => /^1[3-9]\d{9}$/.test(phone);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!isMainlandPhone(phone) || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: '手机号或验证码格式错误' }, { status: 400 });
    }

    const result = await getDb().transactionAsync(async (tx: any) => {
      const verification = await tx.prepare(`SELECT id,"codeHash","attemptCount",("expiresAt">NOW()) AS "notExpired" FROM "SmsVerification" WHERE phone=? AND "verifiedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE`).get(phone);
      if (!verification) return { error: '请先获取验证码' };
      if (!verification.notExpired) return { error: '验证码已过期' };
      if (Number(verification.attemptCount) >= 5) return { error: '验证码已锁定' };

      if (!(await compare(code, verification.codeHash))) {
        const nextAttempts = Number(verification.attemptCount) + 1;
        await tx.prepare(`UPDATE "SmsVerification" SET "attemptCount"=? WHERE id=?`).run(nextAttempts, verification.id);
        return { error: nextAttempts >= 5 ? '验证码错误次数过多，请重新获取' : '验证码错误' };
      }

      const consumed = await tx.prepare(`UPDATE "SmsVerification" SET "verifiedAt"=NOW() WHERE id=? AND "verifiedAt" IS NULL`).run(verification.id);
      if (consumed.changes !== 1) return { error: '验证码已使用或不存在' };

      let user = await tx.prepare(`SELECT id,name,email,role,"companyId",status FROM "User" WHERE phone=? FOR UPDATE`).get(phone);
      if (user?.status !== undefined && user.status !== 'active') return { error: '该账号已被停用' };
      if (!user) {
        const userId = uuid();
        await tx.prepare(`INSERT INTO "User" (id,name,phone,"phoneVerifiedAt",status,role,"companyId","createdAt","updatedAt","lastLoginAt") VALUES (?,? ,?,NOW(),'active','member',NULL,NOW(),NOW(),NOW())`).run(userId, '企库库用户', phone);
        user = { id: userId, name: '企库库用户', email: null, role: 'member', companyId: null, status: 'active' };
      } else {
        await tx.prepare(`UPDATE "User" SET "phoneVerifiedAt"=NOW(),"lastLoginAt"=NOW(),"updatedAt"=NOW() WHERE id=?`).run(user.id);
      }

      const identity = await tx.prepare(`SELECT "userId" FROM "AuthIdentity" WHERE provider='phone' AND "providerUserId"=? FOR UPDATE`).get(phone);
      if (identity && identity.userId !== user.id) return { error: '手机号身份绑定异常，请联系管理员' };
      if (!identity) {
        await tx.prepare(`INSERT INTO "AuthIdentity" (id,"userId",provider,"providerUserId","createdAt","updatedAt") VALUES (?,?, 'phone', ?,NOW(),NOW())`).run(uuid(), user.id, phone);
      }
      return { user: { id: user.id, name: user.name, email: user.email || '', role: user.role, companyId: user.companyId || '' } };
    });

    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
    const { token, activeCompanyId } = await createServerSession(result.user);
    const response = NextResponse.json({ success: true, verified: true, redirect: activeCompanyId ? '/dashboard' : '/onboarding' });
    setSessionCookie(response, token);
    return response;
  } catch (error: any) {
    console.error('[SMS VERIFY]', { type: typeof error, message: error?.message || String(error), code: error?.code || null });
    return NextResponse.json({ error: '验证码验证失败，请稍后重试' }, { status: 500 });
  }
}
