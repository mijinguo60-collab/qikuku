import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const userCookie = request.cookies.get('qikuku_user');
    if (!userCookie) return NextResponse.json({ error: '未登录' }, { status: 401 });

    let user: { id: string; companyId: string };
    try {
      user = JSON.parse(userCookie.value);
    } catch {
      return NextResponse.json({ error: '登录状态无效，请重新登录' }, { status: 401 });
    }

    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const enabled = body.enabled !== false;

    if (!name) return NextResponse.json({ error: '请输入空间名称' }, { status: 400 });
    if (name.length > 100) return NextResponse.json({ error: '空间名称不能超过 100 个字符' }, { status: 400 });

    const space = {
      id: uuidv4(),
      companyId: user.companyId,
      name,
      description: description || null,
      isAiEnabled: enabled,
      visibility: 'all',
      createdAt: new Date().toISOString(),
    };

    const db = getDb();
    await db.prepare(
      `INSERT INTO "KnowledgeSpace" (id, "companyId", name, description, "isAiEnabled", visibility, "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      space.id,
      space.companyId,
      space.name,
      space.description,
      space.isAiEnabled,
      space.visibility,
      space.createdAt,
      space.createdAt
    );

    return NextResponse.json({ success: true, space });
  } catch (error: any) {
    console.error('[KNOWLEDGE_SPACES_CREATE]', error.message);
    return NextResponse.json({ error: '创建知识空间失败，请稍后重试' }, { status: 500 });
  }
}
