import { NextRequest, NextResponse } from 'next/server';
import { getLegacySkillList, handleUnifiedChatPost } from '@/lib/ai/unified-chat';

/** Kept for old clients; both handlers use the unified authorization, RAG and billing chain. */
export async function GET(request: NextRequest) {
  try {
    return await getLegacySkillList(request);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '读取管理 Skill 失败，请稍后重试' }, { status: error?.status || 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleUnifiedChatPost(request, { requireSkill: true });
}
