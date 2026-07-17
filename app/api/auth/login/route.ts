import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit-log';
import { createServerSession, setSessionCookie } from '@/lib/session';
import { assertUserCanAuthenticate, UserAuthenticationError } from '@/lib/auth/user-status';
import { getDb } from '@/lib/db';
import { passwordLoginAuditDetail } from '@/lib/audit/sanitize';

export async function POST(request: NextRequest) {
  try {
    const { email: rawEmail, password } = await request.json();
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    if (!email || typeof password !== 'string' || !password) return NextResponse.json({ error: '请输入邮箱和密码' }, { status: 400 });

    const user = await authenticateUser(email, password);

    if (!user) {
      await writeAuditLog({
        companyId: '', userId: undefined,
        action: 'login_failed',
        detail: passwordLoginAuditDetail(email, 'invalid_credentials'),
      }).catch(() => {});
      return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 });
    }

    try {
      assertUserCanAuthenticate(user);
    } catch (error) {
      const message = error instanceof UserAuthenticationError ? error.message : '账号当前不可用';
      await writeAuditLog({
        companyId: user.companyId, userId: user.id,
        action: 'login_failed',
        detail: passwordLoginAuditDetail(email, user.status === 'disabled' ? 'disabled' : 'unavailable'),
      }).catch(() => {});
      return NextResponse.json({ error: message }, { status: 403 });
    }

    let token: string;
    try {
      ({ token } = await createServerSession(user));
      const now = new Date().toISOString();
      const update = await getDb()
        .prepare(`UPDATE "User" SET "lastLoginAt"=?,"updatedAt"=? WHERE id=? AND status='active'`)
        .run(now, now, user.id);
      if (!update?.changes) {
        await getDb().prepare(`DELETE FROM "UserSession" WHERE token=?`).run(token);
        throw new Error('account_unavailable');
      }
    } catch {
      await writeAuditLog({
        companyId: user.companyId,
        userId: user.id,
        action: 'login_failed',
        detail: passwordLoginAuditDetail(email, 'session_unavailable'),
      }).catch(() => {});
      return NextResponse.json({ error: '登录服务暂不可用，请稍后重试' }, { status: 500 });
    }

    await writeAuditLog({
      companyId: user.companyId,
      userId: user.id,
      action: 'login_success',
      detail: passwordLoginAuditDetail(email, 'success'),
    }).catch(() => {});

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        status: user.status,
        companyId: user.companyId,
        companyName: user.companyName,
      },
    });
    setSessionCookie(response, token);
    return response;
  } catch (e: any) {
    console.error('[LOGIN]', e.message);
    return NextResponse.json({ error: '登录服务暂不可用，请稍后重试' }, { status: 500 });
  }
}
