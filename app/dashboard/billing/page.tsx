'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Crown, Loader2, Sparkles, Wallet } from 'lucide-react';
import { PLAN_CATALOG, RECHARGE_OPTIONS } from '@/lib/billing/pricing';
import PaymentModal, { PurchaseIntent } from '@/components/billing/PaymentModal';

type BillingData = { subscription: any; credits: any; ledger: any[]; usage: any[]; payments: { wechat: boolean; alipay: boolean } };
const money = (cents: number) => `¥${(Number(cents || 0) / 100).toLocaleString('zh-CN')}`;

export default function BillingPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [intent, setIntent] = useState<PurchaseIntent | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/billing/credits?details=1');
    const payload = await res.json();
    if (res.ok) setData(payload); else setNotice(payload.error || '加载失败');
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const chooseRecharge = (option: typeof RECHARGE_OPTIONS[number]) => setIntent({ orderType:'credit_recharge', rechargeAmountCents:option.amountCents, title:'AI 算力积分充值', amountCents:option.amountCents, description:`基础 ${option.baseCredits.toLocaleString()} 积分，赠送 ${option.bonusCredits.toLocaleString()} 积分；首充另享最高 6,000 积分。` });
  const choosePlan = (plan: typeof PLAN_CATALOG[number], cycle:'monthly'|'yearly') => setIntent({ orderType:'plan_purchase', planCode:plan.code, billingCycle:cycle, title:`${plan.name}${cycle==='yearly'?'年付':'月付'}`, amountCents:cycle==='yearly'?plan.yearlyPrice:plan.monthlyPrice, description:`每月 ${plan.monthlyCredits.toLocaleString()} 套餐积分；升级后立即生效，原套餐剩余时间不折价。` });

  if (loading) return <div className="p-8 text-sm text-text-secondary flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />正在加载套餐与积分…</div>;
  const credits = data?.credits || {};
  const plan = data?.subscription;
  return <div className="p-8 max-w-7xl mx-auto animate-fade-in space-y-7">
    <div><h1 className="text-2xl font-bold text-text-primary">套餐与积分</h1><p className="text-sm text-text-secondary mt-1">管理企业套餐、AI 算力积分和充值记录</p></div>
    {notice && <div className="rounded-xl bg-accent-blue/10 text-accent-blue text-sm px-4 py-3">{notice}</div>}
    <section className="grid lg:grid-cols-3 gap-5">
      <div className="card p-6 lg:col-span-1"><div className="flex justify-between"><div><p className="text-xs text-text-muted">当前套餐</p><h2 className="text-xl font-bold mt-1">{plan?.planName || '体验版'}</h2></div><Crown className="w-6 h-6 text-accent-purple" /></div><p className="text-xs text-text-secondary mt-4">{plan?.status === 'trialing' ? '体验中' : plan?.status || '待开通'} · {plan?.billingCycle === 'yearly' ? '年付' : plan?.billingCycle === 'monthly' ? '月付' : '体验版'}</p><p className="text-xs text-text-muted mt-1">到期：{plan?.expiresAt ? new Date(plan.expiresAt).toLocaleDateString('zh-CN') : '按合同配置'}</p></div>
      <div className="card p-6 lg:col-span-2"><div className="flex justify-between items-start"><div><p className="text-xs text-text-muted">AI 算力积分余额</p><p className="text-3xl font-bold text-text-primary mt-1">{Number(credits.totalBalance || 0).toLocaleString()}</p></div><Wallet className="w-6 h-6 text-accent-blue" /></div><div className="grid grid-cols-3 gap-3 mt-5 text-xs"><div><p className="text-text-muted">套餐积分</p><p className="font-semibold mt-1">{Number(credits.packageBalance || 0).toLocaleString()}</p></div><div><p className="text-text-muted">充值积分</p><p className="font-semibold mt-1">{Number(credits.purchasedBalance || 0).toLocaleString()}</p></div><div><p className="text-text-muted">赠送积分</p><p className="font-semibold mt-1">{Number(credits.bonusBalance || 0).toLocaleString()}</p></div></div>{Number(credits.totalBalance || 0) < 1000 && <p className="mt-4 flex items-center gap-1.5 text-xs text-warning"><AlertTriangle className="w-3.5 h-3.5" />AI 算力积分余额较低</p>}</div>
    </section>
    <section className="card p-6"><h2 className="text-base font-semibold">充值中心</h2><p className="text-xs text-text-muted mt-1">1 元 = 100 AI 算力积分。支付通道未开通时不会创建模拟订单。</p><div className="grid md:grid-cols-3 xl:grid-cols-6 gap-3 mt-5">{RECHARGE_OPTIONS.map(option => <button key={option.amountCents} onClick={() => chooseRecharge(option)} className="text-left border border-border-light rounded-xl p-4 hover:border-text-primary hover:bg-surface-secondary transition-all"><p className="font-semibold">{money(option.amountCents)}</p><p className="text-xs text-text-secondary mt-2">基础 {option.baseCredits.toLocaleString()}</p><p className="text-xs text-accent-purple">赠送 {option.bonusCredits.toLocaleString()}</p></button>)}</div></section>
    <section className="card p-6"><h2 className="text-base font-semibold">套餐升级</h2><div className="grid md:grid-cols-4 gap-3 mt-5">{PLAN_CATALOG.filter(p => !['custom','trial'].includes(p.code)).map(p => <div key={p.code} className={`rounded-xl border p-4 ${p.code === 'pro' ? 'border-text-primary' : 'border-border-light'}`}><p className="font-semibold">{p.name}{p.code === 'pro' && <span className="ml-2 text-[10px] text-accent-purple">推荐</span>}</p><p className="text-sm mt-2">{money(p.monthlyPrice)}/月 · {money(p.yearlyPrice)}/年</p><p className="text-xs text-text-muted mt-2">{p.monthlyCredits.toLocaleString()} 积分/月</p><div className="flex gap-2 mt-4"><button onClick={() => choosePlan(p,'monthly')} className="text-xs btn-secondary flex-1">月付购买</button><button onClick={() => choosePlan(p,'yearly')} className="text-xs btn-primary flex-1">年付购买</button></div></div>)}</div></section>
    <section className="grid lg:grid-cols-2 gap-5"><div className="card p-6"><h2 className="text-base font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4" />本月使用情况</h2><div className="space-y-3 mt-4">{data?.usage?.length ? data.usage.map(item => <div key={item.featureType} className="flex justify-between text-sm"><span className="text-text-secondary">{item.featureType}</span><span>{Number(item.count)} 次 · {Number(item.credits).toLocaleString()} 积分</span></div>) : <p className="text-sm text-text-muted">本月还没有计费调用</p>}</div></div><div className="card p-6"><h2 className="text-base font-semibold">积分明细</h2><div className="space-y-3 mt-4 max-h-64 overflow-auto">{data?.ledger?.length ? data.ledger.map(item => <div key={item.id} className="flex justify-between gap-4 text-xs"><div><p className="text-text-primary">{item.description || item.featureType || item.type}</p><p className="text-text-muted mt-1">{new Date(item.createdAt).toLocaleString('zh-CN')}</p></div><span className={Number(item.amount) >= 0 ? 'text-success' : 'text-text-primary'}>{Number(item.amount) >= 0 ? '+' : ''}{item.amount}</span></div>) : <p className="text-sm text-text-muted">暂无积分流水</p>}</div></div></section>
  {intent && <PaymentModal intent={intent} payments={data?.payments || {wechat:false,alipay:false}} onClose={()=>setIntent(null)} onCompleted={async()=>{await load();setNotice(intent.orderType==='credit_recharge'?'充值成功，积分已到账':'套餐已开通，积分已刷新');}} />}</div>;
}
