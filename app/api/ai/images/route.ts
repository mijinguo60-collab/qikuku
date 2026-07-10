import { NextRequest, NextResponse } from 'next/server';
import { generateImage } from '@/lib/ai/image-provider';
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
          remoteUrl: typeof item === 'string' ? item : (item as any).url || '',
          base64: (item as any).b64_json,
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

    // Save to DB with persistence info
    const db = getDb();
    const genId = uuid();
    const now = new Date().toISOString();
    const stmt = db.prepare(`INSERT INTO "ImageGeneration" (id, "companyId", "userId", prompt, "revisedPrompt", "imageUrl", "sourceImageUrl", model, size, purpose, style, status, "storageProvider", "storageKey", "rawProviderUrl", "createdAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const firstImgUrl = images[0]?.url || '';
    await stmt.run(genId, user.companyId, user.id, prompt, result.revisedPrompt || finalPrompt, persistedUrl || firstImgUrl,
      sourceImage || null, process.env.IMAGE_MODEL || 'gpt-image-2', selSize, purpose || null, style || null,
      persistedUrl ? 'completed' : 'failed', pProvider || null, pKey || null, result.imageUrls[0] || null, now);

    return NextResponse.json({
      images, prompt, finalPrompt: result.revisedPrompt || finalPrompt,
      model: process.env.IMAGE_MODEL || 'gpt-image-2',
      imageStatus: 'live', persistStatus, warnings: warnings.filter(Boolean),
      latencyMs: Date.now() - start, generationId: genId,
    });
  } catch (e: any) {
    console.error('[IMAGE]', e.message);
    return NextResponse.json({ error: e.message || '图片生成失败' }, { status: 500 });
  }
}
