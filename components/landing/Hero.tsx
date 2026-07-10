import Link from 'next/link';
import { ArrowRight, Play, Database, Brain, MessageSquare, FileText } from 'lucide-react';

export default function Hero() {
  return (
    <section className="max-w-7xl mx-auto px-6 pt-20 pb-24 md:pt-28 md:pb-32">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-tertiary text-xs text-text-secondary mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          全新企业AI知识库系统
        </div>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-text-primary leading-tight mb-6 tracking-tight">
          把企业知识，变成<br />可调用的<span className="text-accent-blue"> AI 大脑</span>
        </h1>
        <p className="text-lg text-text-secondary leading-relaxed max-w-2xl mx-auto mb-10">
          企库库帮助企业沉淀资料、统一话术、训练员工、辅助管理决策，并用 AI 生成企业所需的图文内容。
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/auth/register" className="btn-primary text-[15px] px-6 py-3 rounded-xl flex items-center gap-2">
            创建企业知识库 <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="#demo" className="btn-secondary text-[15px] px-6 py-3 rounded-xl flex items-center gap-2">
            <Play className="w-4 h-4" /> 查看产品演示
          </Link>
        </div>
      </div>

      {/* Product Mockup */}
      <div className="max-w-5xl mx-auto">
        <div className="card p-1 overflow-hidden shadow-hover">
          <div className="bg-surface-secondary rounded-xl p-3 flex items-center gap-2 border-b border-border-light">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-danger/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-warning/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-success/60" />
            </div>
            <span className="text-[11px] text-text-muted ml-2">企库库 AI Brain — 企业工作台</span>
          </div>
          <div className="flex h-[500px]">
            {/* Sidebar mockup */}
            <div className="w-56 bg-surface-secondary border-r border-border-light p-4 flex flex-col gap-3 flex-shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-md bg-text-primary flex items-center justify-center">
                  <Brain className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-xs font-semibold">诸城吃喝玩乐</span>
              </div>
              {['工作台', '知识空间', 'AI 问答', '管理 Skill', 'AI 做图', '设置'].map((item, i) => (
                <div key={item} className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs ${i === 2 ? 'bg-white shadow-light text-text-primary font-medium' : 'text-text-secondary'}`}>
                  <div className={`w-4 h-4 rounded ${i === 2 ? 'bg-accent-blue/20' : 'bg-border-light'}`} />
                  {item}
                </div>
              ))}
            </div>
            {/* Content mockup */}
            <div className="flex-1 p-6 flex flex-col">
              <div className="flex-1 overflow-y-auto space-y-4 max-w-2xl">
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-accent-purple/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-accent-purple">AI</span>
                  </div>
                  <div className="bg-surface-secondary rounded-2xl rounded-tl-md px-4 py-3 max-w-[80%]">
                    <p className="text-sm text-text-primary">你好！我是企库库 AI。可以向我提问关于企业知识的任何问题。试试这些问题：</p>
                    <div className="mt-3 space-y-2">
                      <div className="bg-white rounded-xl px-3 py-2 text-xs text-text-secondary cursor-pointer hover:bg-surface-hover transition-colors">📋 客户嫌我们的代运营服务太贵了，怎么回复？</div>
                      <div className="bg-white rounded-xl px-3 py-2 text-xs text-text-secondary cursor-pointer hover:bg-surface-hover transition-colors">📊 销售团队执行力差，问题在哪里？</div>
                      <div className="bg-white rounded-xl px-3 py-2 text-xs text-text-secondary cursor-pointer hover:bg-surface-hover transition-colors">📝 帮我制定新员工的培训计划</div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 justify-end">
                  <div className="bg-text-primary text-white rounded-2xl rounded-tr-md px-4 py-3 max-w-[80%]">
                    <p className="text-sm">客户嫌我们的代运营服务太贵了，怎么回复？</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-accent-purple/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-accent-purple">AI</span>
                  </div>
                  <div className="space-y-3 max-w-[85%]">
                    <div className="bg-surface-secondary rounded-2xl rounded-tl-md px-4 py-3">
                      <p className="text-sm font-medium mb-2">基于企业销售话术资料，建议如下回复：</p>
                      <p className="text-sm text-text-secondary leading-relaxed">"我理解您的顾虑。让我帮您算一笔账：您一个火锅店客户平均消费100元，我们合作过的火锅店平均每月新增200+桌客人，也就是2万+的增量营收。我们的服务费只占不到5%..."</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <div className="flex items-center gap-1"><FileText className="w-3 h-3" /><span>来源：本地生活商家销售话术.docx</span></div>
                      <span>·</span>
                      <span>可信度：高</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* Input mockup */}
              <div className="mt-4 flex items-center gap-2 bg-white border border-border-medium rounded-3xl px-5 py-3">
                <span className="text-xs text-text-muted flex-1">输入问题，基于企业知识库回答...</span>
                <div className="w-8 h-8 rounded-full bg-text-primary flex items-center justify-center">
                  <ArrowRight className="w-4 h-4 text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
