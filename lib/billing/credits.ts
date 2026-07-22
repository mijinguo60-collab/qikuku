import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { estimatedCostCents, TRIAL_CREDITS } from './pricing';

export type CreditSourceType = 'trial' | 'package' | 'purchase' | 'bonus' | 'manual' | 'refund';
export type CreditFeature = string;

type GrantInput = { companyId: string; userId?: string | null; sourceType: CreditSourceType; sourceId?: string | null; amount: number; expiresAt?: Date | null; description: string; idempotencyKey: string; featureType?: string; metadata?: Record<string, unknown> };
type ConsumeInput = { companyId: string; userId?: string | null; amount: number; featureType: CreditFeature; requestId: string; idempotencyKey: string; description?: string; model?: string; inputTokens?: number; outputTokens?: number; imageCount?: number };

const NOW = () => new Date().toISOString();

function hasTransaction(db: any) {
  return typeof db.transactionAsync === 'function';
}

// eslint-disable-next-line no-unused-vars -- The tuple keeps transaction callbacks type-safe.
async function inTransaction<T>(fn: (..._args: [any]) => Promise<T>): Promise<T> {
  const db = getDb();
  return hasTransaction(db) ? db.transactionAsync(fn) : fn(db);
}

async function ensureAccount(tx: any, companyId: string) {
  let account = await tx.prepare(`SELECT * FROM "CreditAccount" WHERE "companyId" = ?${tx.prepare ? ' FOR UPDATE' : ''}`).get(companyId).catch(async () => tx.prepare(`SELECT * FROM "CreditAccount" WHERE "companyId" = ?`).get(companyId));
  if (!account) {
    const id = uuid();
    await tx.prepare(`INSERT INTO "CreditAccount" (id, "companyId", "totalBalance", "packageBalance", "purchasedBalance", "bonusBalance", "updatedAt") VALUES (?,?,?,?,?,?,?)`).run(id, companyId, 0, 0, 0, 0, NOW());
    account = { id, companyId, totalBalance: 0, packageBalance: 0, purchasedBalance: 0, bonusBalance: 0 };
  }
  return account;
}

function bucket(sourceType: string) {
  if (sourceType === 'package') return 'packageBalance';
  if (sourceType === 'purchase') return 'purchasedBalance';
  return 'bonusBalance';
}

async function updateAccount(tx: any, account: any, delta: number, sourceType: string) {
  const next = { ...account, totalBalance: Number(account.totalBalance) + delta };
  const key = bucket(sourceType);
  next[key] = Number(next[key]) + delta;
  if (next.totalBalance < 0 || next.packageBalance < 0 || next.purchasedBalance < 0 || next.bonusBalance < 0) throw new Error('积分余额异常，已中止操作');
  await tx.prepare(`UPDATE "CreditAccount" SET "totalBalance" = ?, "packageBalance" = ?, "purchasedBalance" = ?, "bonusBalance" = ?, "updatedAt" = ? WHERE id = ?`).run(next.totalBalance, next.packageBalance, next.purchasedBalance, next.bonusBalance, NOW(), account.id);
  return next;
}

export async function getCreditBalance(companyId: string) {
  const account = await getDb().prepare(`SELECT "totalBalance" FROM "CreditAccount" WHERE "companyId" = ?`).get(companyId);
  return Number(account?.totalBalance || 0);
}

export async function getCreditBreakdown(companyId: string) {
  const db = getDb();
  const [account, expiring] = await Promise.all([
    db.prepare(`SELECT * FROM "CreditAccount" WHERE "companyId" = ?`).get(companyId),
    db.prepare(`SELECT COALESCE(SUM("remainingAmount"), 0) as amount, MIN("expiresAt") as "expiresAt" FROM "CreditGrant" WHERE "companyId" = ? AND "remainingAmount" > 0 AND "expiresAt" IS NOT NULL AND "expiresAt" > ?`).get(companyId, NOW()),
  ]);
  return {
    totalBalance: Number(account?.totalBalance || 0), packageBalance: Number(account?.packageBalance || 0),
    purchasedBalance: Number(account?.purchasedBalance || 0), bonusBalance: Number(account?.bonusBalance || 0),
    expiringAmount: Number(expiring?.amount || 0), expiresAt: expiring?.expiresAt || null,
  };
}

