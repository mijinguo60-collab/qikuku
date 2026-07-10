import { NextRequest, NextResponse } from 'next/server';
import { createEmbedding } from '@/lib/ai/embedding-provider';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { input } = body;

    if (!input) {
      return NextResponse.json({ error: '缺少 input' }, { status: 400 });
    }

    const result = await createEmbedding({ input });
    return NextResponse.json(result);
  } catch (e: any) {
    console.error('Embedding error:', e);
    return NextResponse.json({ error: e.message || '向量生成失败' }, { status: 500 });
  }
}
