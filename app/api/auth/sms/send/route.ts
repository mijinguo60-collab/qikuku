import { NextResponse } from 'next/server';

// Replaced by /api/auth/sms/send-code. Keep this path closed so the legacy table
// cannot bypass current hashing, rate limiting, and audit controls.
export async function POST() {
  return NextResponse.json({ error: '短信服务暂不可用' }, { status: 410 });
}
