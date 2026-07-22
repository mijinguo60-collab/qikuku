import { getDb } from '@/lib/db';
import { getServerSession } from '@/lib/session';
import { FileText, Search, Filter, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import FileUploadButton from '@/components/dashboard/FileUploadButton';

interface RowData {
  id: string; filename: string; fileType: string; status: string;
  sensitivityLevel: string; spaceName: string; knowledgeSpaceId: string;
  companyId: string; createdAt: string; updatedAt: string;
}

const statusMap: Record<string, { label: string; color: string }> = {
  pending: { label: '待解析', color: 'bg-warning/10 text-warning' },
  parsing: { label: '解析中', color: 'bg-accent-blue/10 text-accent-blue' },
  indexed: { label: '已入库', color: 'bg-success/10 text-success' },
  failed: { label: '解析失败', color: 'bg-danger/10 text-danger' },
  expired: { label: '已过期', color: 'bg-text-muted/10 text-text-muted' },
};

const typeIcons: Record<string, string> = {
  pdf: '📄', docx: '📝', xlsx: '📊', pptx: '📑', md: '📋', txt: '📃', image: '🖼️',
};

export default async function FilesPage() {
  const user = await getServerSession();
  if (!user) return null;
  const db = getDb();

  const [files, spaces] = await Promise.all([
    db.prepare(
    `SELECT d.id,d.filename,d."fileType",d.status,d."sensitivityLevel",d."knowledgeSpaceId",d."companyId",d."createdAt",d."updatedAt",ks.name as "spaceName" FROM "Document" d
     JOIN "KnowledgeSpace" ks ON d."knowledgeSpaceId" = ks.id
     WHERE d."companyId" = ? ORDER BY d."createdAt" DESC LIMIT 100`
    ).all(user.companyId) as Promise<RowData[]>,
    db.prepare(
      `SELECT id, name FROM "KnowledgeSpace" WHERE "companyId" = ? ORDER BY "createdAt" DESC`
    ).all(user.companyId) as Promise<{ id: string; name: string }[]>,
  ]);

  return (
    <div className="p-8 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-text-primary mb-1">文件中心</h1>
          <p className="text-sm text-text-secondary">最近 {files.length} 个文件</p>
        </div>
        <FileUploadButton spaces={spaces} />
      </div>
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="input-primary pl-9" placeholder="搜索文件名..." />
        </div>
        <button className="btn-secondary text-sm flex items-center gap-1.5">
          <Filter className="w-4 h-4" /> 筛选
        </button>
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-light">
                <th className="text-left px-5 py-3 text-xs font-medium text-text-muted">文件名</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-text-muted">知识空间</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-text-muted">类型</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-text-muted">状态</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-text-muted">敏感等级</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {files.map((f: RowData) => {
                const st = statusMap[f.status] || { label: f.status, color: 'bg-gray-50 text-gray-500' };
                return (
                  <tr key={f.id} className="border-b border-border-light hover:bg-surface-secondary transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-base">{typeIcons[f.fileType] || '📁'}</span>
                        <Link href={`/dashboard/files/${f.id}`} className="text-text-primary font-medium hover:text-accent-blue transition-colors">{f.filename}</Link>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-text-secondary">{f.spaceName}</td>
                    <td className="px-5 py-3"><span className="text-xs text-text-muted uppercase">{f.fileType}</span></td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex text-[11px] px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
                    </td>
                    <td className="px-5 py-3 text-xs text-text-secondary">{f.sensitivityLevel}</td>
                    <td className="px-3 py-3">
                      <button className="p-1.5 rounded-lg hover:bg-surface-hover"><MoreHorizontal className="w-4 h-4 text-text-muted" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {files.length === 0 && (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 text-text-muted mx-auto mb-3" />
            <p className="text-text-secondary text-sm">暂无文件，上传第一份企业资料</p>
          </div>
        )}
      </div>
    </div>
  );
}
