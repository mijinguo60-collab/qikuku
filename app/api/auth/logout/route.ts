import { NextRequest, NextResponse } from 'next/server';
import { clearRequestSession, clearSessionCookie } from '@/lib/session';

export async function POST(request: NextRequest) {
  await clearRequestSession(request).catch(() => {});
  const response = NextResponse.json({ success: true }, { status: 200 });

  // 清除项目核心 cookie
  const cookieOpts = { path: '/', maxAge: 0, expires: new Date(0), httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const };
  clearSessionCookie(response);

  // 兼容清理常见遗留 cookie
  const legacy = ['session', 'auth-token', 'qikuku_session', 'qikuku-auth', 'user', 'token'];
  for (const name of legacy) {
    response.cookies.set(name, '', cookieOpts);
  }

  console.log('[LOGOUT] logout success');
  return response;
}

export async function GET(request: NextRequest) {
  // 支持 GET 方式（浏览器直接访问）
  return POST(request);
}
