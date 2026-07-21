'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Users } from 'lucide-react';

type Member = { membershipId: string; userId: string; name: string; maskedPhone: string; membershipRole: string; membershipStatus: string; userStatus: string; joinedAt: string | null };
type Invitation = { id: string; inviteCode: string; inviteUrl: string; maskedPhone: string; expiresAt: string; status: string; createdAt: string };
const roleLabel = (role: string) => role === 'owner' ? '创始人' : role === 'member' ? '员工' : role;
const invitationStatus = (status: string) => ({ active: '待接受', accepted: '已接受', revoked: '已撤销', expired: '已过期' }[status] || status);

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [memberLimit, setMemberLimit] = useState(0);
  const [activeMemberCount, setActiveMemberCount] = useState(0);
  const [phone, setPhone] = useState('');
  const [created, setCreated] = useState<Invitation | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const [membersResponse, invitationsResponse] = await Promise.all([fetch('/api/team', { cache: 'no-store' }), fetch('/api/team/invitations', { cache: 'no-store' })]);
    const membersData = await membersResponse.json().catch(() => null);
    const invitationsData = await invitationsResponse.json().catch(() => null);
    if (!membersResponse.ok || !invitationsResponse.ok) throw new Error(membersData?.error || invitationsData?.error || '成员信息加载失败，请稍后重试');
    setMembers(membersData?.members || []);
    setInvitations(invitationsData?.invitations || []);
    setMemberLimit(Number(invitationsData?.memberLimit || 0));
    setActiveMemberCount(Number(invitationsData?.activeMemberCount || 0));
  }, []);

  useEffect(() => { void load().catch((reason: Error) => setError(reason.message)); }, [load]);

  async function createInvitation(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice(''); setLoading(true);
    try {
      const response = await fetch('/api/team/invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || '创建邀请失败，请稍后重试');
      setCreated(data.invitation); setPhone(''); setNotice('邀请已生成，7 天内有效。'); await load();
    } catch (reason: any) { setError(reason?.message || '创建邀请失败，请稍后重试'); }
    finally { setLoading(false); }
  }

  async function revoke(invitation: Invitation) {
    setError(''); setNotice('');
    try {
      const response = await fetch(`/api/team/invitations/${invitation.id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || '撤销邀请失败，请稍后重试');
      setNotice('邀请已撤销。'); await load();
    } catch (reason: any) { setError(reason?.message || '撤销邀请失败，请稍后重试'); }
  }

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice('已复制到剪贴板。'); }
    catch { setError('复制失败，请手动复制。'); }
  }

  return <div className="p-8 max-w-5xl mx-auto animate-fade-in">
    <div className="mb-8"><h1 className="text-2xl font-bold text-text-primary mb-1">成员管理</h1><p className="text-sm text-text-secondary">{activeMemberCount} / {memberLimit || '—'} 位成员</p></div>
    <form onSubmit={createInvitation} className="card mb-6 p-5"><div className="flex items-start gap-3"><Users className="mt-1 h-5 w-5 shrink-0 text-accent-blue" /><div className="flex-1"><h2 className="font-medium text-text-primary">邀请员工</h2><p className="mt-1 text-sm text-text-secondary">指定手机号后生成一次性邀请，员工验证成功后将加入当前企业。</p><div className="mt-4 flex flex-col gap-3 sm:flex-row"><input value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={11} className="input-primary flex-1" placeholder="请输入员工中国大陆手机号" /><button className="btn-primary shrink-0 px-5" disabled={loading}>{loading ? '生成中' : '生成邀请'}</button></div></div></div></form>
    {created ? <div className="card mb-6 p-5 text-sm"><p className="font-medium text-text-primary">邀请已生成：{created.maskedPhone}</p><p className="mt-2 text-text-secondary">邀请码：<code className="font-mono text-text-primary">{created.inviteCode}</code> <button className="text-accent-blue" onClick={() => void copy(created.inviteCode)}>复制邀请码</button></p><p className="mt-1 break-all text-text-secondary">邀请链接：{created.inviteUrl} <button className="text-accent-blue" onClick={() => void copy(`${window.location.origin}${created.inviteUrl}`)}>复制链接</button></p><p className="mt-2 text-xs text-text-muted">7 天有效，至 {new Date(created.expiresAt).toLocaleString('zh-CN')}</p></div> : null}
    {notice ? <p className="mb-4 text-sm text-success" role="status">{notice}</p> : null}{error ? <p className="mb-4 text-sm text-danger" role="alert">{error}</p> : null}
    <div className="card mb-6 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border-light"><th className="text-left px-5 py-3 text-xs font-medium text-text-muted">姓名</th><th className="text-left px-5 py-3 text-xs font-medium text-text-muted">手机号</th><th className="text-left px-5 py-3 text-xs font-medium text-text-muted">企业角色</th><th className="text-left px-5 py-3 text-xs font-medium text-text-muted">成员状态</th><th className="text-left px-5 py-3 text-xs font-medium text-text-muted">加入时间</th></tr></thead><tbody>{members.map((member) => <tr key={member.membershipId} className="border-b border-border-light hover:bg-surface-secondary"><td className="px-5 py-3 font-medium text-text-primary">{member.name}</td><td className="px-5 py-3 text-text-secondary">{member.maskedPhone}</td><td className="px-5 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-surface-tertiary text-text-secondary">{roleLabel(member.membershipRole)}</span></td><td className="px-5 py-3 text-xs text-text-muted">{member.membershipStatus === 'active' && member.userStatus === 'active' ? '正常' : '不可用'}</td><td className="px-5 py-3 text-xs text-text-muted">{member.joinedAt ? new Date(member.joinedAt).toLocaleDateString('zh-CN') : '—'}</td></tr>)}</tbody></table></div>
    <div className="card overflow-x-auto"><div className="border-b border-border-light px-5 py-4 font-medium text-text-primary">邀请记录</div><table className="w-full text-sm"><thead><tr className="border-b border-border-light"><th className="text-left px-5 py-3 text-xs font-medium text-text-muted">手机号</th><th className="text-left px-5 py-3 text-xs font-medium text-text-muted">邀请码</th><th className="text-left px-5 py-3 text-xs font-medium text-text-muted">状态</th><th className="text-left px-5 py-3 text-xs font-medium text-text-muted">到期时间</th><th className="px-5 py-3" /></tr></thead><tbody>{invitations.map((invitation) => <tr key={invitation.id} className="border-b border-border-light"><td className="px-5 py-3">{invitation.maskedPhone}</td><td className="px-5 py-3 font-mono">{invitation.inviteCode}</td><td className="px-5 py-3 text-text-secondary">{invitationStatus(invitation.status)}</td><td className="px-5 py-3 text-xs text-text-muted">{new Date(invitation.expiresAt).toLocaleString('zh-CN')}</td><td className="px-5 py-3 text-right">{invitation.status === 'active' ? <button className="text-sm text-danger" onClick={() => void revoke(invitation)}>撤销</button> : null}</td></tr>)}</tbody></table></div>
  </div>;
}
