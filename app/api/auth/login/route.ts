import { NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: '请输入邮箱和密码' }, { status: 400 });
    }
    const user = await authenticateUser(email, password);
    if (!user) {
      return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 });
    }
    const response = NextResponse.json({ success: true, user });
    response.cookies.set('qikuku_user', JSON.stringify(user), {
      httpOnly: true, secure: false, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60, path: '/',
    });
    return response;
  } catch (e: any) {
    console.error('[LOGIN] Server error:', e.message, e.stack);
    return NextResponse.json({ error: '服务器错误: ' + (e.message || '未知错误') }, { status: 500 });
  }
}
