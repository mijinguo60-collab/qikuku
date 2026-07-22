import { NextRequest, NextResponse } from 'next/server';
import { deleteOwnedChatSession, getOwnedChatSessionWithMessages, renameOwnedChatSession } from '@/lib/chat-sessions';
import { getRequestSession } from '@/lib/session';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const owner = await getRequestSession(request);
    if (!owner) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const result = await getOwnedChatSessionWithMessages(owner, params.id);
    if (!result) return NextResponse.json({ error: '对话不存在或无权限访问' }, { status: 404 });
    return NextResponse.json(result);
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') console.error('[CHAT_SESSIONS] Read failed', { code: error?.code || 'UNKNOWN' });
    return NextResponse.json({ error: '读取对话失败，请稍后重试' }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const owner = await getRequestSession(request);
    if (!owner) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const body = await request.json();
    if (typeof body.title !== 'string') return NextResponse.json({ error: '请输入对话标题' }, { status: 400 });
    const session = await renameOwnedChatSession(owner, params.id, body.title);
    if (!session) return NextResponse.json({ error: '对话不存在或无权限访问' }, { status: 404 });
    return NextResponse.json({ session });
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') console.error('[CHAT_SESSIONS] Rename failed', { code: error?.code || 'UNKNOWN' });
    return NextResponse.json({ error: '更新对话标题失败，请稍后重试' }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const owner = await getRequestSession(request);
    if (!owner) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (!await deleteOwnedChatSession(owner, params.id)) return NextResponse.json({ error: '对话不存在或无权限访问' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') console.error('[CHAT_SESSIONS] Delete failed', { code: error?.code || 'UNKNOWN' });
    return NextResponse.json({ error: '删除对话失败，请稍后重试' }, { status: 503 });
  }
}
