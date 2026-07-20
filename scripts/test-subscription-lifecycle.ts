import assert from 'node:assert/strict';
import { ensureCompanySubscription } from '../lib/billing/plans';
import { BillingError, getCompanySubscription, initializeTrialSubscriptionForCompany, requireCompanySubscription, resolveSubscriptionEntitlements } from '../lib/billing/subscriptions';

function createMockDb() {
  const calls: string[] = [];
  const state = {
    plans: [{ id: 'plan-trial', code: 'trial', name: 'trial', monthlyPrice: 0, yearlyPrice: 0, monthlyCredits: 0, maxMembers: 5, maxKnowledgeSpaces: 1, storageLimitBytes: 0, featuresJson: '[]', enabled: true }],
    subscriptions: [] as Array<any>,
    creditLedgers: [] as Array<any>,
    creditGrants: [] as Array<any>,
    creditAccounts: [] as Array<any>,
    companies: [{ id: 'company-1' }],
  };

  const prepare = (sql: string) => ({
    get: async (...params: any[]) => {
      calls.push(sql);
      if (sql.includes('FROM "Subscription" s')) {
        const row = state.subscriptions.filter((item) => item.companyId === params[0] && ['trialing', 'active', 'past_due'].includes(item.status)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
        return row ? { ...row, planCode: row.planCode, planName: row.planName } : null;
      }
      if (sql.includes('FROM "Subscription" WHERE')) {
        return state.subscriptions.filter((item) => item.companyId === params[0]).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
      }
      if (sql.includes('FROM "Plan" WHERE code = ?')) return state.plans.find((item) => item.code === params[0]) || null;
      if (sql.includes('FROM "CreditLedger" WHERE "idempotencyKey" = ?')) return state.creditLedgers.find((item) => item.idempotencyKey === params[0]) || null;
      if (sql.includes('FROM "CreditAccount" WHERE "companyId" = ?')) return state.creditAccounts.find((item) => item.companyId === params[0]) || null;
      if (sql.includes('FROM "Company" WHERE id = ?')) return state.companies.find((item) => item.id === params[0]) || null;
      return null;
    },
    all: async () => {
      calls.push(sql);
      if (sql.includes('FROM "Company"')) return state.companies;
      return [];
    },
    run: async (...params: any[]) => {
      calls.push(sql);
      if (sql.includes('INSERT INTO "Subscription"')) {
        state.subscriptions.push({ id: params[0], companyId: params[1], planId: params[2], billingCycle: params[3], status: params[4], startedAt: params[5], expiresAt: params[6], autoRenew: params[7], createdAt: params[8], updatedAt: params[9], planCode: 'trial', planName: '体验版' });
      }
      if (sql.includes('INSERT INTO "CreditGrant"')) {
        state.creditGrants.push({ id: params[0], companyId: params[1] });
      }
      if (sql.includes('INSERT INTO "CreditLedger"')) {
        state.creditLedgers.push({ id: params[0], idempotencyKey: params[10] });
      }
      if (sql.includes('INSERT INTO "CreditAccount"')) {
        state.creditAccounts.push({ id: params[0], companyId: params[1], totalBalance: 0, packageBalance: 0, purchasedBalance: 0, bonusBalance: 0 });
      }
      if (sql.includes('UPDATE "CreditAccount" SET')) {
        const account = state.creditAccounts.find((item) => item.id === params[4]);
        if (account) {
          account.totalBalance = params[0];
          account.packageBalance = params[1];
          account.purchasedBalance = params[2];
          account.bonusBalance = params[3];
        }
      }
      return { changes: 1 };
    },
  });

  return {
    state,
    calls,
    prepare,
    transactionAsync: async (fn: any) => fn({ prepare }),
  };
}

async function main() {
  const db = createMockDb();

  assert.equal(await getCompanySubscription('missing', db as any), null);
  await assert.rejects(() => requireCompanySubscription('missing', db as any), (error: any) => error instanceof BillingError && error.code === 'COMPANY_SUBSCRIPTION_MISSING');

  const created = await initializeTrialSubscriptionForCompany({ companyId: 'company-1', source: 'COMPANY_ONBOARDING', userId: 'user-1', db: db as any });
  assert.equal(created.created, true);
  assert.equal(created.grantCreated, true);
  assert.equal(created.subscription.planCode, 'trial');

  const duplicate = await initializeTrialSubscriptionForCompany({ companyId: 'company-1', source: 'COMPANY_ONBOARDING', userId: 'user-1', db: db as any });
  assert.equal(duplicate.created, false);
  assert.equal(db.state.subscriptions.length, 1);
  assert.equal(db.state.creditLedgers.length, 1);

  const entitlements = resolveSubscriptionEntitlements({ planCode: 'basic', planName: '基础版' });
  assert.equal(entitlements.isLegacy, true);
  assert.equal(entitlements.isDeprecated, true);
  assert.equal(entitlements.memberLimit, 5);

  assert.equal(await getCompanySubscription('missing', db as any), null);
  assert.equal(typeof ensureCompanySubscription, 'function');

  console.log(JSON.stringify({ ok: true, calls: db.calls.length }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