export async function checkCreditBalance(companyId: string, requiredCredits: number) {
  const balance = await getCreditBalance(companyId);
  return { ok: balance >= requiredCredits, balance, requiredCredits };
}

export async function grantCredits(input: GrantInput) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error('发放积分必须为正整数');
  return inTransaction(async (tx) => {
    const existing = await tx.prepare(`SELECT id FROM "CreditLedger" WHERE "idempotencyKey" = ?`).get(input.idempotencyKey);
    if (existing) return { duplicated: true, balance: await getCreditBalance(input.companyId) };
    const account = await ensureAccount(tx, input.companyId);
    const before = Number(account.totalBalance);
    const grantId = uuid();
    await tx.prepare(`INSERT INTO "CreditGrant" (id, "companyId", "sourceType", "sourceId", "originalAmount", "remainingAmount", "expiresAt", "createdAt") VALUES (?,?,?,?,?,?,?,?)`).run(
      grantId, input.companyId, input.sourceType, input.sourceId || null, input.amount, input.amount, input.expiresAt?.toISOString() || null, NOW()
    );
    const next = await updateAccount(tx, account, input.amount, input.sourceType);
    await tx.prepare(`INSERT INTO "CreditLedger" (id, "companyId", "userId", "grantId", type, "featureType", amount, "balanceBefore", "balanceAfter", "requestId", "idempotencyKey", description, "metadataJson", "createdAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      uuid(), input.companyId, input.userId || null, grantId, 'credit', input.featureType || null, input.amount, before, next.totalBalance, input.sourceId || null,
      input.idempotencyKey, input.description, input.metadata ? JSON.stringify(input.metadata) : null, NOW()
    );
    return { duplicated: false, grantId, balance: next.totalBalance };
  });
}

export async function consumeCredits(input: ConsumeInput) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error('扣除积分必须为正整数');
  const result = await inTransaction(async (tx) => {
    const duplicate = await tx.prepare(`SELECT "balanceAfter" FROM "CreditLedger" WHERE "idempotencyKey" LIKE ? ORDER BY "createdAt" DESC LIMIT 1`).get(`${input.idempotencyKey}:%`);
    if (duplicate) return { duplicated: true, balance: Number(duplicate.balanceAfter), chargedCredits: input.amount };
    const account = await ensureAccount(tx, input.companyId);
    if (Number(account.totalBalance) < input.amount) throw new Error('AI算力积分不足，请充值或升级套餐');
    const grants = await tx.prepare(`SELECT * FROM "CreditGrant" WHERE "companyId" = ? AND "remainingAmount" > 0 AND ("expiresAt" IS NULL OR "expiresAt" > ?) ORDER BY CASE "sourceType" WHEN 'trial' THEN 0 WHEN 'bonus' THEN 0 WHEN 'package' THEN 1 WHEN 'purchase' THEN 2 ELSE 3 END, CASE WHEN "expiresAt" IS NULL THEN 1 ELSE 0 END, "expiresAt" ASC, "createdAt" ASC`).all(input.companyId, NOW());
    let remaining = input.amount;
    let workingAccount = account;
    let part = 0;
    for (const grant of grants) {
      if (remaining <= 0) break;
      const used = Math.min(remaining, Number(grant.remainingAmount));
      const before = Number(workingAccount.totalBalance);
      await tx.prepare(`UPDATE "CreditGrant" SET "remainingAmount" = "remainingAmount" - ? WHERE id = ? AND "remainingAmount" >= ?`).run(used, grant.id, used);
      workingAccount = await updateAccount(tx, workingAccount, -used, grant.sourceType);
      await tx.prepare(`INSERT INTO "CreditLedger" (id, "companyId", "userId", "grantId", type, "featureType", amount, "balanceBefore", "balanceAfter", "requestId", "idempotencyKey", description, "metadataJson", "createdAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        uuid(), input.companyId, input.userId || null, grant.id, 'debit', input.featureType, -used, before, workingAccount.totalBalance, input.requestId,
        `${input.idempotencyKey}:${part++}`, input.description || `使用 ${input.featureType}`, JSON.stringify({ sourceType: grant.sourceType }), NOW()
      );
      remaining -= used;
    }
    if (remaining > 0) throw new Error('AI算力积分不足，请充值或升级套餐');
    return { duplicated: false, balance: Number(workingAccount.totalBalance), chargedCredits: input.amount };
  });
  if (!result.duplicated) await recordUsage({ companyId: input.companyId, userId: input.userId, featureType: input.featureType, requestId: input.requestId, model: input.model, inputTokens: input.inputTokens, outputTokens: input.outputTokens, imageCount: input.imageCount, chargedCredits: input.amount, success: true });
  return result;
}

