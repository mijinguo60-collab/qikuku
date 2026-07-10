import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const steps = [
  { n:'01', t:'企业资料收集', d:'收集公司简介、组织架构、岗位职责、SOP、销售话术、产品介绍、案例资料。' },
  { n:'02', t:'知识空间规划', d:'规划知识空间分类：销售话术、客服FAQ、业务SOP、产品资料等。' },
  { n:'03', t:'资料导入与清洗', d:'上传资料，系统自动解析文本、切片、建立检索索引。' },
  { n:'04', t:'AI 问答与 Skill 配置', d:'配置知识库问答和管理Skill问答，导入话术和业务规则。' },
  { n:'05', t:'员工培训', d:'为不同岗位生成培训课程，帮助员工快速掌握系统。' },
  { n:'06', t:'上线使用与复盘', d:'正式上线，定期复盘知识库使用数据，持续补充企业资料。' },
];
const checklist = ['公司简介','组织架构','岗位职责','SOP','销售话术','客户FAQ','产品/服务介绍','案例资料','合同/报价模板','培训文档','常见问题','禁止对外披露资料清单'];

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-white"><Navbar />
    <section className="max-w-4xl mx-auto px-6 pt-24 pb-20">
      <h1 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">企业上线流程</h1>
      <p className="text-text-secondary mb-12">从资料收集到正式上线，标准交付流程约需 3-5 个工作日。</p>
      <div className="space-y-8 mb-16">
        {steps.map(s => <div key={s.n} className="flex gap-5"><div className="w-10 h-10 rounded-xl bg-surface-secondary flex items-center justify-center text-sm font-bold text-text-primary flex-shrink-0">{s.n}</div><div><h3 className="text-sm font-semibold text-text-primary mb-1">{s.t}</h3><p className="text-sm text-text-secondary leading-relaxed">{s.d}</p></div></div>)}
      </div>
      <h2 className="text-xl font-bold text-text-primary mb-6">资料准备清单</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {checklist.map(c => <div key={c} className="rounded-xl bg-surface-secondary px-4 py-3 text-sm text-text-secondary">✓ {c}</div>)}
      </div>
    </section><Footer /></main>
  );
}
