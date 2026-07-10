import { Image, Download, Trash2, Search } from 'lucide-react';

export default function AssetsPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-text-primary mb-1">图片素材库</h1>
          <p className="text-sm text-text-secondary">管理和复用生成的图片素材</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input className="input-primary pl-9 w-60 text-sm" placeholder="搜索素材..." />
          </div>
        </div>
      </div>

      <div className="text-center py-20">
        <Image className="w-12 h-12 text-text-muted mx-auto mb-4" />
        <p className="text-text-secondary">暂无生成的图片素材</p>
        <p className="text-xs text-text-muted mt-1">使用 AI 做图功能生成图片后，保存的图片会出现在这里</p>
      </div>
    </div>
  );
}
