import { NextRequest, NextResponse } from 'next/server';
import { generateImage, getImageConfig } from '@/lib/ai/image-provider';
import { buildImagePrompt } from '@/lib/ai/image-prompt-builder';
import { persistGeneratedImage } from '@/lib/ai/persist-generated-image';
import { getDb } from '@/lib/db';
import { v4 as uuid } from 'uuid';

const VALID_SIZES = ['1024x1024','1024x1792','1792x1024','768x1024','1024x768','1024x2152'];
const VALID_STYLES = ['高级简约','写实商业','科技感','国潮','奢华质感','Apple 极简','电商爆款'];
const VALID_PURPOSES = ['电商主图','海报','探店封面','朋友圈图','小红书封面','公众号配图','企业宣传图','详情页'];
const MAX_COUNT = 4;

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const body = await request.json();
    const { prompt, size, style, purpose, count, sourceImage, referenceText } = body;
    if (!prompt?.trim()) return NextResponse.json({ error: '缺少 prompt' }, { status: 400 });

    const userCookie = request.cookies.get('qikuku_user');
    if (!userCookie) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const user = JSON.parse(userCookie.value);

    const imageConfig = getImageConfig();
    if (!imageConfig.isReady) return NextResponse.json({ error: imageConfig.error }, { status: 503 });

    const n = Math.min(Math.max(parseInt(count) || 1, 1), MAX_COUNT);
    const selSize = VALID_SIZES.includes(size) ? size : '1024x1024';

    const { finalPrompt } = buildImagePrompt(prompt, { purpose, size: selSize, style, referenceText });

    // Call image API
    const result = await generateImage({ prompt: finalPrompt, size: selSize, n, sourceImage });

    // Persist each image to storage adapter
    const images: any[] = [];
    let persistStatus = 'persisted';
    let warnings: string[] = [];
    let persistedUrl = '';
    let pProvider = '';
    let pKey = '';

    for (const item of result.imageUrls) {
      try {
        const persist = await persistGeneratedImage({
          remoteUrl: typeof item === 'string' && !item.startsWith('data:') ? item : '',
          base64: typeof item === 'string' && item.startsWith('data:') ? item : (item as any).b64_json,
          companyId: user.companyId,
          filename: `qikuku-${Date.now()}.png`,
        });
        images.push({ url: persist.imageUrl, storageProvider: persist.storageProvider, warning: persist.warning });
        if (!persist.persisted) { persistStatus = 'failed'; warnings.push(persist.warning || ''); }
        // Save first image's persistence data
        if (!persistedUrl) { persistedUrl = persist.imageUrl; pProvider = persist.storageProvider; pKey = persist.storageKey; }
      } catch (e: any) {
        images.push({ url: (item as any).url || item, storageProvider: 'raw', warning: e.message });
        persistStatus = 'failed';
        warnings.push(e.message);
      }
    }

    const firstImgUrl = images[0]?.url || '';
    let generationId: string | null = null;
    try {
      const db = getDb();
      generationId = uuid();
      const now = new Date().toISOString();
      const stmt = db.prepare(`INSERT INTO "ImageGeneration" (id, "companyId", "userId", prompt, "revisedPrompt", "imageUrl", "sourceImageUrl", model, size, purpose, style, status, "storageProvider", "storageKey", "rawProviderUrl", "createdAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      await stmt.run(generationId, user.companyId, user.id, prompt, result.revisedPrompt || finalPrompt, persistedUrl || firstImgUrl,
        sourceImage || null, imageConfig.model, selSize, purpose || null, style || null,
        firstImgUrl ? 'completed' : 'failed', pProvider || null, pKey || null, result.imageUrls[0] || null, now);
    } catch (error: any) {
      console.error('[IMAGE] Failed to save generation record', error.message);
      persistStatus = 'failed';
      warnings.push('图片已生成，但保存生成记录失败。');
    }

    return NextResponse.json({
      images, prompt, finalPrompt: result.revisedPrompt || finalPrompt,
      imageStatus: 'live', persistStatus, warnings: warnings.filter(Boolean),
      latencyMs: Date.now() - start, generationId,
    });
  } catch (e: any) {
    console.error('[IMAGE]', e.message);
    return NextResponse.json({ error: e.message || '图片生成失败' }, { status: 500 });
  }
}
