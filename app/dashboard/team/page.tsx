'use client';

import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';

interface Member {
  membershipId: string;
  userId: string;
  name: string;
  email: string | null;
  membershipRole: string;
  membershipStatus: string;
  userStatus: string;
  joinedAt: string | null;
}

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/team', { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          setError(data?.error || '成员列表加载失败，请稍后重试');
          return;
        }
        setMembers(data?.members || []);
      } catch {
        setError('成员列表加载失败，请稍后重试');
      }
    })();
  }, []);

  return (
    <div className="p-8 max-w-5xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary mb-1">成员管理</h1>
        <p className="text-sm text-text-secondary">{members.length} 位成员</p>
      </div>
      <div className="card mb-6 flex gap-3 p-4 text-sm text-text-secondary">
        <Users className="mt-0.5 h-4 w-4 shrink-0 text-accent-blue" />
        <p>成员邀请功能即将开放，届时可通过邀请码或邀请链接邀请员工加入企业。</p>
      </div>
      {error ? <p className="mb-4 text-sm text-danger" role="alert">{error}</p> : null}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border-light">
            <th className="text-left px-5 py-3 text-xs font-medium text-text-muted">姓名</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-text-muted">邮箱</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-text-muted">企业角色</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-text-muted">成员状态</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-text-muted">加入时间</th>
          </tr></thead>
          <tbody>{members.map((member) => (
            <tr key={member.membershipId} className="border-b border-border-light hover:bg-surface-secondary">
              <td className="px-5 py-3 font-medium text-text-primary">{member.name}</td>
              <td className="px-5 py-3 text-text-secondary">{member.email || '未提供'}</td>
              <td className="px-5 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-surface-tertiary text-text-secondary">{member.membershipRole}</span></td>
              <td className="px-5 py-3 text-xs text-text-muted">{member.membershipStatus === 'active' && member.userStatus === 'active' ? '正常' : '不可用'}</td>
              <td className="px-5 py-3 text-xs text-text-muted">{member.joinedAt ? new Date(member.joinedAt).toLocaleDateString('zh-CN') : '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
