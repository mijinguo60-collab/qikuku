'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Brain, LayoutDashboard, FolderOpen, FileText, MessageSquare, Lightbulb, Image, Library, PenTool, GraduationCap, TrendingUp, Headphones, Shield, Settings, LogOut, ChevronLeft, Users, BarChart3, Key, Wallet } from 'lucide-react';
import { isSidebarGroupVisible } from '@/lib/roles';
import { useState } from 'react';
import { useCreditBalance } from '@/hooks/useCreditBalance';

const menuGroups = [
  {
    label: '核心功能',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: '工作台' },
      { href: '/dashboard/knowledge-spaces', icon: FolderOpen, label: '知识空间' },
      { href: '/dashboard/files', icon: FileText, label: '文件中心' },
      { href: '/dashboard/chat', icon: MessageSquare, label: 'AI 对话' },
      { href: '/dashboard/skills', icon: Lightbulb, label: 'Skill 中心' },
      { href: '/dashboard/images', icon: Image, label: 'AI 做图' },
      { href: '/dashboard/assets', icon: Library, label: '图片素材库' },
      { href: '/dashboard/billing', icon: Wallet, label: '套餐与积分' },
    ],
  },
  {
    label: '业务工具',
    items: [
      { href: '/dashboard/content', icon: PenTool, label: '内容生成' },
      { href: '/dashboard/training', icon: GraduationCap, label: '员工培训' },
      { href: '/dashboard/sales', icon: TrendingUp, label: '销售助手' },
      { href: '/dashboard/support', icon: Headphones, label: '客服助手' },
    ],
  },
  {
    label: '管理',
    items: [
      { href: '/dashboard/settings', icon: Settings, label: '企业设置' },
      { href: '/dashboard/settings/models', icon: Brain, label: '模型状态' },
      { href: '/dashboard/team', icon: Users, label: '成员管理' },
      { href: '/dashboard/leads', icon: BarChart3, label: '线索管理' },
      { href: '/dashboard/permissions', icon: Key, label: '权限管理' },
      { href: '/dashboard/security', icon: Shield, label: '安全审计' },
    ],
  },
];

export default function Sidebar({ userRole: propRole }: { userRole?: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();

  const { totalBalance: creditBalance, loading: creditsLoading } = useCreditBalance();
  const userRole = propRole || '';
  const effectiveRole = userRole;

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/auth/login');
    router.refresh();
  }

  return (
    <aside className={`${collapsed ? 'w-16' : 'w-60'} h-screen sticky top-0 bg-surface-tertiary border-r border-border-light flex flex-col transition-all duration-200 flex-shrink-0 overflow-hidden`}>
      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2.5 px-4 h-14 border-b border-border-light flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-text-primary flex items-center justify-center flex-shrink-0">
          <Brain className="w-4 h-4 text-white" />
        </div>
        {!collapsed && <span className="text-sm font-bold text-text-primary whitespace-nowrap">企库库</span>}
      </Link>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {menuGroups.filter(g => isSidebarGroupVisible(effectiveRole, g.label)).map((group, gi) => (
          <div key={gi}>
            {!collapsed && <p className="px-3 mb-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider">{group.label}</p>}
            <div className="space-y-0.5">
              {group.items.map(item => {
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all ${
                      isActive
                        ? 'bg-white text-text-primary font-medium shadow-light'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                    }`}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="border-t border-border-light p-2 space-y-1">
        <Link href="/dashboard/billing" className={`block rounded-xl border px-3 py-3 transition-colors ${creditBalance < 1000 && !creditsLoading ? 'border-warning/30 bg-warning/10 text-warning' : 'border-border-light bg-white text-text-primary hover:bg-surface-hover'}`} title={collapsed ? `AI 算力积分 ${creditsLoading ? '…' : creditBalance.toLocaleString()}` : undefined}>
          {collapsed ? <Wallet className="w-5 h-5 mx-auto" /> : <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-accent-blue/10 flex items-center justify-center"><Wallet className="w-4 h-4 text-accent-blue" /></div><div className="min-w-0"><p className="text-[10px] text-text-muted">AI 算力积分</p><p className="text-lg leading-5 font-bold">{creditsLoading ? '—' : creditBalance.toLocaleString()}</p><p className="text-[10px] text-text-muted">点击查看套餐与充值</p></div></div>}
        </Link>
        <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all w-full">
          <ChevronLeft className={`w-4 h-4 flex-shrink-0 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          {!collapsed && <span className="whitespace-nowrap">收起菜单</span>}
        </button>
        <button onClick={handleLogout} className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-text-muted hover:text-danger hover:bg-danger/5 transition-all w-full text-left">
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span className="whitespace-nowrap">退出登录</span>}
        </button>
      </div>
    </aside>
  );
}
