import { getDashboardSummary, getTodayIndustryTopics } from '@/lib/dashboard-data';
import { Brain, FileText, FolderOpen, MessageSquare, Image, TrendingUp, Lightbulb, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { getServerSession } from '@/lib/session';
import DashboardCreditCard from '@/components/billing/DashboardCreditCard';

export default async function DashboardPage() {
  const user = await getServerSession();
  if (!user) return null;
  const summary = await getDashboardSummary(user.companyId);
  const todayTopics = getTodayIndustryTopics(summary.companyIndustry);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="page-title">欢迎回来，{user.name}</h1>
        <p className="page-subtitle mt-1">
          {summary.companyName} · 知识库今日新增 {summary.docCount} 条知识
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { icon: FileText, label: '文件总数', value: summary.docCount, color: 'text-accent-blue' },
          { icon: FolderOpen, label: '知识空间', value: summary.spaceCount, color: 'text-accent-purple' },
          { icon: Lightbulb, label: '可用 Skill', value: summary.skillCount, color: 'text-accent-cyan' },
          { icon: Brain, label: 'AI 就绪', value: '✓', color: 'text-success' },
        ].map((s, i) => (
          <div key={i} className="card p-4">
            <div className={`w-7 h-7 rounded-md ${s.color.replace('text-', 'bg-')}/10 flex items-center justify-center mb-2`}>
              <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
            </div>
            <p className="text-[11px] text-text-muted">{s.label}</p>
            <p className={`text-xl font-semibold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Two column layout */}
      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        {/* Hot Topics */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> 今日行业热点
          </h2>
          <p className="text-[11px] text-text-muted mb-4">基于企业行业与知识库整理的关注话题</p>
          <div className="space-y-px">
            {todayTopics.map((topic) => (
              <Link
                key={topic.question}
                href={{ pathname: '/dashboard/chat', query: { q: topic.question } }}
                className="flex items-start justify-between gap-3 px-3 py-2.5 rounded-md text-[13px] text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
              >
                <span>{topic.title}</span>
                <ArrowUpRight className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-text-muted" />
              </Link>
            ))}
          </div>
        </div>

        {/* Quick Actions & Credit */}
        <div className="space-y-4">
          <DashboardCreditCard />
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-text-primary mb-3">快捷操作</h2>
            <div className="grid grid-cols-3 gap-2">
              {[
                { href: '/dashboard/chat', icon: MessageSquare, label: 'AI 对话', color: 'bg-accent-blue/10 text-accent-blue' },
                { href: '/dashboard/images', icon: Image, label: 'AI 做图', color: 'bg-accent-cyan/10 text-accent-cyan' },
                { href: '/dashboard/files', icon: FileText, label: '上传文件', color: 'bg-success/10 text-success' },
              ].map((a, i) => (
                <Link key={i} href={a.href}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-md bg-white border border-border-light hover:shadow-hover hover:border-border-medium transition-[box-shadow,border-color] duration-150 text-center">
                  <div className={`w-8 h-8 rounded-md ${a.color} flex items-center justify-center`}>
                    <a.icon className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-medium text-text-primary">{a.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
