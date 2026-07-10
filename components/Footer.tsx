import Link from 'next/link';
import { Brain } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-border-light bg-surface-secondary">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-text-primary flex items-center justify-center">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-base font-bold">企库库</span>
                <span className="block text-[10px] text-text-muted">QiKuKu AI Brain</span>
              </div>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed max-w-xs">
              把企业知识变成可调用的AI大脑。企业知识库 + 管理Skill增强问答 + AI做图。
            </p>
          </div>
          {[
            { title: '产品', items: ['知识库问答', '管理Skill', 'AI做图', '内容生成'] },
            { title: '资源', items: ['帮助中心', 'API文档', '更新日志', '联系我们'] },
            { title: '法律', items: ['隐私政策', '服务条款', '数据处理协议'] },
          ].map(g => (
            <div key={g.title}>
              <h4 className="text-sm font-semibold text-text-primary mb-3">{g.title}</h4>
              <ul className="space-y-2">
                {g.items.map(i => (
                  <li key={i}><Link href="#" className="text-sm text-text-secondary hover:text-text-primary transition-colors">{i}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 pt-6 border-t border-border-light text-center text-xs text-text-muted">
          © 2026 企库库 QiKuKu AI Brain. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
