import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';
import { FolderOpen, FileText, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';

interface SpaceRow {
  id: string; companyId: string; name: string; description: string | null;
  isAiEnabled: number; visibility: string; createdAt: string; updatedAt: string; fileCount: number;
}

export default function KnowledgeSpacesPage() {
  const cookie = cookies().get('qikuku_user');
  if (!cookie) return null;
  const user = JSON.parse(cookie.value);
  const db = getDb();

  const spaces = db.prepare(
    'SELECT ks.*, (SELECT COUNT(*) FROM "Document" d WHERE d.knowledgeSpaceId = ks.id) as fileCount FROM "KnowledgeSpace" ks WHERE ks.companyId = ? ORDER BY ks.createdAt DESC'
  ).all(user.companyId) as SpaceRow[];

  return (
    <div className="p-8 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div><h1 className="text-2xl font-bold text-text-primary mb-1">知识空间</h1>
          <p className="text-sm text-text-secondary">{spaces.length} 个知识空间</p></div>
        <button className="btn-primary text-sm">创建空间</button>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {spaces.map((space: SpaceRow) => (
          <Link key={space.id} href={`/dashboard/knowledge-spaces/${space.id}`} className="card-hover p-5 group">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-surface-tertiary flex items-center justify-center">
                <FolderOpen className="w-5 h-5 text-text-secondary" />
              </div>
              <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-surface-hover transition-all">
                <MoreHorizontal className="w-4 h-4 text-text-muted" />
              </button>
            </div>
            <h3 className="text-sm font-semibold text-text-primary mb-1">{space.name}</h3>
            {space.description && <p className="text-xs text-text-muted mb-3 line-clamp-2">{space.description}</p>}
            <div className="flex items-center gap-4 text-xs text-text-muted">
              <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {space.fileCount} 个文件</span>
              {space.isAiEnabled ? <span className="text-success">AI 已启用</span> : <span className="text-text-muted">AI 已关闭</span>}
            </div>
          </Link>
        ))}
      </div>
      {spaces.length === 0 && (
        <div className="text-center py-20">
          <FolderOpen className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <p className="text-text-secondary">暂无知识空间，创建第一个空间开始管理企业知识</p>
        </div>
      )}
    </div>
  );
}
