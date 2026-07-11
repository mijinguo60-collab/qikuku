import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { getBillingOwner } from '@/lib/billing/access';
import { rechargeOption } from '@/lib/billing/pricing';

function orderNo() {
  return `QK${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 90 + 10)}`;
}

export async function GET(request: NextRequest) {
  const owner = getBillingOwner(request);
  if (!owner) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const orders = await getDb().prepare(`SELECT id, "orderNo", "amountCents", "baseCredits", "bonusCredits", "firstRechargeBonus", provider, status, "paidAt", "createdAt" FROM "RechargeOrder" WHERE "companyId" = ? ORDER BY "createdAt" DESC LIMIT 50`).all(owner.companyId);
  return NextResponse.json({ orders });
}

export async function POST(request: NextRequest) {
  const owner = getBillingOwner(request);
  if (!owner) return NextResponse.json({ error: '未登录' }, { status: 401 });
  try {
    const body = await request.json();
    const option = rechargeOption(Number(body.amountCents));
    if (!option) return NextResponse.json({ error: '请选择标准充值档位' }, { status: 400 });
    const provider = ['manual', 'wechat', 'alipay'].includes(body.provider) ? body.provider : 'manual';
    if (provider !== 'manual') return NextResponse.json({ error: '支付通道尚未开通，请联系管理员人工确认付款' }, { status: 503 });
    const now = new Date().toISOString();
    const order = { id: uuid(), orderNo: orderNo(), companyId: owner.companyId, userId: owner.id, ...option, provider, status: 'pending' };
    await getDb().prepare(`INSERT INTO "RechargeOrder" (id, "orderNo", "companyId", "userId", "amountCents", "baseCredits", "bonusCredits", "firstRechargeBonus", provider, status, "createdAt", "updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      order.id, order.orderNo, order.companyId, order.userId, order.amountCents, order.baseCredits, order.bonusCredits, 0, order.provider, order.status, now, now
    );
    return NextResponse.json({ order, message: '充值申请已创建，请联系平台管理员确认付款。' }, { status: 201 });
  } catch (error: any) {
    console.error('[BILLING] Create recharge order failed', { message: error.message });
    return NextResponse.json({ error: '创建充值订单失败，请稍后重试' }, { status: 500 });
  }
}