export async function refundCredits(input: Omit<GrantInput, 'sourceType'> & { sourceType?: CreditSourceType }) {
  return grantCredits({ ...input, sourceType: input.sourceType || 'refund' });
}

export async function expireCredits(companyId: string) {
  return inTransaction(async (tx) => {
    const account = await ensureAccount(tx, companyId);
    const grants = await tx.prepare(`SELECT * FROM "CreditGrant" WHERE "companyId" = ? AND "remainingAmount" > 0 AND "expiresAt" IS NOT NULL AND "expiresAt" <= ?`).all(companyId, NOW());
    let working = account;
    for (const grant of grants) {
      const amount = Number(grant.remainingAmount);
      const before = Number(working.totalBalance);
      await tx.prepare(`UPDATE "CreditGrant" SET "remainingAmount" = 0 WHERE id = ?`).run(grant.id);
      working = await updateAccount(tx, working, -amount, grant.sourceType);
      await tx.prepare(`INSERT INTO "CreditLedger" (id, "companyId", "grantId", type, amount, "balanceBefore", "balanceAfter", "idempotencyKey", description, "createdAt") VALUES (?,?,?,?,?,?,?,?,?,?)`).run(uuid(), companyId, grant.id, 'expire', -amount, before, working.totalBalance, `expire:${grant.id}`, '积分到期失效', NOW());
    }
    return { expiredCredits: grants.reduce((sum: number, grant: any) => sum + Number(grant.remainingAmount), 0), balance: Number(working.totalBalance) };
  });
}

export async function createTrialCredits(companyId: string, userId: string | undefined, subscriptionId: string, expiresAt: Date) {
  return grantCredits({ companyId, userId, sourceType: 'trial', sourceId: subscriptionId, amount: TRIAL_CREDITS, expiresAt, description: '体验版首次赠送积分', idempotencyKey: `trial:${companyId}` });
}

export async function createPackageCredits(companyId: string, userId: string | undefined, subscriptionId: string, amount: number, expiresAt: Date) {
  return grantCredits({ companyId, userId, sourceType: 'package', sourceId: subscriptionId, amount, expiresAt, description: '套餐月度积分', idempotencyKey: `package:${subscriptionId}:${expiresAt.toISOString().slice(0, 7)}` });
}

export async function createRechargeCredits(order: any, userId?: string | null) {
  const db = getDb();
  const current = await db.prepare(`SELECT * FROM "RechargeOrder" WHERE id = ?`).get(order.id);
  if (!current) throw new Error('充值订单不存在');
  if (current.status === 'paid') {
    await issueRechargeGrants(current, userId);
    return { duplicated: true, balance: await getCreditBalance(current.companyId), firstRechargeBonus: Number(current.firstRechargeBonus || 0) };
  }
  if (current.status !== 'pending') throw new Error('当前订单无法确认付款');
  const hasPaid = await db.prepare(`SELECT id FROM "RechargeOrder" WHERE "companyId" = ? AND status = 'paid' LIMIT 1`).get(current.companyId);
  const firstBonus = hasPaid ? 0 : Math.min(Math.floor(Number(current.baseCredits) * 0.2), 6_000);
  const now = NOW();
  const updated = await db.prepare(`UPDATE "RechargeOrder" SET status = 'paid', "firstRechargeBonus" = ?, "paidAt" = ?, "updatedAt" = ? WHERE id = ? AND status = 'pending'`).run(firstBonus, now, now, current.id);
  if (!updated.changes) return createRechargeCredits(current, userId);
  await issueRechargeGrants({ ...current, firstRechargeBonus: firstBonus }, userId);
  return { duplicated: false, balance: await getCreditBalance(current.companyId), firstRechargeBonus: firstBonus };
}

