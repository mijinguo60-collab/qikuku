'use client';
import { useState, useEffect } from 'react';
import { Plus, Shield, UserPlus, Loader2 } from 'lucide-react';

const ROLES = [
  { id: 'manager', label: '主管' }, { id: 'staff', label: '员工' },
  { id: 'sales', label: '销售' }, { id: 'content', label: '内容' },
  { id: 'readonly', label: '只读' },
];

interface Member { id: string; name: string; email: string; role: string; status: string; createdAt: string; }

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'staff' });
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchMembers(); }, []);

  async function fetchMembers() {
    const res = await fetch('/api/team');
    if (res.ok) { const data = await res.json(); setMembers(data.members || []); }
  }

  async function handleAdd() {
    if (!form.name || !form.email || !form.password) return;
    setLoading(true);
    const res = await fetch('/api/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (res.ok) { setShowAdd(false); setForm({ name: '', email: '', password: '', role: 'staff' }); fetchMembers(); }
    setLoading(false);
  }

  async function handleDisable(userId: string) {
    await fetch('/api/team', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, disabled: true }) });
    fetchMembers();
  }

  return (
    <div className="p-8 max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div><h1 className="text-2xl font-bold text-text-primary mb-1">成员管理</h1><p className="text-sm text-text-secondary">{members.length} 位成员</p></div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary text-sm flex items-center gap-1.5"><Plus className="w-4 h-4" /> 添加成员</button>
      </div>

      {showAdd && (
        <div className="card p-6 mb-6">
          <h3 className="text-sm font-semibold mb-4">新成员</h3>
          <div className="grid grid-cols-2 gap-4">
            <input className="input-primary" placeholder="姓名" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            <input className="input-primary" placeholder="邮箱" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
            <input className="input-primary" type="password" placeholder="初始密码" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
            <select className="input-primary" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
              {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowAdd(false)} className="btn-secondary text-sm">取消</button>
            <button onClick={handleAdd} disabled={loading} className="btn-primary text-sm flex items-center gap-1.5">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} 创建</button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border-light">
            <th className="text-left px-5 py-3 text-xs font-medium text-text-muted">姓名</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-text-muted">邮箱</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-text-muted">角色</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-text-muted">加入时间</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-text-muted">操作</th>
          </tr></thead>
          <tbody>
            {members.map((m: Member) => (
              <tr key={m.id} className="border-b border-border-light hover:bg-surface-secondary">
                <td className="px-5 py-3 font-medium text-text-primary">{m.name}</td>
                <td className="px-5 py-3 text-text-secondary">{m.email}</td>
                <td className="px-5 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-surface-tertiary text-text-secondary">{m.role}</span></td>
                <td className="px-5 py-3 text-xs text-text-muted">{new Date(m.createdAt).toLocaleDateString('zh-CN')}</td>
                <td className="px-5 py-3">{m.status === 'active' && <button onClick={() => handleDisable(m.id)} className="text-xs text-danger hover:underline">禁用</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
