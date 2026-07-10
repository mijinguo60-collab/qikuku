import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit-log';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) return NextResponse.json({ error: '请输入邮箱和密码' }, { status: 400 });

    const user = await authenticateUser(email, password);

    if (!user) {
      await writeAuditLog({
        companyId: '', userId: undefined,
        action: 'login_failed',
        detail: JSON.stringify({ email, reason: 'invalid_credentials' }),
      }).catch(() => {});
      return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 });
    }

    // Check disabled
    if (user.role === 'disabled') {
      await writeAuditLog({
        companyId: user.companyId, userId: user.id,
        action: 'login_failed',
        detail: JSON.stringify({ email, reason: 'disabled_user' }),
      }).catch(() => {});
      return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 });
    }

    // Log success
    await writeAuditLog({ companyId: user.companyId, userId: user.id, action: 'login_success', detail: email }).catch(() => {});

    const response = NextResponse.json({ success: true, user });
    response.cookies.set('qikuku_user', JSON.stringify(user), {
      httpOnly: true, secure: false, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60, path: '/',
    });
    return response;
  } catch (e: any) {
    console.error('[LOGIN]', e.message);
    return NextResponse.json({ error: '服务器错误: ' + (e.message || '未知错误') }, { status: 500 });
  }
}
