import { NextResponse } from 'next/server';
import { createUser } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { name, company, email, password } = await request.json();
    if (!name || !company || !email || !password) {
      return NextResponse.json({ error: '请填写所有字段' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: '密码至少6位' }, { status: 400 });
    }
    const user = await createUser(name, email, password, company);
    if (!user) {
      return NextResponse.json({ error: '邮箱已被注册' }, { status: 409 });
    }
    const response = NextResponse.json({ success: true, user });
    response.cookies.set('qikuku_user', JSON.stringify(user), {
      httpOnly: true, secure: false, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60, path: '/',
    });
    return response;
  } catch {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
