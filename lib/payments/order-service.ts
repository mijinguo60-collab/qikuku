import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { PLAN_CATALOG, rechargeOption } from '@/lib/billing/pricing';

export type PaymentOrderInput = { companyId: string; userId: string; provider: 'wechat' | 'alipay' | 'manual'; orderType: 'credit_recharge' | 'plan_purchase' | 'plan_renewal' | 'plan_upgrade'; rechargeAmountCents?: number; planCode?: string; billingCycle?: 'monthly' | 'yearly' };
const expiresAt = () => new Date(Date.now() + Number(process.env.PAYMENT_ORDER_EXPIRE_MINUTES || 15) * 60_000).toISOString();
const orderNo = () => `QK${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;

export async function createPaymentOrder(input: PaymentOrderInput) {
  const db = getDb();
  await db.prepare(`UPDATE "PaymentOrder" SET status = 'expired', "closedAt" = ?, "updatedAt" = ? WHERE "companyId" = ? AND status IN ('pending','paying') AND "expiresAt" <= ?`).run(new Date().toISOString(), new Date().toISOString(), input.companyId, new Date().toISOString());
  const open = await db.prepare(`SELECT COUNT(*) as count FROM "PaymentOrder" WHERE "companyId" = ? AND status IN ('pending','paying')`).get(input.companyId);
  if (Number(open?.count || 0) >= 3) throw new Error('当前未支付订单过多，请先完成或等待订单过期');
  const now = new Date().toISOString();
  const common = { id: uuid(), orderNo: orderNo(), companyId: input.companyId, userId: input.userId, provider: input.provider, status: 'pending', currency: 'CNY', expiresAt: expiresAt() };
  if (input.orderType === 'credit_recharge') {
    const option = rechargeOption(Number(input.rechargeAmountCents));
    if (!option) throw new Error('请选择标准充值档位');
    const order = { ...common, orderType: input.orderType, amountCents: option.amountCents, subject: '企库库 AI 算力积分充值', description: `${option.baseCredits} 基础积分`, rechargeOptionId: String(option.amountCents), baseCredits: option.baseCredits, bonusCredits: option.bonusCredits };
    await db.prepare(`INSERT INTO "PaymentOrder" (id,"orderNo","companyId","userId","orderType",provider,status,"amountCents",currency,subject,description,"rechargeOptionId","baseCredits","bonusCredits","firstRechargeBonus","expiresAt","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(order.id, order.orderNo, order.companyId, order.userId, order.orderType, order.provider, order.status, order.amountCents, order.currency, order.subject, order.description, order.rechargeOptionId, order.baseCredits, order.bonusCredits, 0, order.expiresAt, now, now);
    return order;
  }
  const plan = PLAN_CATALOG.find((item) => item.code === input.planCode && !['trial', 'custom'].includes(item.code));
  if (!plan || !input.billingCycle) throw new Error('请选择可购买套餐和付费周期');
  const amountCents = input.billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
  const order = { ...common, orderType: input.orderType, amountCents, subject: `企库库 ${plan.name}${input.billingCycle === 'yearly' ? '年付' : '月付'}`, description: `${plan.monthlyCredits.toLocaleString()} 积分/月`, planCode: plan.code, billingCycle: input.billingCycle, baseCredits: 0, bonusCredits: 0 };
  await db.prepare(`INSERT INTO "PaymentOrder" (id,"orderNo","companyId","userId","orderType",provider,status,"amountCents",currency,subject,description,"planCode","billingCycle","baseCredits","bonusCredits","firstRechargeBonus","expiresAt","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(order.id, order.orderNo, order.companyId, order.userId, order.orderType, order.provider, order.status, order.amountCents, order.currency, order.subject, order.description, order.planCode, order.billingCycle, 0, 0, 0, order.expiresAt, now, now);
  return order;
}

export async function getOwnedPaymentOrder(companyId: string, orderNo: string) {
  const db = getDb();
  const order = await db.prepare(`SELECT * FROM "PaymentOrder" WHERE "orderNo" = ? AND "companyId" = ?`).get(orderNo, companyId);
  if (order?.status === 'pending' && order.expiresAt && new Date(order.expiresAt).getTime() <= Date.now()) await db.prepare(`UPDATE "PaymentOrder" SET status='expired', "closedAt"=?, "updatedAt"=? WHERE id=? AND status='pending'`).run(new Date().toISOString(), new Date().toISOString(), order.id);
  return order;
}
