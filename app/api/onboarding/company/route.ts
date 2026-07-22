import { NextResponse } from 'next/server';

/** Enterprise creation is only allowed by the atomic phone registration flow. */
export async function POST() {
  return NextResponse.json({ error: '旧企业引导已关闭，请通过手机号注册企业' }, { status: 410 });
}
