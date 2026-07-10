import { NextRequest, NextResponse } from 'next/server';
import { testLanguageConnection } from '@/lib/ai/language-provider';
import { testImageConnection } from '@/lib/ai/image-provider';
import { testEmbeddingConnection } from '@/lib/ai/embedding-provider';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, apiKey, baseUrl, model } = body;

    if (!provider || !apiKey || !baseUrl || !model) {
      return NextResponse.json({ error: '缺少参数' }, { status: 400 });
    }

    let result;
    switch (provider) {
      case 'language':
        result = await testLanguageConnection(apiKey, baseUrl, model);
        break;
      case 'image':
        result = await testImageConnection(apiKey, baseUrl, model);
        break;
      case 'embedding':
        result = await testEmbeddingConnection(apiKey, baseUrl, model);
        break;
      default:
        return NextResponse.json({ error: '未知 provider' }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
