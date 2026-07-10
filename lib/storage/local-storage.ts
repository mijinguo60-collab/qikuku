import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { StorageAdapter, UploadInput, UploadResult } from './types';

const BASE = path.join(process.cwd(), 'public', 'uploads');

export class LocalStorage implements StorageAdapter {
  private companyId: string;

  constructor(companyId: string) {
    this.companyId = companyId;
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    const dir = path.join(BASE, this.companyId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const ext = input.originalName.split('.').pop() || 'bin';
    const safeName = `${uuidv4()}.${ext}`;
    const filePath = path.join(dir, safeName);
    writeFileSync(filePath, input.buffer);
    return {
      storageProvider: 'local',
      storageKey: filePath,
      url: `/uploads/${this.companyId}/${safeName}`,
      filename: safeName,
      originalName: input.originalName,
      mimeType: input.mimeType,
      size: input.size,
      uploadedAt: new Date().toISOString(),
    };
  }

  async delete(storageKey: string): Promise<void> {
    try { require('fs').unlinkSync(storageKey); } catch {}
  }

  async getUrl(storageKey: string): Promise<string> {
    if (storageKey.startsWith('/uploads/')) return storageKey;
    return `/uploads/${this.companyId}/${path.basename(storageKey)}`;
  }
}
