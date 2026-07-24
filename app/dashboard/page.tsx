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
    <div className="p-8 max-w-7xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary mb-1">欢迎回来，{user.name}</h1>
        <p className="text-sm text-text-secondary">
          {summary.companyName} 的知识库今天新增了 {summary.docCount} 条可调用知识
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4 mb-8"><div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: FileText, label: '文件总数', value: summary.docCount, color: 'text-accent-blue' },
          { icon: FolderOpen, label: '知识空间', value: summary.spaceCount, color: 'text-accent-purple' },
          { icon: Lightbulb, label: '可用 Skill', value: summary.skillCount, color: 'text-accent-cyan' },
          { icon: Brain, label: 'AI 就绪', value: '✓', color: 'text-success' },
        ].map((s, i) => (
          <div key={i} className="card p-5">
            <p className="text-xs text-text-muted mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div><DashboardCreditCard /></div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> 今日行业热点
          </h2>
          <p className="text-xs text-text-muted mb-3">基于企业行业与知识库，整理今天值得关注的话题</p>
          <div className="space-y-2">
            {todayTopics.map((topic) => (
              <Link
                key={topic.question}
                href={{ pathname: '/dashboard/chat', query: { q: topic.question } }}
                className="flex items-start justify-between gap-3 px-3 py-2.5 rounded-xl text-sm text-text-secondary hover:bg-surface-secondary hover:text-text-primary transition-all"
              >
                <span>{topic.title}</span>
                <ArrowUpRight className="w-4 h-4 flex-shrink-0 mt-0.5 text-text-muted" />
              </Link>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> 快捷操作
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { href: '/dashboard/chat', icon: MessageSquare, label: 'AI 对话', color: 'bg-accent-blue/10 text-accent-blue' },
              { href: '/dashboard/images', icon: Image, label: 'AI 做图', color: 'bg-accent-cyan/10 text-accent-cyan' },
              { href: '/dashboard/files', icon: FileText, label: '上传文件', color: 'bg-success/10 text-success' },
            ].map((a, i) => (
              <Link key={i} href={a.href}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white border border-border-light shadow-light hover:shadow-hover hover:border-border-medium transition-[box-shadow,border-color] duration-150 text-center">
                <div className={`w-10 h-10 rounded-xl ${a.color} flex items-center justify-center`}>
                  <a.icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-text-primary">{a.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
