/**
 * API Key 服务端加密存储
 * 使用简单的 AES 加密 + 环境变量中的 secret
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { getDb } from './db';
import { v4 as uuidv4 } from 'uuid';

// 从环境变量获取加密密钥（32 字节）
function getSecretKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || 'qikuku-default-encryption-key!!';
  return Buffer.from(secret.padEnd(32, '0').slice(0, 32), 'utf-8');
}

const ALGORITHM = 'aes-256-cbc';

export function encryptApiKey(plainText: string): string {
  const key = getSecretKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf-8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptApiKey(encrypted: string): string {
  const key = getSecretKey();
  const [ivHex, dataHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf-8');
}

/**
 * 保存 API 凭证到数据库（加密存储）
 */
export function saveApiCredential(
  companyId: string,
  provider: string,
  apiKey: string,
  baseUrl: string,
  model: string,
): void {
  const db = getDb();
  const encrypted = encryptApiKey(apiKey);
  const now = new Date().toISOString();

  const existing = db.prepare(
    'SELECT id FROM ApiCredential WHERE companyId = ? AND provider = ?'
  ).get(companyId, provider) as any;

  if (existing) {
    db.prepare(
      'UPDATE ApiCredential SET encryptedKey = ?, baseUrl = ?, model = ?, updatedAt = ? WHERE id = ?'
    ).run(encrypted, baseUrl, model, now, existing.id);
  } else {
    db.prepare(
      'INSERT INTO ApiCredential (id, companyId, provider, encryptedKey, baseUrl, model, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), companyId, provider, encrypted, baseUrl, model, now, now);
  }
}

/**
 * 获取 API 凭证（解密后返回，仅服务端调用）
 */
export function getApiCredential(companyId: string, provider: string): {
  apiKey: string; baseUrl: string; model: string;
} | null {
  const db = getDb();
  const row: any = db.prepare(
    'SELECT * FROM ApiCredential WHERE companyId = ? AND provider = ?'
  ).get(companyId, provider);
  if (!row || !row.encryptedKey) return null;
  return {
    apiKey: decryptApiKey(row.encryptedKey),
    baseUrl: row.baseUrl || '',
    model: row.model || '',
  };
}

/**
 * 获取脱敏后的 API Key（用于前端展示）
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length <= 8) return '****';
  return apiKey.slice(0, 3) + '****' + apiKey.slice(-4);
}
