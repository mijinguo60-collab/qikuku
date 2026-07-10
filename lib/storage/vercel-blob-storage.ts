import { put, del, head } from '@vercel/blob';
import { v4 as uuidv4 } from 'uuid';
import type { StorageAdapter, UploadInput, UploadResult } from './types';

export class VercelBlobStorage implements StorageAdapter {
  private companyId: string;

  constructor(companyId: string) {
    this.companyId = companyId;
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    const ext = input.originalName.split('.').pop() || 'bin';
    const safeName = `${this.companyId}/${uuidv4()}.${ext}`;
    const blob = await put(safeName, input.buffer, {
      access: 'public',
      contentType: input.mimeType,
    });
    return {
      storageProvider: 'vercel-blob',
      storageKey: blob.pathname,
      url: blob.url,
      filename: safeName,
      originalName: input.originalName,
      mimeType: input.mimeType,
      size: input.size,
      uploadedAt: new Date().toISOString(),
    };
  }

  async delete(storageKey: string): Promise<void> {
    try { await del(storageKey); } catch {}
  }

  async getUrl(storageKey: string): Promise<string> {
    try {
      const meta = await head(storageKey);
      return meta.url;
    } catch {
      return storageKey;
    }
  }
}
