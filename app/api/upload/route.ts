import { NextRequest, NextResponse } from 'next/server';
import { createStorageAdapter } from '@/lib/storage';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { parseFile, getFileParserStatus } from '@/lib/file-parser';
import { chunkText } from '@/lib/ai/rag-pipeline';
import { createEmbedding } from '@/lib/ai/embedding-provider';
import { logAction } from '@/lib/audit';

const ALLOWED_TYPES = ['pdf','doc','docx','xls','xlsx','txt','md','markdown','csv','json'];
const MAX_SIZE = 20 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const f = formData.get('file') as File | null;
    if (!f) return NextResponse.json({ error: '未上传文件' }, { status: 400 });

    const knowledgeSpaceId = (formData.get('knowledgeSpaceId') as string) || '';
    const tags = (formData.get('tags') as string) || '';
    const sensitivityLevel = (formData.get('sensitivityLevel') as string) || 'normal';

    const userCookie = request.cookies.get('qikuku_user');
    if (!userCookie) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const user = JSON.parse(userCookie.value);

    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_TYPES.includes(ext)) {
      return NextResponse.json({ error: `不支持的文件类型: .${ext}` }, { status: 400 });
    }
    if (f.size > MAX_SIZE) {
      return NextResponse.json({ error: '文件超过 20MB 限制' }, { status: 400 });
    }

    const buffer = Buffer.from(await f.arrayBuffer());
    const mimeType = f.type || 'application/octet-stream';
    const docId = uuidv4();

    // Step 1: Upload to storage
    const storage = createStorageAdapter(user.companyId);
    const stored = await storage.upload({ buffer, originalName: f.name, mimeType, size: f.size });

    // Step 2: Create Document record
    const db = getDb();
    const stmt = db.prepare(`INSERT INTO "Document" (id, "companyId", "knowledgeSpaceId", filename, fileType, "fileUrl", "fileSize", status, "sensitivityLevel", tags, "uploadedBy", "createdAt", "updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    await stmt.run(docId, user.companyId, knowledgeSpaceId, stored.originalName, ext, stored.url, stored.size, 'processing', sensitivityLevel, tags, user.id, new Date().toISOString(), new Date().toISOString());

    // Step 3: Parse text
    let parseStatus = 'pending', extractedText = '', chunkCount = 0, embeddingStatus = 'skipped';
    try {
      const parseResult = await parseFile(stored.storageKey || stored.url, ext);
      extractedText = parseResult.text || '';
      parseStatus = getFileParserStatus(extractedText);

      if (parseResult.metadata?.warning) {
        parseStatus = 'low_content';
      }

      // Step 4: Save extracted text
      const upd = db.prepare(`UPDATE "Document" SET "extractedText" = ?, status = ? WHERE id = ?`);
      await upd.run(extractedText, parseStatus, docId);

      // Step 5: Chunk and embed (only if we have text)
      if (extractedText && extractedText.trim().length >= 50) {
        const chunks = chunkText(extractedText);
        if (chunks.length > 0) {
          const insertChunk = db.prepare(`INSERT INTO "KnowledgeChunk" (id, "documentId", "companyId", content, embedding, metadata, "createdAt") VALUES (?,?,?,?,?,?,?)`);
          const now = new Date().toISOString();

          // Try embedding
          try {
            const embResult = await createEmbedding({ input: chunks });
            for (let i = 0; i < chunks.length; i++) {
              await insertChunk.run(uuidv4(), docId, user.companyId, chunks[i], JSON.stringify(embResult.embeddings[i] || []), JSON.stringify({ chunkIndex: i }), now);
            }
            chunkCount = chunks.length;
            embeddingStatus = 'success';
          } catch (embErr: any) {
            // Embedding failed — still save chunks without embeddings
            console.error('[RAG] Embedding failed:', embErr.message);
            for (let i = 0; i < chunks.length; i++) {
              await insertChunk.run(uuidv4(), docId, user.companyId, chunks[i], null, JSON.stringify({ chunkIndex: i }), now);
            }
            chunkCount = chunks.length;
            embeddingStatus = 'failed';
          }
        }
      }
    } catch (parseErr: any) {
      console.error('[RAG] Parse failed:', parseErr.message);
      parseStatus = 'parse_failed';
    }

    // Final status
    let finalStatus = 'ready';
    if (parseStatus === 'parse_failed') finalStatus = 'parse_failed';
    else if (embeddingStatus === 'failed') finalStatus = 'embedding_failed';
    else if (parseStatus === 'low_content') finalStatus = 'low_content';
    else if (chunkCount === 0 && extractedText.trim().length < 50) finalStatus = 'low_content';

    await db.prepare(`UPDATE "Document" SET status = ? WHERE id = ?`).run(finalStatus, docId);

    return NextResponse.json({
      success: true, documentId: docId, fileName: stored.originalName,
      status: finalStatus, extractedTextLength: extractedText.length,
      chunkCount, embeddingStatus,
    });
  } catch (e: any) {
    console.error('[UPLOAD]', e.message);
    return NextResponse.json({ error: e.message || '上传失败' }, { status: 500 });
  }
}
