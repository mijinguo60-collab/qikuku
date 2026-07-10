import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { canAccessRoute, isAdminRole } from '@/lib/roles';

function getUserFromCookie(request: NextRequest): any | null {
  const cookie = request.cookies.get('qikuku_user');
  if (!cookie) return null;
  try { return JSON.parse(cookie.value); } catch { return null; }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const user = getUserFromCookie(request);

  if (pathname.startsWith('/dashboard') || pathname.startsWith('/api/ai')) {
    if (!user) {
      const u = new URL('/auth/login', request.url);
      u.searchParams.set('redirect', pathname);
      return NextResponse.redirect(u);
    }
    // 统一权限判断
    if (!canAccessRoute(user.role, pathname)) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  if (pathname.startsWith('/auth') && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/auth/:path*', '/api/ai/:path*'],
};