async function issueRechargeGrants(order: any, userId?: string | null) {
  await grantCredits({ companyId: order.companyId, userId: userId || order.userId, sourceType: 'purchase', sourceId: order.id, amount: Number(order.baseCredits), description: '充值购买积分', idempotencyKey: `recharge:base:${order.id}` });
  if (Number(order.bonusCredits) > 0) await grantCredits({ companyId: order.companyId, userId: userId || order.userId, sourceType: 'bonus', sourceId: order.id, amount: Number(order.bonusCredits), expiresAt: new Date(Date.now() + 90 * 86400000), description: '充值赠送积分', idempotencyKey: `recharge:bonus:${order.id}` });
  if (Number(order.firstRechargeBonus) > 0) await grantCredits({ companyId: order.companyId, userId: userId || order.userId, sourceType: 'bonus', sourceId: order.id, amount: Number(order.firstRechargeBonus), expiresAt: new Date(Date.now() + 90 * 86400000), description: '首次充值活动赠送', idempotencyKey: `recharge:first:${order.id}` });
}

export async function reverseUnusedRechargeCredits(orderId: string, adminUserId?: string | null) {
  return inTransaction(async (tx) => {
    const order = await tx.prepare(`SELECT * FROM "RechargeOrder" WHERE id = ?`).get(orderId);
    if (!order) throw new Error('充值订单不存在');
    if (order.status === 'refunded') return { duplicated: true, balance: await getCreditBalance(order.companyId) };
    if (order.status !== 'paid') throw new Error('只有已支付订单可以退款');
    const account = await ensureAccount(tx, order.companyId);
    const grants = await tx.prepare(`SELECT * FROM "CreditGrant" WHERE "sourceId" = ? AND "companyId" = ? AND "remainingAmount" > 0`).all(order.id, order.companyId);
    let working = account;
    for (const grant of grants) {
      const amount = Number(grant.remainingAmount);
      const before = Number(working.totalBalance);
      await tx.prepare(`UPDATE "CreditGrant" SET "remainingAmount" = 0 WHERE id = ?`).run(grant.id);
      working = await updateAccount(tx, working, -amount, grant.sourceType);
      await tx.prepare(`INSERT INTO "CreditLedger" (id, "companyId", "userId", "grantId", type, "featureType", amount, "balanceBefore", "balanceAfter", "requestId", "idempotencyKey", description, "createdAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        uuid(), order.companyId, adminUserId || null, grant.id, 'adjustment', 'refund', -amount, before, working.totalBalance, order.id, `refund:${order.id}:${grant.id}`, '订单退款，扣回未使用积分', NOW()
      );
    }
    await tx.prepare(`UPDATE "RechargeOrder" SET status = 'refunded', "updatedAt" = ? WHERE id = ?`).run(NOW(), order.id);
    return { duplicated: false, balance: Number(working.totalBalance), reversedCredits: grants.reduce((sum: number, grant: any) => sum + Number(grant.remainingAmount), 0) };
  });
}

export async function recordUsage(input: { companyId: string; userId?: string | null; featureType: string; requestId?: string; model?: string; inputTokens?: number; outputTokens?: number; imageCount?: number; chargedCredits: number; success: boolean; errorCode?: string }) {
  const db = getDb();
  const key = `usage:${input.requestId || uuid()}`;
  const existing = await db.prepare(`SELECT id FROM "UsageRecord" WHERE "requestId" = ? LIMIT 1`).get(input.requestId || '').catch(() => null);
  if (existing) return;
  await db.prepare(`INSERT INTO "UsageRecord" (id, "companyId", "userId", "featureType", "requestId", model, "inputTokens", "outputTokens", "imageCount", "chargedCredits", "estimatedCostCents", success, "errorCode", "createdAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    uuid(), input.companyId, input.userId || null, input.featureType, input.requestId || key, input.model || null, input.inputTokens || null,
    input.outputTokens || null, input.imageCount || null, input.chargedCredits, estimatedCostCents(input), input.success, input.errorCode || null, NOW()
  );
}
