'use client';
import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

const STATUSES = ['new','contacted','demo_scheduled','closed'];
const statusLabels: Record<string,string> = { new:'新线索', contacted:'已联系', demo_scheduled:'已约演示', closed:'已关闭' };
const statusColors: Record<string,string> = { new:'bg-accent-blue/10 text-accent-blue', contacted:'bg-warning/10 text-warning', demo_scheduled:'bg-success/10 text-success', closed:'bg-text-muted/10 text-text-muted' };

interface Lead { id:string; companyName:string; contactName:string; contact:string; industry:string; teamSize:string; painPoint:string; status:string; createdAt:string; }

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchLeads(); }, []);

  async function fetchLeads() {
    const res = await fetch('/api/admin/leads');
    if (res.ok) { const data = await res.json(); setLeads(data.leads||[]); }
    setLoading(false);
  }

  async function updateStatus(leadId: string, status: string) {
    await fetch('/api/admin/leads', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ leadId, status }) });
    fetchLeads();
  }

  return (
    <div className="p-8 max-w-6xl mx-auto animate-fade-in">
      <h1 className="text-2xl font-bold text-text-primary mb-1">线索管理</h1>
      <p className="text-sm text-text-secondary mb-8">{leads.length} 条咨询线索</p>
      {loading ? <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-text-muted"/></div> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-border-light">
              <th className="text-left px-4 py-3 font-medium text-text-muted">企业</th>
              <th className="text-left px-4 py-3 font-medium text-text-muted">联系人</th>
              <th className="text-left px-4 py-3 font-medium text-text-muted">联系方式</th>
              <th className="text-left px-4 py-3 font-medium text-text-muted">行业</th>
              <th className="text-left px-4 py-3 font-medium text-text-muted">痛点</th>
              <th className="text-left px-4 py-3 font-medium text-text-muted">状态</th>
              <th className="text-left px-4 py-3 font-medium text-text-muted">时间</th>
            </tr></thead>
            <tbody>
              {leads.map(l => (
                <tr key={l.id} className="border-b border-border-light hover:bg-surface-secondary">
                  <td className="px-4 py-3 font-medium text-text-primary">{l.companyName}</td>
                  <td className="px-4 py-3 text-text-secondary">{l.contactName}</td>
                  <td className="px-4 py-3 text-text-secondary">{l.contact}</td>
                  <td className="px-4 py-3 text-text-secondary">{l.industry||'-'}</td>
                  <td className="px-4 py-3 text-text-secondary max-w-[200px] truncate">{l.painPoint||'-'}</td>
                  <td className="px-4 py-3"><select value={l.status} onChange={e=>updateStatus(l.id, e.target.value)} className={`text-[11px] px-2 py-1 rounded-full font-medium outline-none ${statusColors[l.status]||''}`}>
                    {STATUSES.map(s=><option key={s} value={s}>{statusLabels[s]}</option>)}
                  </select></td>
                  <td className="px-4 py-3 text-text-muted">{new Date(l.createdAt).toLocaleDateString('zh-CN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {leads.length===0 && <div className="text-center py-12 text-text-muted text-sm">暂无咨询线索</div>}
        </div>
      )}
    </div>
  );
}
