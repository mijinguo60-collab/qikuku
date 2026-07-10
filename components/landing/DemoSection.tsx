'use client';
import { useState } from 'react';
import { FileText, Brain } from 'lucide-react';

export default function DemoSection() {
  const [tab, setTab] = useState(0);

  return (
    <section id="knowledge-base" className="bg-surface-secondary border-y border-border-light scroll-mt-20">
      <div className="max-w-7xl mx-auto px-6 py-24 md:py-32">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">看看企库库怎么工作</h2>
          <p className="text-text-secondary text-lg">两个模式，覆盖从日常问答到管理决策的所有场景</p>
        </div>

        <div id="manage-skill" className="flex justify-center gap-2 mb-10 scroll-mt-20">
          {['基础知识库问答', '管理 Skill 增强问答'].map((t, i) => (
            <button
              key={i}
              onClick={() => setTab(i)}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                tab === i
                  ? 'bg-white text-text-primary shadow-light border border-border-light'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="max-w-3xl mx-auto card p-6 animate-fade-in" key={tab}>
          {tab === 0 ? (
            <>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-full bg-accent-purple/10 flex items-center justify-center">
                  <span className="text-[11px] font-bold text-accent-purple">AI</span>
                </div>
                <span className="text-sm font-medium">基础知识库问答</span>
              </div>
              <div className="bg-surface-tertiary rounded-2xl p-4 mb-4">
                <p className="text-sm text-text-secondary mb-2">示例问题：</p>
                <p className="text-sm font-medium text-text-primary">“新员工上手慢、企业知识分散，怎么建立一套可复用的标准知识体系？”</p>
              </div>
              <div className="bg-surface-tertiary rounded-2xl p-5">
                <p className="text-sm font-medium mb-3">AI 基于企业知识库资料回答：</p>
                <p className="text-sm text-text-secondary leading-relaxed mb-3">
                  可以先把企业内部高频使用的信息分成几类：产品资料、服务流程、常见问题、销售话术、培训 SOP、管理制度。然后统一沉淀进知识库，按主题分类，再通过 AI 问答调用。这样新员工遇到问题时可以直接提问，快速获取标准答案；管理层也能把原本分散在文档、聊天记录和老员工经验里的知识，变成可以重复复用的企业资产。
                </p>
                <div className="flex items-center gap-3 pt-3 border-t border-border-light">
                  <span className="flex items-center gap-1 text-[11px] text-text-muted">
                    <FileText className="w-3 h-3" /> 来源：产品资料、培训 SOP、管理制度
                  </span>
                  <span className="text-[11px] text-text-muted">可信度：高</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-full bg-accent-blue/10 flex items-center justify-center">
                  <span className="text-[11px] font-bold text-accent-blue">AI</span>
                </div>
                <span className="text-sm font-medium">管理 Skill 增强问答</span>
                <span className="text-[11px] text-text-muted ml-2 px-2 py-0.5 rounded-full bg-surface-tertiary">
                  使用：目标与贡献管理 Skill
                </span>
              </div>
              <div className="bg-surface-tertiary rounded-2xl p-4 mb-4">
                <p className="text-sm text-text-secondary mb-2">示例问题：</p>
                <p className="text-sm font-medium text-text-primary">"销售团队执行力差，应该怎么解决？"</p>
              </div>
              <div className="bg-surface-tertiary rounded-2xl p-5 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-accent-blue uppercase tracking-wide mb-1">结论先行</p>
                  <p className="text-sm text-text-primary">销售团队执行力的核心问题不在于"销售不愿意干"，而是目标不清晰、过程无跟踪、结果无复盘。</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-accent-blue uppercase tracking-wide mb-1">基于企业资料看到的事实</p>
                  <p className="text-sm text-text-secondary">根据贵公司销售话术资料和客户案例，销售人员缺少标准化的跟进流程和明确的转化指标。</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-accent-blue uppercase tracking-wide mb-1">根因分析</p>
                  <p className="text-sm text-text-secondary">1. 销售目标未分解到周/日 2. 缺少每日复盘机制 3. 话术与客户场景未对齐</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-accent-blue uppercase tracking-wide mb-1">30天行动计划</p>
                  <div className="space-y-2 text-sm text-text-secondary">
                    <div className="flex gap-2"><span className="text-text-primary font-medium">第1周</span>明确周目标、建立日报制度</div>
                    <div className="flex gap-2"><span className="text-text-primary font-medium">第2周</span>优化话术匹配度、开始每日10分钟站会</div>
                    <div className="flex gap-2"><span className="text-text-primary font-medium">第3-4周</span>跟踪转化率、复盘调整、建立奖励机制</div>
                  </div>
                </div>
                <div className="pt-3 border-t border-border-light flex items-center gap-3">
                  <span className="flex items-center gap-1 text-[11px] text-text-muted">
                    <FileText className="w-3 h-3" /> 来源：销售话术、客户案例、业务SOP
                  </span>
                  <span className="text-[11px] text-text-muted">Skill：目标与贡献管理</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
