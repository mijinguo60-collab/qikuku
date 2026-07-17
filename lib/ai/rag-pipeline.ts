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

export type KnowledgeSource = {
  content: string;
  documentId: string;
  knowledgeSpaceId: string;
  score: number;
  source: string;
};

/**
 * The current data model has no per-user space ACL. Only AI-enabled spaces with
 * visibility=all are therefore eligible; a future ACL can extend this boundary
 * without allowing a caller to widen its company scope.
 */
export async function getAccessibleKnowledgeSpaceIds(companyId: string, requestedIds?: string[]) {
  const spaces = await getDb().prepare(
    `SELECT id FROM "KnowledgeSpace"
     WHERE "companyId" = ? AND "isAiEnabled" = true AND (visibility = 'all' OR visibility IS NULL)`
  ).all(companyId) as Array<{ id: string }>;
  const allowed = new Set(spaces.map((space) => space.id));
  if (!requestedIds?.length) return Array.from(allowed);
  const cleanRequested = Array.from(new Set(requestedIds.filter((id) => typeof id === 'string' && id.length <= 100)));
  if (cleanRequested.some((id) => !allowed.has(id))) throw new Error('知识空间不存在、未启用或无权访问');
  return cleanRequested;
}

export async function searchKnowledge(
  query: string, companyId: string, topK = 5, knowledgeSpaceIds?: string[]
): Promise<KnowledgeSource[]> {
  const db = getDb();
  const accessibleSpaceIds = await getAccessibleKnowledgeSpaceIds(companyId, knowledgeSpaceIds);
  if (!accessibleSpaceIds.length) return [];
  const placeholders = accessibleSpaceIds.map(() => '?').join(',');
  const chunks = db.prepare(
    `SELECT kc.id, kc.content, kc.embedding, kc."documentId", d.filename
     , d."knowledgeSpaceId"
     FROM "KnowledgeChunk" kc JOIN "Document" d ON kc."documentId" = d.id
     WHERE kc."companyId" = ? AND d."companyId" = ? AND d."knowledgeSpaceId" IN (${placeholders})`
  ).all(companyId, companyId, ...accessibleSpaceIds) as any[];

  if (chunks.length === 0) return [];

  const hasEmbeddings = chunks.some((c: any) => c.embedding && c.embedding !== '[]');

  if (hasEmbeddings) {
    try {
      const qeRes = await createEmbedding({ input: query });
      const qVec = qeRes.embeddings[0];
      return chunks
        .map((c: any) => ({
          content: c.content, documentId: c.documentId,
          source: c.filename || '未知文件', knowledgeSpaceId: c.knowledgeSpaceId,
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
      return { content: c.content, documentId: c.documentId, source: c.filename || '未知文件', knowledgeSpaceId: c.knowledgeSpaceId, score };
    })
    .filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, topK);
}

export async function reindexDocument(documentId: string, companyId: string, text: string): Promise<number> {
  const db = getDb();
  db.prepare('DELETE FROM "KnowledgeChunk" WHERE "documentId" = ?').run(documentId);
  return indexDocument(documentId, companyId, text);
}
