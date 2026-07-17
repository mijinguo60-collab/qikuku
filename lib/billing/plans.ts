import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { TRIAL_DAYS } from './pricing';
import { createTrialCredits } from './credits';

export async function getCurrentCompanySubscription(companyId: string) {
  const db = getDb();
  return db.prepare(`SELECT s.*, p.code as "planCode", p.name as "planName" FROM "Subscription" s JOIN "Plan" p ON p.id = s."planId" WHERE s."companyId" = ? AND s.status IN ('trialing','active','past_due') ORDER BY s."createdAt" DESC LIMIT 1`).get(companyId);
}

export async function ensureCompanySubscription(companyId: string, userId?: string) {
  const db = getDb();
  const current = await getCurrentCompanySubscription(companyId);
  if (current) return current;
  const trial = await db.prepare(`SELECT id FROM "Plan" WHERE code = 'trial'`).get();
  if (!trial?.id) throw new Error('套餐暂未配置，请联系管理员完成受控初始化');
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const subscription = { id: uuid(), companyId, planId: trial.id, billingCycle: 'trial', status: 'trialing', startedAt: startedAt.toISOString(), expiresAt: expiresAt.toISOString() };
  await db.prepare(`INSERT INTO "Subscription" (id, "companyId", "planId", "billingCycle", status, "startedAt", "expiresAt", "autoRenew", "createdAt", "updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    subscription.id, subscription.companyId, subscription.planId, subscription.billingCycle, subscription.status, subscription.startedAt, subscription.expiresAt, false, subscription.startedAt, subscription.startedAt
  );
  await createTrialCredits(companyId, userId, subscription.id, expiresAt);
  return { ...subscription, planCode: 'trial', planName: '体验版' };
}
