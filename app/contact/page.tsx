'use client';
import { useState } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function ContactPage() {
  const [form, setForm] = useState({ companyName:'', contactName:'', contact:'', industry:'', teamSize:'', currentTool:'', painPoint:'', note:'' });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.companyName || !form.contactName || !form.contact) return;
    setLoading(true);
    try {
      const res = await fetch('/api/leads', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) });
      if (res.ok) setSubmitted(true);
    } catch {} finally { setLoading(false); }
  }

  if (submitted) return (
    <main className="min-h-screen bg-white"><Navbar /><section className="max-w-xl mx-auto px-6 pt-32 pb-20 text-center"><h2 className="text-2xl font-bold text-text-primary mb-4">已收到你的申请</h2><p className="text-text-secondary">我们会尽快联系你，感谢对企库库的关注。</p></section><Footer /></main>
  );

  return (
    <main className="min-h-screen bg-white"><Navbar />
    <section className="max-w-xl mx-auto px-6 pt-24 pb-20">
      <h1 className="text-3xl font-bold text-text-primary mb-2 text-center">预约演示</h1>
      <p className="text-text-secondary text-center mb-10">填写以下信息，我们将尽快与你联系</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="text-xs font-medium text-text-muted">企业名称 *</label><input className="input-primary" required value={form.companyName} onChange={e=>setForm({...form,companyName:e.target.value})} /></div>
          <div><label className="text-xs font-medium text-text-muted">联系人 *</label><input className="input-primary" required value={form.contactName} onChange={e=>setForm({...form,contactName:e.target.value})} /></div>
        </div>
        <div><label className="text-xs font-medium text-text-muted">手机号/微信 *</label><input className="input-primary" required value={form.contact} onChange={e=>setForm({...form,contact:e.target.value})} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="text-xs font-medium text-text-muted">行业</label><select className="input-primary" value={form.industry} onChange={e=>setForm({...form,industry:e.target.value})}>
            <option value="">请选择</option><option>本地生活</option><option>探店/直播</option><option>代运营</option><option>工厂/制造</option><option>教育培训</option><option>医疗/视光</option><option>招商加盟</option><option>其他</option></select></div>
          <div><label className="text-xs font-medium text-text-muted">团队人数</label><select className="input-primary" value={form.teamSize} onChange={e=>setForm({...form,teamSize:e.target.value})}>
            <option value="">请选择</option><option>1-10人</option><option>11-50人</option><option>51-200人</option><option>200人以上</option></select></div>
        </div>
        <div><label className="text-xs font-medium text-text-muted">当前资料管理方式</label><input className="input-primary" placeholder="如：微信、飞书、Excel、网盘等" value={form.currentTool} onChange={e=>setForm({...form,currentTool:e.target.value})} /></div>
        <div><label className="text-xs font-medium text-text-muted">最想解决的问题</label><textarea className="input-primary min-h-[80px]" placeholder="如：销售话术不统一、新员工培训慢、资料难找" value={form.painPoint} onChange={e=>setForm({...form,painPoint:e.target.value})} /></div>
        <div><label className="text-xs font-medium text-text-muted">备注</label><input className="input-primary" value={form.note} onChange={e=>setForm({...form,note:e.target.value})} /></div>
        <button type="submit" disabled={loading} className="btn-primary w-full py-3 rounded-xl">{loading?'提交中...':'提交申请'}</button>
      </form>
    </section><Footer /></main>
  );
}
