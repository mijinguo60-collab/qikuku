import { getServerSession } from '@/lib/session';
import Link from 'next/link';
import { Download, Image as ImageIcon } from 'lucide-react';
import { getDb } from '@/lib/db';

interface ImageAsset {
  id: string;
  prompt: string;
  imageUrl: string;
  aspectRatio: string | null;
  createdAt: string | Date;
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function AssetsPage() {
  const user = await getServerSession();
  if (!user) return null;

  const assets = await getDb().prepare(
    `SELECT id, prompt, "imageUrl", "aspectRatio", "createdAt"
     FROM "ImageGeneration"
     WHERE "companyId" = ? AND status = 'completed' AND "imageUrl" IS NOT NULL
     ORDER BY "createdAt" DESC`
  ).all(user.companyId) as ImageAsset[];

  return (
    <div className="p-8 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div><h1 className="text-2xl font-bold text-text-primary mb-1">图片素材库</h1><p className="text-sm text-text-secondary">{assets.length} 张由企业 AI 做图生成的图片素材</p></div>
        <Link href="/dashboard/images" className="btn-primary text-sm">去 AI 做图</Link>
      </div>

      {assets.length ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {assets.map((asset) => (
            <div key={asset.id} className="card overflow-hidden">
              <a href={asset.imageUrl} target="_blank" rel="noreferrer" className="block bg-surface-secondary aspect-square"><img src={asset.imageUrl} alt={asset.prompt.slice(0, 80)} className="w-full h-full object-cover" /></a>
              <div className="p-4">
                <p className="text-sm text-text-primary line-clamp-2 min-h-10">{asset.prompt}</p>
                <div className="flex items-center justify-between gap-3 mt-3"><span className="text-[11px] text-text-muted">{asset.aspectRatio || '1:1'} · {formatDate(asset.createdAt)}</span><a href={asset.imageUrl} target="_blank" rel="noreferrer" download className="p-1.5 rounded-lg hover:bg-surface-hover text-text-muted" aria-label="下载图片"><Download className="w-4 h-4" /></a></div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20"><ImageIcon className="w-12 h-12 text-text-muted mx-auto mb-4" /><p className="text-text-secondary">还没有生成图片，去 AI 做图创建第一张企业图片。</p><Link href="/dashboard/images" className="btn-secondary text-sm inline-flex mt-5">去 AI 做图</Link></div>
      )}
    </div>
  );
}
