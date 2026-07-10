import { LocalStorage } from './local-storage';
import { VercelBlobStorage } from './vercel-blob-storage';
import type { StorageAdapter } from './types';

export function createStorageAdapter(companyId: string): StorageAdapter {
  const isProd = process.env.NODE_ENV === 'production';
  const hasToken = !!process.env.BLOB_READ_WRITE_TOKEN;

  if (isProd) {
    if (!hasToken) {
      throw new Error('生产环境未配置对象存储，请配置 BLOB_READ_WRITE_TOKEN');
    }
    return new VercelBlobStorage(companyId);
  }
  return new LocalStorage(companyId);
}

export function getStorageConfig() {
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    provider: (!!process.env.BLOB_READ_WRITE_TOKEN ? 'vercel-blob' : 'local') as 'vercel-blob' | 'local',
    hasBlobToken: !!process.env.BLOB_READ_WRITE_TOKEN,
    productionReady: process.env.NODE_ENV === 'production' ? !!process.env.BLOB_READ_WRITE_TOKEN : true,
  };
}

export type { StorageAdapter, UploadInput, UploadResult } from './types';
