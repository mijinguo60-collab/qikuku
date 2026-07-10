import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { parseFile } from '@/lib/file-parser';
import { indexDocument } from '@/lib/ai/rag-pipeline';
import { logAction } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const knowledgeSpaceId = formData.get('knowledgeSpaceId') as string;
    const tags = formData.get('tags') as string || '';
    const sensitivityLevel = formData.get('sensitivityLevel') as string || 'normal';

    if (!file) {
      return NextResponse.json({ error: '未上传文件' }, { status: 400 });
    }

    const userCookie = request.cookies.get('qikuku_user');
    if (!userCookie) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    const user = JSON.parse(userCookie.value);

    const docId = uuidv4();
    const fileType = file.name.split('.').pop()?.toLowerCase() || 'unknown';
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', user.companyId);
    if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

    const fileName = `${docId}.${fileType}`;
    const filePath = path.join(uploadDir, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(filePath, buffer);

    // Save file record
    const db = getDb();
    db.prepare(
      `INSERT INTO Document (id, companyId, knowledgeSpaceId, filename, fileType, fileUrl, fileSize, status, sensitivityLevel, tags, uploadedBy, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      docId, user.companyId, knowledgeSpaceId, file.name, fileType,
      `/uploads/${user.companyId}/${fileName}`, buffer.length,
      'parsing', sensitivityLevel, tags, user.id,
      new Date().toISOString(), new Date().toISOString()
    );

    // Parse file and index
    let parseResult;
    try {
      parseResult = await parseFile(filePath, fileType);
      const text = parseResult.text || '';

      // Update document with extracted text
      db.prepare('UPDATE Document SET extractedText = ?, status = ? WHERE id = ?')
        .run(text, text ? 'indexing' : 'failed', docId);

      if (text) {
        // Index into knowledge base
        const chunkCount = await indexDocument(docId, user.companyId, text);
        db.prepare('UPDATE Document SET status = ? WHERE id = ?').run('indexed', docId);

        // Log
        await logAction({
          companyId: user.companyId, userId: user.id,
          action: 'upload_document',
          targetType: 'document', targetId: docId,
          result: `success: ${chunkCount} chunks indexed`,
        });

        return NextResponse.json({
          success: true, documentId: docId, fileName: file.name,
          textLength: text.length, chunkCount, fileType,
        });
      } else {
        return NextResponse.json({
          success: true, documentId: docId, fileName: file.name,
          warning: '文件已上传但未能提取文本内容',
        });
      }
    } catch (e: any) {
      db.prepare('UPDATE Document SET status = ? WHERE id = ?').run('failed', docId);
      return NextResponse.json({
        success: false, documentId: docId, fileName: file.name,
        error: `解析失败: ${e.message}`,
      }, { status: 500 });
    }
  } catch (e: any) {
    console.error('Upload error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
