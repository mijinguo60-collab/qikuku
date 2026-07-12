import { NextRequest, NextResponse } from 'next/server';
import { generateImage, getImageCapabilities, getImageConfig } from '@/lib/ai/image-provider';
import { buildImagePrompt } from '@/lib/ai/image-prompt-builder';
import { persistGeneratedImage } from '@/lib/ai/persist-generated-image';
import { getDb } from '@/lib/db';
import { appendChatMessage, ensureChatSession, SessionOwner } from '@/lib/chat-sessions';
import { v4 as uuid } from 'uuid';
import { checkCreditBalance, consumeCredits } from '@/lib/billing/credits';
import { ensureCompanySubscription } from '@/lib/billing/plans';
import { FEATURE_CREDITS } from '@/lib/billing/pricing';
import { getRequestSession } from '@/lib/session';

const MAX_COUNT = 4;
const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
const RATIOS: Record<string, string> = {
  '1:1': '1024x1024',
  '16:9': '1792x1024',
  '9:16': '1024x1792',
  '4:3': '1024x768',
  '3:4': '768x1024',
};

function validReferenceImage(value: unknown) {
  if (typeof value !== 'string' || !value) return false;
  const match = value.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!match) return false;
  return Buffer.byteLength(match[2], 'base64') <= MAX_REFERENCE_BYTES;
}

