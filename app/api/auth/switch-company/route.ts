import { NextRequest, NextResponse } from 'next/server';
import { getRequestSession } from '@/lib/session';

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 });
  return NextResponse.json({ error: '当前账号仅支持归属一家企业' }, { status: 410 });
}
