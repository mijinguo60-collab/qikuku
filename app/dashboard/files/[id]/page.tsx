import { cookies } from 'next/headers';
import Link from 'next/link';
import { ArrowLeft, Download, ExternalLink, FileText, FolderOpen, Layers, ShieldCheck } from 'lucide-react';
import { getDb } from '@/lib/db';

interface DocumentDetail {
  id: string;
  filename: string;
  fileType: string;
  fileUrl: string | null;
  fileSize: number | null;
  extractedText: string | null;
  status: string;
  sensitivityLevel: string;
  createdAt: string | Date;
  spaceName: string;
  knowledgeSpaceId: string;
  chunkCount: number | string;
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatFileSize(size: number | null) {
  if (!size) return '未记录';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function FileDetailPage({ params }: { params: { id: string } }) {
  const userCookie = cookies().get('qikuku_user');
  if (!userCookie) return null;

  let user: { companyId: string };
  try {
    user = JSON.parse(userCookie.value);
  } catch {
    return null;
  }

  const db = getDb();
  const document = await db.prepare(
    `SELECT d.*, ks.name AS "spaceName",
      (SELECT COUNT(*) FROM "KnowledgeChunk" kc WHERE kc."documentId" = d.id) AS "chunkCount"
     FROM "Document" d
     JOIN "KnowledgeSpace" ks ON d."knowledgeSpaceId" = ks.id
     WHERE d.id = ? AND d."companyId" = ?`
  ).get(params.id, user.companyId) as DocumentDetail | null;

  if (!document) {
    return (
      <div className="p-8 max-w-4xl mx-auto animate-fade-in">
        <Link href="/dashboard/files" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-8">
          <ArrowLeft className="w-4 h-4" /> 返回文件中心
        </Link>
        <div className="card p-10 text-center">
          <FileText className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-text-primary mb-2">文件不存在或无权限访问</h1>
          <p className="text-sm text-text-secondary">请返回文件中心确认文件是否仍然存在。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto animate-fade-in">
      <Link href="/dashboard/files" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-8">
        <ArrowLeft className="w-4 h-4" /> 返回文件中心
      </Link>

      <div className="card p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-surface-tertiary flex items-center justify-center flex-shrink-0">
              <FileText className="w-6 h-6 text-text-secondary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-text-primary break-words">{document.filename}</h1>
              <p className="text-sm text-text-secondary mt-2">{document.fileType.toUpperCase()} · 上传于 {formatDate(document.createdAt)}</p>
            </div>
          </div>
          {document.fileUrl && (
            <a href={document.fileUrl} target="_blank" rel="noreferrer" className="btn-secondary text-sm inline-flex items-center justify-center gap-2 flex-shrink-0">
              <ExternalLink className="w-4 h-4" /> 打开原文件
            </a>
          )}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
          <div className="rounded-xl bg-surface-secondary p-3"><span className="block text-xs text-text-muted">所属知识空间</span><Link href={`/dashboard/knowledge-spaces/${document.knowledgeSpaceId}`} className="block text-sm text-text-primary font-medium mt-1 hover:text-accent-blue truncate"><FolderOpen className="inline w-3.5 h-3.5 mr-1" />{document.spaceName}</Link></div>
          <div className="rounded-xl bg-surface-secondary p-3"><span className="block text-xs text-text-muted">文件状态</span><span className="block text-sm text-text-primary font-medium mt-1">{document.status}</span></div>
          <div className="rounded-xl bg-surface-secondary p-3"><span className="block text-xs text-text-muted">敏感等级</span><span className="block text-sm text-text-primary font-medium mt-1"><ShieldCheck className="inline w-3.5 h-3.5 mr-1" />{document.sensitivityLevel}</span></div>
          <div className="rounded-xl bg-surface-secondary p-3"><span className="block text-xs text-text-muted">文件大小 / 文本分块</span><span className="block text-sm text-text-primary font-medium mt-1"><Layers className="inline w-3.5 h-3.5 mr-1" />{formatFileSize(document.fileSize)} · {Number(document.chunkCount)} 块</span></div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border-light flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">提取文本</h2>
            <p className="text-xs text-text-muted mt-1">用于 AI 问答与知识检索的文本内容。</p>
          </div>
          {document.fileUrl && <a href={document.fileUrl} target="_blank" rel="noreferrer" download className="text-xs text-text-secondary hover:text-text-primary inline-flex items-center gap-1"><Download className="w-3.5 h-3.5" /> 下载</a>}
        </div>
        {document.extractedText ? (
          <pre className="p-5 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-text-secondary max-h-[36rem] overflow-y-auto">{document.extractedText}</pre>
        ) : (
          <div className="p-8 text-center text-sm text-text-secondary">原文件暂不可预览，但文本内容已入库后会在这里显示。</div>
        )}
      </div>
    </div>
  );
}
