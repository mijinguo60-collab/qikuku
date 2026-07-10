import { Database, Brain, Image } from 'lucide-react';

const caps = [
  {
    icon: Database,
    title: '企业知识库问答',
    desc: '让员工直接向企业资料提问，答案来自公司自己的文档、话术、制度和 SOP。每个回答都显示引用来源，不胡编乱造。',
  },
  {
    icon: Brain,
    title: '管理 Skill 增强问答',
    desc: '基于企业真实资料，叠加目标管理、组织效率、销售增长、战略定位等管理 Skill，输出诊断和行动计划。',
  },
  {
    icon: Image,
    title: 'AI 做图',
    desc: '像使用 ChatGPT Image 一样，用自然语言生成企业产品图、海报、封面和宣传素材。支持文生图和图片编辑。',
  },
];

export default function Capabilities() {
  return (
    <section className="max-w-7xl mx-auto px-6 py-24 md:py-32">
      <div className="text-center mb-16">
        <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">
          不是一个知识库，而是<br />企业 AI 工作系统
        </h2>
        <p className="text-text-secondary text-lg">三大核心能力，覆盖企业知识管理、决策支持和内容生产</p>
      </div>
      <div className="grid md:grid-cols-3 gap-6">
        {caps.map((c, i) => (
          <div key={i} className="card-hover p-8 animate-slide-up" style={{ animationDelay: `${i * 0.1}s` }}>
            <div className="w-12 h-12 rounded-2xl bg-surface-tertiary flex items-center justify-center mb-5">
              <c.icon className="w-6 h-6 text-text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-3">{c.title}</h3>
            <p className="text-sm text-text-secondary leading-relaxed">{c.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
