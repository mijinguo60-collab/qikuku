/**
 * AI 调用日志 — 写入 AiCallLog 表
 */
import { getDb } from '@/lib/db';
import { v4 as uuid } from 'uuid';

export interface AiLogInput {
  companyId: string;
  userId?: string;
  mode: string;
  model?: string;
  modelStatus?: string;
  questionPreview?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  success: boolean;
  errorMessage?: string;
  sourcesCount?: number;
}

export async function logAiCall(input: AiLogInput) {
  try {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO "AiCallLog" (id, "companyId", "userId", mode, model, "modelStatus", "questionPreview", "promptTokens", "completionTokens", "totalTokens", "latencyMs", success, "errorMessage", "sourcesCount", "createdAt")
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    await stmt.run(
      uuid(), input.companyId, input.userId || null, input.mode,
      input.model || null, input.modelStatus || null,
      (input.questionPreview || '').slice(0, 200) || null,
      input.promptTokens ?? null, input.completionTokens ?? null,
      input.totalTokens ?? null, input.latencyMs ?? null,
      input.success, input.errorMessage || null,
      input.sourcesCount ?? null, new Date().toISOString()
    );
  } catch (e: any) {
    console.error('[AI-LOG] Failed to write log:', e.message);
  }
}
