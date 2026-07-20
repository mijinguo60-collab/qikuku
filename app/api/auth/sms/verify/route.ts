import { NextResponse } from 'next/server';

// Replaced by /api/auth/sms/verify-code. Keep this path closed so the legacy table
// cannot bypass current one-time consumption and session integration controls.
export async function POST() {
  return NextResponse.json({ error: '验证码错误或已失效' }, { status: 410 });
}
