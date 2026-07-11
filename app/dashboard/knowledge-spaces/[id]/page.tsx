import { cookies } from 'next/headers';
import Link from 'next/link';
import { ArrowLeft, Brain, CalendarDays, FileText, FolderOpen } from 'lucide-react';
import { getDb } from '@/lib/db';

interface KnowledgeSpaceDetail {
  id: string;
  name: string;
  description: string | null;
  isAiEnabled: boolean | number;
  createdAt: string | Date;
  fileCount: number | string;
}

interface SpaceDocument {
  id: string;
  filename: string;
  fileType: string;
  status: string;
  createdAt: string | Date;
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function KnowledgeSpaceDetailPage({ params }: { params: { id: string } }) {
  const userCookie = cookies().get('qikuku_user');
  if (!userCookie) return null;

  let user: { companyId: string };
  try {
    user = JSON.parse(userCookie.value);
  } catch {
    return null;
  }

  const db = getDb();
  const space = await db.prepare(
    `SELECT ks.*, (SELECT COUNT(*) FROM "Document" d WHERE d."knowledgeSpaceId" = ks.id) AS "fileCount"
     FROM "KnowledgeSpace" ks
     WHERE ks.id = ? AND ks."companyId" = ?`
  ).get(params.id, user.companyId) as KnowledgeSpaceDetail | null;

  if (!space) {
    return (
      <div className="p-8 max-w-4xl mx-auto animate-fade-in">
        <Link href="/dashboard/knowledge-spaces" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-8">
          <ArrowLeft className="w-4 h-4" /> 返回知识空间
        </Link>
        <div className="card p-10 text-center">
          <FolderOpen className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-text-primary mb-2">知识空间不存在或无权限访问</h1>
          <p className="text-sm text-text-secondary">请返回列表确认空间是否仍然存在。</p>
        </div>
      </div>
    );
  }

  const documents = await db.prepare(
    `SELECT id, filename, "fileType", status, "createdAt"
     FROM "Document"
     WHERE "knowledgeSpaceId" = ? AND "companyId" = ?
     ORDER BY "createdAt" DESC`
  ).all(space.id, user.companyId) as SpaceDocument[];

  return (
    <div className="p-8 max-w-5xl mx-auto animate-fade-in">
      <Link href="/dashboard/knowledge-spaces" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-8">
        <ArrowLeft className="w-4 h-4" /> 返回知识空间
      </Link>

      <div className="card p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-surface-tertiary flex items-center justify-center flex-shrink-0">
            <FolderOpen className="w-6 h-6 text-text-secondary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-text-primary">{space.name}</h1>
            <p className="text-sm text-text-secondary mt-2">{space.description || '暂未填写空间描述。'}</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-5 text-sm text-text-secondary">
              <span className="flex items-center gap-1.5"><FileText className="w-4 h-4" /> {Number(space.fileCount)} 个文件</span>
              <span className="flex items-center gap-1.5"><Brain className="w-4 h-4" /> {space.isAiEnabled ? 'AI 已启用' : 'AI 已关闭'}</span>
              <span className="flex items-center gap-1.5"><CalendarDays className="w-4 h-4" /> 创建于 {formatDate(space.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border-light">
          <h2 className="text-sm font-semibold text-text-primary">空间文件</h2>
        </div>
        {documents.length > 0 ? (
          <div className="divide-y divide-border-light">
            {documents.map((document) => (
              <Link key={document.id} href={`/dashboard/files/${document.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-surface-secondary transition-colors">
                <span className="flex items-center gap-3 min-w-0">
                  <FileText className="w-4 h-4 text-text-muted flex-shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-text-primary truncate">{document.filename}</span>
                    <span className="block text-xs text-text-muted mt-1">{document.fileType.toUpperCase()} · {formatDate(document.createdAt)}</span>
                  </span>
                </span>
                <span className="text-xs text-text-secondary flex-shrink-0">{document.status}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="px-5 py-12 text-center text-sm text-text-secondary">这个知识空间还没有文件。</div>
        )}
      </div>
    </div>
  );
}
