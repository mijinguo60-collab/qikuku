/**
 * RAG Pipeline: 文本切片 → Embedding → 向量存储 → 语义检索
 */
import { createEmbedding } from './embedding-provider';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

export function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  if (!text || text.trim().length === 0) return [];
  const chunks: string[] = [];
  const cleaned = text.replace(/\s+/g, ' ').trim();
  let start = 0;
  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    chunks.push(cleaned.slice(start, end));
    start += chunkSize - overlap;
  }
  return chunks;
}

export async function indexDocument(documentId: string, companyId: string, text: string): Promise<number> {
  if (!text || text.trim().length === 0) return 0;
  const db = getDb();
  const chunks = chunkText(text);
  const embeddings = await createEmbedding({ input: chunks });
  const insertStmt = db.prepare('INSERT INTO "KnowledgeChunk" (id, "documentId", "companyId", content, embedding, "createdAt") VALUES (?, ?, ?, ?, ?, ?)');
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    for (let i = 0; i < chunks.length; i++) {
      insertStmt.run(uuidv4(), documentId, companyId, chunks[i], JSON.stringify(embeddings.embeddings[i] || []), now);
    }
  });
  tx();
  return chunks.length;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i]; }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function searchKnowledge(
  query: string, companyId: string, topK = 5
): Promise<{ content: string; documentId: string; score: number; source: string }[]> {
  const db = getDb();
  const chunks = db.prepare(
    `SELECT kc.id, kc.content, kc.embedding, kc."documentId", d.filename
     FROM "KnowledgeChunk" kc JOIN "Document" d ON kc."documentId" = d.id WHERE kc."companyId" = ?`
  ).all(companyId) as any[];

  if (chunks.length === 0) return [];

  const hasEmbeddings = chunks.some((c: any) => c.embedding && c.embedding !== '[]');

  if (hasEmbeddings) {
    try {
      const qeRes = await createEmbedding({ input: query });
      const qVec = qeRes.embeddings[0];
      return chunks
        .map((c: any) => ({
          content: c.content, documentId: c.documentId,
          source: c.filename || '未知文件',
          score: c.embedding ? cosineSimilarity(qVec, JSON.parse(c.embedding)) : 0,
        }))
        .filter(r => r.score > 0.3).sort((a, b) => b.score - a.score).slice(0, topK);
    } catch { /* fallback */ }
  }

  // Keyword fallback
  const keywords = query.split(/[\s,，。.！!？?]+/).filter(k => k.length > 0);
  return chunks
    .map((c: any) => {
      let score = 0;
      const lower = c.content.toLowerCase();
      for (const kw of keywords) {
        const m = lower.match(new RegExp(kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
        if (m) score += m.length;
      }
      return { content: c.content, documentId: c.documentId, source: c.filename || '未知文件', score };
    })
    .filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, topK);
}

export async function reindexDocument(documentId: string, companyId: string, text: string): Promise<number> {
  const db = getDb();
  db.prepare('DELETE FROM "KnowledgeChunk" WHERE "documentId" = ?').run(documentId);
  return indexDocument(documentId, companyId, text);
}
