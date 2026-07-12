'use client';
import Link from 'next/link';
import { Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCreditBalance } from '@/hooks/useCreditBalance';

export default function DashboardCreditCard() {
  const { totalBalance, expiringAmount, loading } = useCreditBalance(); const [monthUsed,setMonthUsed]=useState<number|null>(null);
  useEffect(()=>{fetch('/api/billing/credits').then(r=>r.json()).then(data=>setMonthUsed((data.usage||[]).reduce((sum:number,item:any)=>sum+Number(item.credits||0),0))).catch(()=>{});},[totalBalance]);
  return <Link href="/dashboard/billing" className="card p-5 block hover:bg-surface-secondary transition-colors"><div className="flex flex-wrap gap-4 justify-between"><div className="flex gap-3"><div className="w-9 h-9 rounded-xl bg-accent-blue/10 flex items-center justify-center"><Wallet className="w-5 h-5 text-accent-blue" /></div><div><p className="text-xs text-text-muted">AI 算力积分</p>{loading ? <div className="w-20 h-7 rounded bg-surface-tertiary animate-pulse mt-1" /> : <p className="text-2xl font-bold leading-7">{totalBalance.toLocaleString()}</p>}<p className={`text-[11px] mt-1 ${!loading && totalBalance < 1000 ? 'text-warning' : 'text-text-muted'}`}>{!loading && totalBalance < 1000 ? '积分余额较低，请及时充值' : expiringAmount ? `即将到期 ${expiringAmount.toLocaleString()} 积分` : `本月已使用 ${monthUsed === null ? '—' : monthUsed.toLocaleString()} 积分`}</p></div></div><div className="flex gap-2 items-start"><span className="btn-secondary text-xs">套餐</span><span className="btn-primary text-xs">充值</span></div></div></Link>;
}
