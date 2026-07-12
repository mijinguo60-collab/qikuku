import { NextRequest, NextResponse } from 'next/server';
import { createChatSession, isChatMode, listOwnedChatSessions, SessionOwner } from '@/lib/chat-sessions';
import { getRequestSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  const owner = await getRequestSession(request);
  if (!owner) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const mode = request.nextUrl.searchParams.get('mode') || 'knowledge';
  if (!isChatMode(mode)) return NextResponse.json({ error: '无效的对话类型' }, { status: 400 });
  try {
    return NextResponse.json({ sessions: await listOwnedChatSessions(owner, mode) });
  } catch (error: any) {
    console.error('[CHAT_SESSIONS] List failed', error.message);
    return NextResponse.json({ error: '获取历史对话失败，请稍后重试' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const owner = await getRequestSession(request);
  if (!owner) return NextResponse.json({ error: '未登录' }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const mode = body.mode || 'knowledge';
    if (!isChatMode(mode)) return NextResponse.json({ error: '无效的对话类型' }, { status: 400 });
    const session = await createChatSession(owner, mode, typeof body.skillId === 'string' ? body.skillId : null);
    return NextResponse.json({ session }, { status: 201 });
  } catch (error: any) {
    console.error('[CHAT_SESSIONS] Create failed', error.message);
    return NextResponse.json({ error: '创建对话失败，请稍后重试' }, { status: 500 });
  }
}
