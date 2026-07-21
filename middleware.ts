import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionRouteAccess } from '@/lib/session-edge';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('qikuku_user')?.value;
  const access = await verifySessionRouteAccess(token, pathname);

  if (pathname.startsWith('/dashboard') || pathname.startsWith('/api/ai') || pathname.startsWith('/api/billing') || pathname.startsWith('/api/admin')) {
    if (!access.tokenValid) {
      if (pathname.startsWith('/api/')) {
        const response = NextResponse.json({ error: '未登录' }, { status: 401 });
        response.cookies.set('qikuku_user', '', { path: '/', maxAge: 0 });
        return response;
      }
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      const response = NextResponse.redirect(loginUrl);
      response.cookies.set('qikuku_user', '', { path: '/', maxAge: 0 });
      return response;
    }

    if (!access.authorizedByRoleClaim) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: '无权限' }, { status: 403 });
      }
      const forbiddenUrl = new URL('/forbidden', request.url);
      forbiddenUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(forbiddenUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/ai/:path*', '/api/billing/:path*', '/api/admin/:path*'],
};
