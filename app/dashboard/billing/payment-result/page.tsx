'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useCreditBalance } from '@/hooks/useCreditBalance';
export default function PaymentResultPage(){const search=useSearchParams(),orderNo=search.get('orderNo')||search.get('out_trade_no')||'',[status,setStatus]=useState('确认支付中');const{refreshCredits,notifyCreditsChanged}=useCreditBalance();useEffect(()=>{if(!orderNo){setStatus('未找到支付订单');return;}let stop=false;const check=async()=>{const res=await fetch(`/api/payments/orders/${orderNo}`);const data=await res.json();if(stop)return;const state=data.order?.status;if(state==='paid'){setStatus('支付成功');await refreshCredits();notifyCreditsChanged();}else if(['failed','closed','expired','refunded'].includes(state)){setStatus('支付失败或订单已关闭');}else setTimeout(check,2500);};void check();return()=>{stop=true};},[orderNo,refreshCredits,notifyCreditsChanged]);return <div className="p-8 max-w-lg mx-auto text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-accent-blue"/><h1 className="text-xl font-bold mt-4">{status}</h1><p className="text-sm text-text-secondary mt-2">支付最终状态以服务端验签回调或主动查单结果为准。</p><Link href="/dashboard/billing" className="btn-primary inline-block mt-6 text-sm">返回套餐与积分</Link></div>}
