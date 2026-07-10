'use client';
import { useState } from 'react';
import { Store, Factory, Eye, GraduationCap, Calculator } from 'lucide-react';

const industries = [
  {
    icon: Store, title: '互联网新媒体行业',
    materials: '账号定位策略、内容选题库、爆款标题模板、短视频脚本模板、客户沟通话术、直播 SOP、交付流程说明、复盘模板',
    questions: '新员工怎么快速了解公司的内容生产流程？客户咨询内容服务时，标准回答是什么？一条短视频从选题到发布的流程是什么？直播前需要准备哪些标准动作？',
    skills: '帮负责人统一内容标准，提高团队交付一致性。帮团队沉淀爆款经验，减少重复试错。辅助制定培训流程与内容复盘机制。',
  },
  {
    icon: Factory, title: '工厂 / 制造业',
    materials: '产品参数表、工艺流程、质检标准、设备说明书、报价体系',
    questions: '产品参数怎么统一对外？客户要定制怎么快速报价？质检流程是否完善？',
    skills: '帮工厂分析利润结构、优化排产、建立岗位责任体系',
  },
  {
    icon: Eye, title: '医疗服务',
    materials: '科室服务介绍、常见咨询 FAQ、接诊流程、术前术后注意事项、客户回访话术、培训资料、标准服务 SOP',
    questions: '新员工怎么快速学习接诊与服务流程？客户常见问题应该如何统一回复？某类项目的术前准备和术后注意事项是什么？如何标准化客户接待与回访流程？',
    skills: '帮医疗服务团队统一服务标准和话术。辅助建立培训体系，提高新人上手速度。支持服务流程优化与客户体验提升。',
  },
  {
    icon: GraduationCap, title: '教育 / 培训机构',
    materials: '课程体系、教学SOP、招生话术、学员案例、师资介绍',
    questions: '家长问效果怎么证明？新课程怎么快速让销售掌握？',
    skills: '帮培训机构优化课程产品、建立招生-转化-续费闭环',
  },
  {
    icon: Calculator, title: '财税 / 咨询服务',
    materials: '服务清单、政策解读、客户案例、交付模板、合同范本',
    questions: '客户问最新政策怎么快速答复？交付流程如何标准化？',
    skills: '帮咨询公司建立知识资产壁垒、提升交付效率和客户满意度',
  },
];

export default function Industries() {
  const [selected, setSelected] = useState(0);

  return (
    <section className="max-w-7xl mx-auto px-6 py-24 md:py-32">
      <div className="text-center mb-16">
        <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">为你的行业定制</h2>
        <p className="text-text-secondary text-lg">不同的行业，同样的知识管理痛点</p>
      </div>

      <div className="flex flex-wrap justify-center gap-2 mb-10">
        {industries.map((ind, i) => (
          <button
            key={i}
            onClick={() => setSelected(i)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all ${
              selected === i
                ? 'bg-text-primary text-white shadow-light'
                : 'bg-surface-secondary text-text-secondary hover:text-text-primary'
            }`}
          >
            <ind.icon className="w-4 h-4" />
            {ind.title}
          </button>
        ))}
      </div>

      <div className="max-w-2xl mx-auto card p-6 animate-fade-in" key={selected}>
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">适合沉淀的资料</p>
            <p className="text-sm text-text-primary leading-relaxed">{industries[selected].materials}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">常用问答场景</p>
            <p className="text-sm text-text-primary leading-relaxed">{industries[selected].questions}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">管理 Skill 能帮什么</p>
            <p className="text-sm text-text-primary leading-relaxed">{industries[selected].skills}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
