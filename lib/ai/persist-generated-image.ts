/**
 * 图片生成持久化 — 把 API 返回的图片保存到 storage adapter
 */
import { createStorageAdapter } from '@/lib/storage';

const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

export interface PersistInput {
  base64?: string;
  remoteUrl?: string;
  mimeType?: string;
  companyId: string;
  filename?: string;
}

export interface PersistResult {
  imageUrl: string;
  storageProvider: 'vercel-blob' | 'local' | 'raw';
  storageKey: string;
  size: number;
  mimeType: string;
  persisted: boolean;
  warning?: string;
}

export async function persistGeneratedImage(input: PersistInput): Promise<PersistResult> {
  const storage = createStorageAdapter(input.companyId);
  const defaultMime = input.mimeType || 'image/png';
  const fn = input.filename || `generated-${Date.now()}.png`;

  // Case 1: base64 data
  if (input.base64) {
    try {
      const buffer = base64ToBuffer(input.base64);
      const result = await storage.upload({ buffer, originalName: fn, mimeType: defaultMime, size: buffer.length });
      return { imageUrl: result.url, storageProvider: result.storageProvider, storageKey: result.storageKey, size: buffer.length, mimeType: defaultMime, persisted: true };
    } catch (e: any) {
      return { imageUrl: `data:${defaultMime};base64,${input.base64}`, storageProvider: 'raw', storageKey: '', size: 0, mimeType: defaultMime, persisted: false, warning: `持久化失败: ${e.message}` };
    }
  }

  // Case 2: remote URL — download and persist
  if (input.remoteUrl) {
    try {
      const res = await fetch(input.remoteUrl, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get('content-type') || '';
      if (!ct.startsWith('image/')) throw new Error(`非图片类型: ${ct}`);
      const cl = parseInt(res.headers.get('content-length') || '0');
      if (cl > MAX_DOWNLOAD_BYTES) throw new Error(`图片过大 (${cl} > ${MAX_DOWNLOAD_BYTES})`);
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > MAX_DOWNLOAD_BYTES) throw new Error('图片超过大小限制');
      const mime = ct || defaultMime;
      const result = await storage.upload({ buffer, originalName: fn, mimeType: mime, size: buffer.length });
      return { imageUrl: result.url, storageProvider: result.storageProvider, storageKey: result.storageKey, size: buffer.length, mimeType: mime, persisted: true };
    } catch (e: any) {
      return { imageUrl: input.remoteUrl, storageProvider: 'raw', storageKey: '', size: 0, mimeType: defaultMime, persisted: false, warning: `持久化失败 (已保留原始链接): ${e.message}` };
    }
  }

  throw new Error('无可用图片数据');
}

function base64ToBuffer(b64: string): Buffer {
  const clean = b64.replace(/^data:[^;]+;base64,/, '');
  return Buffer.from(clean, 'base64');
}
