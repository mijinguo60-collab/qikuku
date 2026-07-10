import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const items = [
  { t: '企业空间隔离', d: '每个企业拥有独立的数据空间和权限体系，数据完全隔离，互不可见。' },
  { t: '角色权限控制', d: '超管、管理员、主管、员工、访客五级权限，精细控制数据访问和操作范围。' },
  { t: '文件对象存储', d: '文件存储于 Vercel Blob 或企业自有对象存储，不在本地系统散落。' },
  { t: '操作审计', d: '完整记录每一次知识库访问、AI 问答、文件操作，可追溯、可审计。' },
  { t: '模型 Key 服务端管理', d: '所有 AI 模型的 API Key 配置于服务端环境变量，前端不暴露任何密钥。' },
  { t: '可签保密协议', d: '支持签署 NDA 保密协议，保障企业数据安全和商业机密。' },
];

export default function SecurityPage() {
  return (
    <main className="min-h-screen bg-white"><Navbar />
    <section className="max-w-4xl mx-auto px-6 pt-24 pb-20">
      <h1 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">数据安全</h1>
      <p className="text-text-secondary mb-12">企业数据安全是我们的底线。以下是企库库的安全保障体系。</p>
      <div className="grid md:grid-cols-2 gap-6">
        {items.map(i => <div key={i.t} className="rounded-2xl bg-surface-secondary p-6"><h3 className="text-sm font-semibold text-text-primary mb-2">{i.t}</h3><p className="text-sm text-text-secondary leading-relaxed">{i.d}</p></div>)}
      </div>
    </section><Footer /></main>
  );
}
