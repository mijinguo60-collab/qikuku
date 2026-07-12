import { NextRequest, NextResponse } from 'next/server';
import { getRequestSession } from '@/lib/session';
import { getOwnedPaymentOrder } from '@/lib/payments/order-service';
import { isWechatPayConfigured, queryWechatPayment } from '@/lib/payments/wechat';
import { completePaidPayment } from '@/lib/payments/payment-service';
export async function GET(request:NextRequest,{params}:{params:{orderNo:string}}){ const user=await getRequestSession(request); if(!user)return NextResponse.json({error:'未登录'},{status:401}); const order=await getOwnedPaymentOrder(user.companyId,params.orderNo); if(!order)return NextResponse.json({error:'订单不存在或无权限'},{status:404}); try { if(order.provider==='wechat'&&['pending','paying'].includes(order.status)&&isWechatPayConfigured()){const remote=await queryWechatPayment(order.orderNo);if(remote.trade_state==='SUCCESS') await completePaidPayment(order.orderNo,'wechat',remote.transaction_id,remote.amount?.total); } } catch(error:any){console.error('[PAYMENT_QUERY]',{orderNo:order.orderNo,message:error.message});} const fresh=await getOwnedPaymentOrder(user.companyId,params.orderNo); return NextResponse.json({order:fresh}); }
