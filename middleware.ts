import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionRouteAccess } from '@/lib/session-edge';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('qikuku_user')?.value;
  const canAccess = await verifySessionRouteAccess(token, pathname);

  if (pathname.startsWith('/dashboard') || pathname.startsWith('/api/ai') || pathname.startsWith('/api/billing') || pathname.startsWith('/api/admin')) {
    if (!canAccess) {
      if (pathname.startsWith('/api/')) {
        const response = NextResponse.json({ error: '未登录' }, { status: 401 });
        response.cookies.set('qikuku_user', '', { path: '/', maxAge: 0 });
        return response;
      }
      const u = new URL('/auth/login', request.url);
      u.searchParams.set('redirect', pathname);
      const response = NextResponse.redirect(u);
      response.cookies.set('qikuku_user', '', { path: '/', maxAge: 0 });
      return response;
    }
  }

  if (pathname.startsWith('/auth') && canAccess) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/auth/:path*', '/api/ai/:path*', '/api/billing/:path*', '/api/admin/:path*'],
};
