import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { PLAN_CATALOG, TRIAL_DAYS } from './pricing';
import { createTrialCredits } from './credits';

export async function ensurePlans() {
  const db = getDb();
  for (const plan of PLAN_CATALOG) {
    const existing = await db.prepare(`SELECT id FROM "Plan" WHERE code = ?`).get(plan.code);
    if (existing) {
      await db.prepare(`UPDATE "Plan" SET name = ?, "monthlyPrice" = ?, "yearlyPrice" = ?, "monthlyCredits" = ?, "maxMembers" = ?, "maxKnowledgeSpaces" = ?, "storageLimitBytes" = ?, "featuresJson" = ?, enabled = ?, "updatedAt" = ? WHERE id = ?`).run(
        plan.name, plan.monthlyPrice, plan.yearlyPrice, plan.monthlyCredits, plan.maxMembers, plan.maxKnowledgeSpaces,
        plan.storageLimitBytes, JSON.stringify(plan.features), true, new Date().toISOString(), existing.id
      );
      continue;
    }
    await db.prepare(`INSERT INTO "Plan" (id, code, name, "monthlyPrice", "yearlyPrice", "monthlyCredits", "maxMembers", "maxKnowledgeSpaces", "storageLimitBytes", "featuresJson", enabled, "createdAt", "updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      uuid(), plan.code, plan.name, plan.monthlyPrice, plan.yearlyPrice, plan.monthlyCredits, plan.maxMembers,
      plan.maxKnowledgeSpaces, plan.storageLimitBytes, JSON.stringify(plan.features), true, new Date().toISOString(), new Date().toISOString()
    );
  }
}

export async function ensureCompanySubscription(companyId: string, userId?: string) {
  await ensurePlans();
  const db = getDb();
  const current = await db.prepare(`SELECT s.*, p.code as "planCode", p.name as "planName" FROM "Subscription" s JOIN "Plan" p ON p.id = s."planId" WHERE s."companyId" = ? AND s.status IN ('trialing','active','past_due') ORDER BY s."createdAt" DESC LIMIT 1`).get(companyId);
  if (current) return current;
  const trial = await db.prepare(`SELECT id FROM "Plan" WHERE code = 'trial'`).get();
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const subscription = { id: uuid(), companyId, planId: trial.id, billingCycle: 'trial', status: 'trialing', startedAt: startedAt.toISOString(), expiresAt: expiresAt.toISOString() };
  await db.prepare(`INSERT INTO "Subscription" (id, "companyId", "planId", "billingCycle", status, "startedAt", "expiresAt", "autoRenew", "createdAt", "updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    subscription.id, subscription.companyId, subscription.planId, subscription.billingCycle, subscription.status, subscription.startedAt, subscription.expiresAt, false, subscription.startedAt, subscription.startedAt
  );
  await createTrialCredits(companyId, userId, subscription.id, expiresAt);
  return { ...subscription, planCode: 'trial', planName: '体验版' };
}
