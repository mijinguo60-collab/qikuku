export interface UploadInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface UploadResult {
  storageProvider: 'vercel-blob' | 'local';
  storageKey: string;
  url: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface StorageAdapter {
  upload(input: UploadInput): Promise<UploadResult>;
  delete(storageKey: string): Promise<void>;
  getUrl(storageKey: string): Promise<string>;
}
