import { NextRequest, NextResponse } from 'next/server';
import { getUnifiedChatBootstrap, handleUnifiedChatPost } from '@/lib/ai/unified-chat';

export async function GET(request: NextRequest) {
  try {
    return await getUnifiedChatBootstrap(request);
  } catch (error: any) {
    const status = error?.status || 500;
    return NextResponse.json({ error: error?.message || '读取统一对话配置失败，请稍后重试' }, { status });
  }
}

/** Legacy knowledge-chat endpoint, now backed by the same unified RAG pipeline. */
export async function POST(request: NextRequest) {
  return handleUnifiedChatPost(request);
}
