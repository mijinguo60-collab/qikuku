import { NextResponse } from 'next/server';

/** Daily SMS login is permanently disabled. Registration validates REGISTER codes atomically in /api/auth/register. */
export async function POST() {
  return NextResponse.json({ error: '短信验证码仅用于注册、重置密码和安全验证' }, { status: 410 });
}