async function persistReferenceImage(referenceImage: string, companyId: string, name?: string) {
  try {
    const saved = await persistGeneratedImage({
      base64: referenceImage,
      companyId,
      filename: name || `reference-${Date.now()}.png`,
    });
    if (saved.persisted) return saved.imageUrl;
    console.error('[IMAGE] Reference image was not persisted', { warning: saved.warning || 'unknown' });
  } catch (error: any) {
    console.error('[IMAGE] Reference image persistence failed', { message: error.message });
  }
  return null;
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  let session: any = null;
  let owner: SessionOwner | null = null;
  try {
    const body = await request.json();
    const { prompt, aspectRatio = '1:1', count, referenceImage, referenceImageName, sessionId } = body;
    if (!prompt?.trim()) return NextResponse.json({ error: '缺少 prompt' }, { status: 400 });
    if (referenceImage && !validReferenceImage(referenceImage)) {
      return NextResponse.json({ error: '参考图仅支持 PNG、JPG、JPEG、WebP，且大小不能超过 10MB' }, { status: 400 });
    }

    owner = await getRequestSession(request);
    if (!owner) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const imageConfig = getImageConfig();
    if (!imageConfig.isReady) return NextResponse.json({ error: imageConfig.error }, { status: 503 });

    const ratio = RATIOS[aspectRatio] ? aspectRatio : '1:1';
    const size = RATIOS[ratio];
    const n = Math.min(Math.max(parseInt(count) || 1, 1), MAX_COUNT);
    await ensureCompanySubscription(owner.companyId, owner.id);
    const featureType = referenceImage ? 'image_edit' : 'image_generation';
    const requiredCredits = FEATURE_CREDITS[featureType];
    const preflight = await checkCreditBalance(owner.companyId, requiredCredits * n);
    if (!preflight.ok) return NextResponse.json({ error: 'AI算力积分不足，请充值或升级套餐', requiredCredits: requiredCredits * n, balance: preflight.balance, billingUrl: '/dashboard/billing' }, { status: 402 });
    const requestId = uuid();
    session = await ensureChatSession(owner, typeof sessionId === 'string' ? sessionId : undefined, 'image');

    const referenceImageUrl = referenceImage ? await persistReferenceImage(referenceImage, owner.companyId, typeof referenceImageName === 'string' ? referenceImageName : undefined) : null;
    await appendChatMessage(session, 'user', prompt.trim(), {
      titleLength: 18,
      metadata: {
        kind: 'image_prompt', aspectRatio: ratio, size,
        referenceImageUrl, referenceImageName: typeof referenceImageName === 'string' ? referenceImageName : null,
        hasReferenceImage: Boolean(referenceImage),
      },
    });

    const ratioInstruction = `画面比例为 ${ratio}。`;
    const { finalPrompt } = buildImagePrompt(prompt, { size, referenceText: ratioInstruction });
    const result = await generateImage({ prompt: `${finalPrompt}\n${ratioInstruction}`, size, n, sourceImage: referenceImage });

    const images: Array<{ url: string; storageProvider: string; warning?: string }> = [];
    const warnings: string[] = [];
    for (const source of result.imageUrls) {
      try {
        const persisted = await persistGeneratedImage({
          remoteUrl: source.startsWith('data:') ? '' : source,
          base64: source.startsWith('data:') ? source : undefined,
          companyId: owner.companyId,
          filename: `qikuku-${Date.now()}.png`,
        });
        images.push({ url: persisted.imageUrl, storageProvider: persisted.storageProvider, warning: persisted.warning });
        if (!persisted.persisted && persisted.warning) warnings.push(persisted.warning);
      } catch (error: any) {
        console.error('[IMAGE] Image persistence failed', { message: error.message });
        images.push({ url: source, storageProvider: 'raw', warning: '图片未持久化，当前使用上游链接。' });
        warnings.push('图片未持久化，当前使用上游链接。');
      }
    }

    const generationIds: string[] = [];
    const savableImages = images.filter((image) => !image.url.startsWith('data:'));
    let assetsSaved = savableImages.length === images.length;
    if (!assetsSaved) warnings.push('图片已生成，但 b64 图片未能持久化到对象存储，暂未写入素材库。');
    try {
      if (savableImages.length) {
        const db = getDb();
        const now = new Date().toISOString();
        const insert = db.prepare(`INSERT INTO "ImageGeneration" (id, "companyId", "userId", "sessionTitle", prompt, "revisedPrompt", "imageUrl", "sourceImageUrl", model, size, "aspectRatio", status, "storageProvider", "storageKey", "rawProviderUrl", metadata, "createdAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        for (const image of savableImages) {
          const generationId = uuid();
          generationIds.push(generationId);
          await insert.run(
            generationId, owner.companyId, owner.id, prompt.trim().slice(0, 18), prompt.trim(), result.revisedPrompt || finalPrompt,
            image.url, referenceImageUrl, imageConfig.model, size, ratio, 'completed', image.storageProvider,
            null, image.url, JSON.stringify({ sessionId: session.id, referenceImageName: referenceImageName || null }), now
          );
        }
      }
    } catch (error: any) {
      console.error('[IMAGE] Failed to save image assets', { message: error.message, sessionId: session.id });
      assetsSaved = false;
      warnings.push('图片已生成，但保存到素材库失败。');
    }

    await appendChatMessage(session, 'assistant', assetsSaved ? '图片已生成并保存到素材库。' : '图片已生成，但保存到素材库失败。', {
      metadata: { kind: 'image_result', prompt: prompt.trim(), imageUrls: images.map((image) => image.url), generationIds, aspectRatio: ratio, assetsSaved, warnings },
    });

    // 图片需要已成功生成且成功入库，才正式扣除积分。
    const billing = assetsSaved
      ? await consumeCredits({ companyId: owner.companyId, userId: owner.id, amount: requiredCredits * images.length, featureType, requestId, idempotencyKey: `image:${requestId}`, description: referenceImage ? '参考图生成' : '文生图', model: imageConfig.model, imageCount: images.length })
      : null;

    return NextResponse.json({
      sessionId: session.id, images, generationIds, prompt: prompt.trim(), finalPrompt: result.revisedPrompt || finalPrompt,
      aspectRatio: ratio, size, referenceImageUrl, assetsSaved, warnings, capabilities: getImageCapabilities(), latencyMs: Date.now() - start,
      chargedCredits: billing?.chargedCredits || 0, remainingCredits: billing?.balance,
    });
  } catch (error: any) {
    const message = error.message || '图片生成失败';
    if (session) {
      await appendChatMessage(session, 'assistant', `图片生成失败：${message}`, { metadata: { kind: 'image_error', error: message } }).catch(() => {});
    }
    console.error('[IMAGE]', { message, sessionId: session?.id || null });
    return NextResponse.json({ error: message, sessionId: session?.id || null }, { status: message.includes('429') ? 429 : 500 });
  }
}
