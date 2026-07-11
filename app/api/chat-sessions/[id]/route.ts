import { NextRequest, NextResponse } from 'next/server';
import { deleteOwnedChatSession, getOwnedChatSessionWithMessages, renameOwnedChatSession, SessionOwner } from '@/lib/chat-sessions';

function currentOwner(request: NextRequest): SessionOwner | null {
  const cookie = request.cookies.get('qikuku_user');
  if (!cookie) return null;
  try {
    const user = JSON.parse(cookie.value);
    return user?.id && user?.companyId ? { id: user.id, companyId: user.companyId } : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const owner = currentOwner(request);
  if (!owner) return NextResponse.json({ error: '未登录' }, { status: 401 });
  try {
    const result = await getOwnedChatSessionWithMessages(owner, params.id);
    if (!result) return NextResponse.json({ error: '对话不存在或无权限访问' }, { status: 404 });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[CHAT_SESSIONS] Read failed', error.message);
    return NextResponse.json({ error: '读取对话失败，请稍后重试' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const owner = currentOwner(request);
  if (!owner) return NextResponse.json({ error: '未登录' }, { status: 401 });
  try {
    const body = await request.json();
    if (typeof body.title !== 'string') return NextResponse.json({ error: '请输入对话标题' }, { status: 400 });
    const session = await renameOwnedChatSession(owner, params.id, body.title);
    if (!session) return NextResponse.json({ error: '对话不存在或无权限访问' }, { status: 404 });
    return NextResponse.json({ session });
  } catch (error: any) {
    console.error('[CHAT_SESSIONS] Rename failed', error.message);
    return NextResponse.json({ error: '更新对话标题失败，请稍后重试' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const owner = currentOwner(request);
  if (!owner) return NextResponse.json({ error: '未登录' }, { status: 401 });
  try {
    if (!await deleteOwnedChatSession(owner, params.id)) return NextResponse.json({ error: '对话不存在或无权限访问' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[CHAT_SESSIONS] Delete failed', error.message);
    return NextResponse.json({ error: '删除对话失败，请稍后重试' }, { status: 500 });
  }
}
