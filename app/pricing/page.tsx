import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Link from 'next/link';

const plans = [
  {
    name: '基础版', desc: '面向小团队，快速搭建企业知识库',
    features: ['企业知识库', '文件上传与管理', '基础 AI 问答', '成员账号管理', '基础权限控制'],
    cta: '预约演示',
  },
  {
    name: '专业版', desc: '面向经营团队，AI 深度赋能业务',
    features: ['全部基础版功能', '多知识空间', '管理 Skill 增强问答', 'AI 图片生成', '销售话术库', '操作审计日志', '专属配置支持'],
    recommended: true,
    cta: '预约演示',
  },
  {
    name: '定制版', desc: '面向企业深度落地，专人定制',
    features: ['全部专业版功能', '专属知识库搭建', '业务流程梳理', '数据批量导入', '员工培训', '私有化部署咨询', '保密协议签署', '专属模型配置'],
    cta: '预约演示',
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <section className="max-w-7xl mx-auto px-6 pt-24 pb-20 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-4">价格方案</h1>
        <p className="text-lg text-text-secondary max-w-2xl mx-auto mb-14">选择适合你企业的方案，所有方案均可预约演示后最终定价</p>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map(p => (
            <div key={p.name} className={`rounded-2xl border p-8 text-left ${p.recommended ? 'border-text-primary shadow-hover' : 'border-border-light'}`}>
              {p.recommended && <span className="text-xs font-semibold text-text-primary bg-surface-tertiary px-3 py-1 rounded-full">推荐</span>}
              <h3 className="text-xl font-bold text-text-primary mt-4 mb-2">{p.name}</h3>
              <p className="text-sm text-text-secondary mb-6">{p.desc}</p>
              <ul className="space-y-3 mb-8">
                {p.features.map(f => <li key={f} className="text-sm text-text-secondary flex items-center gap-2">✓ {f}</li>)}
              </ul>
              <Link href="/contact" className={`block text-center py-3 rounded-xl text-sm font-medium transition-all ${p.recommended ? 'bg-text-primary text-white hover:opacity-90' : 'bg-surface-secondary text-text-primary hover:bg-surface-hover'}`}>
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>
      <Footer />
    </main>
  );
}
