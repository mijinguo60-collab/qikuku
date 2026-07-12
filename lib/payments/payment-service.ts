import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { PLAN_CATALOG } from '@/lib/billing/pricing';

const now = () => new Date().toISOString();
async function grant(tx: any, order: any, sourceType: string, amount: number, key: string, expiresAt?: string | null) {
  if (!amount) return;
  const exists = await tx.prepare(`SELECT id FROM "CreditLedger" WHERE "idempotencyKey" = ?`).get(key);
  if (exists) return;
  let account = await tx.prepare(`SELECT * FROM "CreditAccount" WHERE "companyId" = ? FOR UPDATE`).get(order.companyId).catch(async () => tx.prepare(`SELECT * FROM "CreditAccount" WHERE "companyId" = ?`).get(order.companyId));
  if (!account) { account = { id: uuid(), totalBalance: 0, packageBalance: 0, purchasedBalance: 0, bonusBalance: 0 }; await tx.prepare(`INSERT INTO "CreditAccount" (id,"companyId","totalBalance","packageBalance","purchasedBalance","bonusBalance","updatedAt") VALUES (?,?,?,?,?,?,?)`).run(account.id, order.companyId, 0, 0, 0, 0, now()); }
  const bucket = sourceType === 'package' ? 'packageBalance' : sourceType === 'purchase' ? 'purchasedBalance' : 'bonusBalance';
  const before = Number(account.totalBalance); const next = { ...account, totalBalance: before + amount, [bucket]: Number(account[bucket]) + amount };
  const grantId = uuid();
  await tx.prepare(`INSERT INTO "CreditGrant" (id,"companyId","sourceType","sourceId","originalAmount","remainingAmount","expiresAt","createdAt") VALUES (?,?,?,?,?,?,?,?)`).run(grantId, order.companyId, sourceType, order.id, amount, amount, expiresAt || null, now());
  await tx.prepare(`UPDATE "CreditAccount" SET "totalBalance"=?,"packageBalance"=?,"purchasedBalance"=?,"bonusBalance"=?,"updatedAt"=? WHERE id=?`).run(next.totalBalance, next.packageBalance, next.purchasedBalance, next.bonusBalance, now(), account.id);
  await tx.prepare(`INSERT INTO "CreditLedger" (id,"companyId","userId","grantId",type,amount,"balanceBefore","balanceAfter","requestId","idempotencyKey",description,"createdAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(uuid(), order.companyId, order.userId, grantId, 'credit', amount, before, next.totalBalance, order.orderNo, key, '支付成功发放积分', now());
}

export async function completePaidPayment(orderNo: string, provider: string, providerTransactionId: string, paidAmountCents: number) {
  const db = getDb();
  return db.transactionAsync(async (tx: any) => {
    const order = await tx.prepare(`SELECT * FROM "PaymentOrder" WHERE "orderNo" = ? FOR UPDATE`).get(orderNo).catch(async () => tx.prepare(`SELECT * FROM "PaymentOrder" WHERE "orderNo" = ?`).get(orderNo));
    if (!order) throw new Error('支付订单不存在');
    if (Number(order.amountCents) !== Number(paidAmountCents) || order.currency !== 'CNY') throw new Error('支付金额或币种校验失败');
    if (order.status === 'paid') return { order, duplicated: true };
    const duplicateTransaction = await tx.prepare(`SELECT id FROM "PaymentOrder" WHERE "providerTransactionId" = ? AND id <> ?`).get(providerTransactionId, order.id);
    if (duplicateTransaction) throw new Error('支付流水已绑定其他订单');
    const paidAt = now();
    await tx.prepare(`UPDATE "PaymentOrder" SET status='paid',provider=?,"providerTransactionId"=?,"paidAt"=?,"updatedAt"=? WHERE id=? AND status IN ('pending','paying')`).run(provider, providerTransactionId, paidAt, paidAt, order.id);
    if (order.orderType === 'credit_recharge') {
      const previous = await tx.prepare(`SELECT id FROM "PaymentOrder" WHERE "companyId"=? AND "orderType"='credit_recharge' AND status='paid' AND id<>? LIMIT 1`).get(order.companyId, order.id);
      const firstBonus = previous ? 0 : Math.min(Math.floor(Number(order.baseCredits) * .2), 6000);
      await tx.prepare(`UPDATE "PaymentOrder" SET "firstRechargeBonus"=? WHERE id=?`).run(firstBonus, order.id);
      await grant(tx, order, 'purchase', Number(order.baseCredits), `payment:${order.id}:base`);
      await grant(tx, order, 'bonus', Number(order.bonusCredits), `payment:${order.id}:bonus`, new Date(Date.now() + 90 * 86400000).toISOString());
      await grant(tx, order, 'bonus', firstBonus, `payment:${order.id}:first`, new Date(Date.now() + 90 * 86400000).toISOString());
    } else {
      const plan = PLAN_CATALOG.find((item) => item.code === order.planCode);
      if (!plan) throw new Error('套餐不存在');
      const start = new Date(); const end = new Date(start); end.setMonth(end.getMonth() + (order.billingCycle === 'yearly' ? 12 : 1));
      const active = await tx.prepare(`SELECT id FROM "Subscription" WHERE "companyId"=? AND status IN ('trialing','active','past_due') ORDER BY "createdAt" DESC LIMIT 1`).get(order.companyId);
      if (active) await tx.prepare(`UPDATE "Subscription" SET "planId"=(SELECT id FROM "Plan" WHERE code=?),"billingCycle"=?,status='active',"startedAt"=?,"expiresAt"=?,"autoRenew"=false,"updatedAt"=? WHERE id=?`).run(plan.code, order.billingCycle, start.toISOString(), end.toISOString(), paidAt, active.id);
      else await tx.prepare(`INSERT INTO "Subscription" (id,"companyId","planId","billingCycle",status,"startedAt","expiresAt","autoRenew","createdAt","updatedAt") VALUES (?,?,(SELECT id FROM "Plan" WHERE code=?),?,?,?,?,?,?,?)`).run(uuid(), order.companyId, plan.code, order.billingCycle, 'active', start.toISOString(), end.toISOString(), false, paidAt, paidAt);
      const subscription = active ? { id: active.id } : await tx.prepare(`SELECT id FROM "Subscription" WHERE "companyId"=? ORDER BY "createdAt" DESC LIMIT 1`).get(order.companyId);
      const grantEnd = new Date(start); grantEnd.setMonth(grantEnd.getMonth() + 2);
      await grant(tx, { ...order, id: subscription.id }, 'package', Number(plan.monthlyCredits), `package:${subscription.id}:${start.toISOString().slice(0,7)}`, grantEnd.toISOString());
    }
    return { order: { ...order, status: 'paid' }, duplicated: false };
  });
}
