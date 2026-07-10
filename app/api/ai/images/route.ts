import { NextRequest, NextResponse } from 'next/server';
import { generateImage, editImage } from '@/lib/ai/image-provider';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, sourceImage, size, model } = body;

    if (!prompt) {
      return NextResponse.json({ error: '缺少 prompt' }, { status: 400 });
    }

    let result;
    if (sourceImage) {
      result = await editImage({ prompt, sourceImage, size, model });
    } else {
      result = await generateImage({ prompt, size, model });
    }

    return NextResponse.json(result);
  } catch (e: any) {
    console.error('Image generation error:', e);
    return NextResponse.json({ error: e.message || '图片生成失败' }, { status: 500 });
  }
}
