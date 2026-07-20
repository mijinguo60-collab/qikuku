import assert from 'node:assert/strict';
import { createCreditLedgerAllocations, getCreditLedgerAllocations } from '../lib/billing/credit-ledger-allocations';
import { createMembershipBillingPeriod, getMembershipBillingPeriod, invalidateMembershipBillingPeriod, listQualifyingMonthlyBillingPeriods } from '../lib/billing/billing-periods';
import { grantCompanyEntitlement, hasActiveCompanyEntitlement, revokeCompanyEntitlementGrant } from '../lib/billing/entitlement-grants';
import { getMembershipPlan } from '../lib/billing/commercial-config';
import { canCompanyUseModel, countQualifyingMonthlyBillingPeriods, resolveCompanyModelAccess } from '../lib/billing/model-access';
import { markMembershipPointGrantRunGranted, markMembershipPointGrantRunReversed, markMembershipPointGrantRunFailed, markMembershipPointGrantRunSkipped, scheduleMembershipPointGrantRun, startMembershipPointGrantRun, getMembershipPointGrantRun } from '../lib/billing/membership-point-grant-runs';

type Row = Record<string, any>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

async function expectBillingError(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: any) => error instanceof Error && String((error as any).code || '').includes(code));
}

function createMockDb() {
  const state = {
    billingPeriods: [] as Row[],
    entitlements: [] as Row[],
    pointRuns: [] as Row[],
    ledgers: [] as Row[],
    allocations: [] as Row[],
    creditGrants: [] as Row[],
    companies: [{ id: 'company-1' }, { id: 'company-2' }],
    subscriptions: [{ id: 'sub-1', companyId: 'company-1' }, { id: 'sub-2', companyId: 'company-1' }],
    ledgersMeta: [{ id: 'ledger-consume', companyId: 'company-1', amount: -100, type: 'debit' }, { id: 'ledger-income', companyId: 'company-1', amount: 100, type: 'credit' }],
  };

  const prepare = (sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, ' ').trim();

    return ({
    get: async (...params: any[]) => {
      if (normalizedSql.includes('FROM "MembershipBillingPeriod" WHERE id = ?')) return clone(state.billingPeriods.find((row) => row.id === params[0]) || null);
      if (normalizedSql.includes('FROM "MembershipBillingPeriod" WHERE "provider" = ? AND "externalPeriodKey" = ?')) return clone(state.billingPeriods.find((row) => row.provider === params[0] && row.externalPeriodKey === params[1]) || null);
      if (normalizedSql.includes('FROM "CompanyEntitlementGrant" WHERE id = ?')) return clone(state.entitlements.find((row) => row.id === params[0]) || null);
      if (normalizedSql.includes('FROM "CompanyEntitlementGrant" WHERE "companyId" = ? AND "entitlementType" = ? AND "sourceType" = ? AND "sourceId" = ?')) return clone(state.entitlements.find((row) => row.companyId === params[0] && row.entitlementType === params[1] && row.sourceType === params[2] && row.sourceId === params[3]) || null);
      if (normalizedSql.includes('FROM "CompanyEntitlementGrant" WHERE "companyId" = ? AND "entitlementType" = ? AND "effectiveAt" <= ? AND "revokedAt" IS NULL LIMIT 1')) {
        return clone(state.entitlements.find((row) => row.companyId === params[0] && row.entitlementType === params[1] && !row.revokedAt && new Date(row.effectiveAt).getTime() <= new Date(params[2]).getTime()) || null);
      }
      if (normalizedSql.includes('FROM "CompanyEntitlementGrant" WHERE "companyId" = ? AND "entitlementType" = ? AND "effectiveAt" <= ? AND "revokedAt" IS NULL ORDER BY')) {
        return clone(state.entitlements.filter((row) => row.companyId === params[0] && row.entitlementType === params[1] && !row.revokedAt && new Date(row.effectiveAt).getTime() <= new Date(params[2]).getTime()).sort((a, b) => String(a.effectiveAt).localeCompare(String(b.effectiveAt))));
      }
      if (normalizedSql.includes('FROM "MembershipPointGrantRun" WHERE "idempotencyKey" = ?')) return clone(state.pointRuns.find((row) => row.idempotencyKey === params[0]) || null);
      if (normalizedSql.includes('FROM "MembershipPointGrantRun" WHERE "subscriptionId" = ? AND "grantPeriodKey" = ?')) return clone(state.pointRuns.find((row) => row.subscriptionId === params[0] && row.grantPeriodKey === params[1]) || null);
      if (normalizedSql.includes('FROM "MembershipPointGrantRun" WHERE id = ?')) return clone(state.pointRuns.find((row) => row.id === params[0]) || null);
      if (normalizedSql.includes('FROM "CreditLedger" WHERE id = ?')) return clone(state.ledgersMeta.find((row) => row.id === params[0]) || null);
      if (normalizedSql.includes('FROM "CreditLedgerAllocation" WHERE "ledgerId" = ? AND "creditGrantId" = ?')) return clone(state.allocations.find((row) => row.ledgerId === params[0] && row.creditGrantId === params[1]) || null);
      if (normalizedSql.includes('FROM "CreditLedgerAllocation" WHERE id = ?')) return clone(state.allocations.find((row) => row.id === params[0]) || null);
      return null;
    },
    all: async (...params: any[]) => {
      if (normalizedSql.includes('FROM "MembershipBillingPeriod"')) {
        return clone(state.billingPeriods.filter((row) => row.companyId === params[0] && row.planCode !== 'trial' && row.billingCycle === 'monthly' && row.status === 'PAID' && row.paymentCompletedAt && !row.refundedAt && !row.cancelledAt && !row.invalidatedAt).sort((a, b) => String(a.periodStart).localeCompare(String(b.periodStart))));
      }
      if (normalizedSql.includes('FROM "CompanyEntitlementGrant"')) {
        return clone(state.entitlements.filter((row) => row.companyId === params[0] && row.entitlementType === params[1] && !row.revokedAt && new Date(row.effectiveAt).getTime() <= new Date(params[2]).getTime()).sort((a, b) => String(a.effectiveAt).localeCompare(String(b.effectiveAt))));
      }
      if (normalizedSql.includes('FROM "CreditLedgerAllocation" WHERE "ledgerId" = ?')) return clone(state.allocations.filter((row) => row.ledgerId === params[0]).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))));
      return [];
    },
    run: async (...params: any[]) => {
      if (normalizedSql.includes('INSERT INTO "MembershipBillingPeriod"')) {
        state.billingPeriods.push({ id: params[0], companyId: params[1], subscriptionId: params[2], paymentOrderId: params[3], provider: params[4], externalPeriodKey: params[5], planCode: params[6], billingCycle: params[7], periodStart: params[8], periodEnd: params[9], status: params[10], paymentCompletedAt: params[11], refundedAt: params[12], cancelledAt: params[13], invalidatedAt: params[14], invalidationReason: params[15], metadataJson: params[16], createdAt: params[17], updatedAt: params[18] });
      }
      if (normalizedSql.includes('UPDATE "MembershipBillingPeriod" SET status = ?')) {
        const row = state.billingPeriods.find((item) => item.id === params[4]);
        if (row) { row.status = params[0]; row.invalidatedAt = params[1]; row.invalidationReason = params[2]; row.updatedAt = params[3]; }
      }
      if (normalizedSql.includes('INSERT INTO "CompanyEntitlementGrant"')) {
        state.entitlements.push({ id: params[0], companyId: params[1], entitlementType: params[2], sourceType: params[3], sourceId: params[4], sourceOrderId: params[5], grantedAt: params[6], effectiveAt: params[7], revokedAt: params[8], revocationReason: params[9], metadataJson: params[10], createdAt: params[11], updatedAt: params[12] });
      }
      if (normalizedSql.includes('UPDATE "CompanyEntitlementGrant" SET "revokedAt" = ?')) {
        const row = state.entitlements.find((item) => item.id === params[3]);
        if (row) { row.revokedAt = params[0]; row.revocationReason = params[1]; row.updatedAt = params[2]; }
      }
      if (normalizedSql.includes('INSERT INTO "MembershipPointGrantRun"')) {
        state.pointRuns.push({ id: params[0], companyId: params[1], subscriptionId: params[2], billingPeriodId: params[3], planCode: params[4], grantPeriodKey: params[5], grantPeriodStart: params[6], grantPeriodEnd: params[7], scheduledAt: params[8], grantedAt: params[9], points: params[10], status: params[11], creditGrantId: params[12], idempotencyKey: params[13], attemptCount: params[14], lastAttemptAt: params[15], failureReason: params[16], metadataJson: params[17], createdAt: params[18], updatedAt: params[19] });
      }
      if (normalizedSql.includes('UPDATE "MembershipPointGrantRun" SET status = ?, "attemptCount" = "attemptCount" + 1')) {
        const row = state.pointRuns.find((item) => item.id === params[3]);
        if (row) { row.status = 'PROCESSING'; row.attemptCount += 1; row.lastAttemptAt = params[1]; row.updatedAt = params[2]; }
      }
      if (normalizedSql.includes('UPDATE "MembershipPointGrantRun" SET status = ?, "creditGrantId" = ?, "grantedAt" = ?, "updatedAt" = ?')) {
        const row = state.pointRuns.find((item) => item.id === params[4]);
        if (row) { row.status = 'GRANTED'; row.creditGrantId = params[1]; row.grantedAt = params[2]; row.updatedAt = params[3]; }
      }
      if (normalizedSql.includes('UPDATE "MembershipPointGrantRun" SET status = ?, "failureReason" = ?, "updatedAt" = ?')) {
        const row = state.pointRuns.find((item) => item.id === params[3]);
        if (row) { row.status = params[0]; row.failureReason = params[1]; row.updatedAt = params[2]; }
      }
      if (normalizedSql.includes('INSERT INTO "CreditLedgerAllocation"')) {
        state.allocations.push({ id: params[0], ledgerId: params[1], creditGrantId: params[2], amount: params[3], createdAt: params[4] });
      }
      return { changes: 1 };
    },
    });
  };

  return {
    state,
    prepare,
    transactionAsync: async (fn: any) => fn({ prepare, transactionAsync: undefined }),
  };
}

async function main() {
  const db = createMockDb();

  const created = await createMembershipBillingPeriod({
    companyId: 'company-1',
    subscriptionId: 'sub-1',
    paymentOrderId: 'order-1',
    provider: 'WECHAT',
    externalPeriodKey: 'WECHAT:period-1',
    planCode: 'pro',
    billingCycle: 'monthly',
    periodStart: '2026-07-01T00:00:00.000Z',
    periodEnd: '2026-08-01T00:00:00.000Z',
    status: 'PAID',
    paymentCompletedAt: '2026-07-01T00:00:00.000Z',
  }, db as any);
  assert.equal(created?.planCode, 'pro');
  assert.equal((await getMembershipBillingPeriod({ provider: 'WECHAT', externalPeriodKey: 'WECHAT:period-1' }, db as any))?.id, created?.id);
  const duplicate = await createMembershipBillingPeriod({
    companyId: 'company-1', subscriptionId: 'sub-1', paymentOrderId: 'order-1', provider: 'WECHAT', externalPeriodKey: 'WECHAT:period-1', planCode: 'pro', billingCycle: 'monthly', periodStart: '2026-07-01T00:00:00.000Z', periodEnd: '2026-08-01T00:00:00.000Z', status: 'PAID', paymentCompletedAt: '2026-07-01T00:00:00.000Z',
  }, db as any);
  assert.equal(duplicate?.id, created?.id);
  assert.equal((await invalidateMembershipBillingPeriod({ provider: 'WECHAT', externalPeriodKey: 'WECHAT:period-1', invalidationReason: 'manual' }, db as any))?.status, 'INVALIDATED');
  assert.equal((await listQualifyingMonthlyBillingPeriods('company-1', db as any)).length, 0);

  await expectBillingError(createMembershipBillingPeriod({
    companyId: 'company-1', provider: 'WECHAT', externalPeriodKey: 'bad-period', planCode: 'pro', billingCycle: 'monthly', periodStart: '2026-08-01T00:00:00.000Z', periodEnd: '2026-07-01T00:00:00.000Z', status: 'PAID', paymentCompletedAt: '2026-07-01T00:00:00.000Z',
  }, db as any), 'BILLING_PERIOD_INVALID');
  await expectBillingError(createMembershipBillingPeriod({
    companyId: 'company-1', provider: 'WECHAT', externalPeriodKey: 'missing-paid-time', planCode: 'pro', billingCycle: 'monthly', periodStart: '2026-07-01T00:00:00.000Z', periodEnd: '2026-08-01T00:00:00.000Z', status: 'PAID',
  }, db as any), 'BILLING_PERIOD_INVALID');
  await assert.rejects(createMembershipBillingPeriod({
    companyId: 'company-1', provider: 'WECHAT', externalPeriodKey: 'unknown-plan', planCode: 'unknown', billingCycle: 'monthly', periodStart: '2026-07-01T00:00:00.000Z', periodEnd: '2026-08-01T00:00:00.000Z', status: 'PAID', paymentCompletedAt: '2026-07-01T00:00:00.000Z',
  }, db as any), /UNKNOWN_PLAN_CODE:/);

  const entitlement = await grantCompanyEntitlement({ companyId: 'company-1', entitlementType: 'ALL_MODELS_PERMANENT', sourceType: 'ANNUAL_PURCHASE', sourceId: 'ent-1', sourceOrderId: 'order-annual-1', effectiveAt: '2026-07-01T00:00:00.000Z' }, db as any);
  assert.equal(entitlement?.sourceType, 'ANNUAL_PURCHASE');
  assert.equal(await hasActiveCompanyEntitlement('company-1', 'ALL_MODELS_PERMANENT', db as any), true);
  const annualDuplicate = await grantCompanyEntitlement({ companyId: 'company-1', entitlementType: 'ALL_MODELS_PERMANENT', sourceType: 'ANNUAL_PURCHASE', sourceId: 'ent-1', sourceOrderId: 'order-annual-1', effectiveAt: '2026-07-01T00:00:00.000Z' }, db as any);
  assert.equal(annualDuplicate?.id, entitlement?.id);
  await expectBillingError(grantCompanyEntitlement({ companyId: 'company-1', entitlementType: 'ALL_MODELS_PERMANENT', sourceType: 'ANNUAL_PURCHASE', sourceId: 'ent-1', sourceOrderId: 'order-annual-2', effectiveAt: '2026-07-01T00:00:00.000Z' }, db as any), 'ENTITLEMENT_GRANT_IDEMPOTENCY_CONFLICT');
  assert.equal((await revokeCompanyEntitlementGrant({ id: entitlement?.id, revocationReason: 'refund' }, db as any))?.revokedAt !== null, true);
  assert.equal(await hasActiveCompanyEntitlement('company-1', 'ALL_MODELS_PERMANENT', db as any), false);

  const run = await scheduleMembershipPointGrantRun({ companyId: 'company-1', subscriptionId: 'sub-1', billingPeriodId: 'period-1', planCode: 'pro', grantPeriodKey: '2026-07', grantPeriodStart: '2026-07-01T00:00:00.000Z', grantPeriodEnd: '2026-08-01T00:00:00.000Z', scheduledAt: '2026-07-01T00:00:00.000Z', points: 120000, idempotencyKey: 'MEMBERSHIP_POINTS:sub-1:2026-07' }, db as any);
  assert.equal(run?.points, 120000);
  const duplicateRun = await scheduleMembershipPointGrantRun({ companyId: 'company-1', subscriptionId: 'sub-1', billingPeriodId: 'period-1', planCode: 'pro', grantPeriodKey: '2026-07', grantPeriodStart: '2026-07-01T00:00:00.000Z', grantPeriodEnd: '2026-08-01T00:00:00.000Z', scheduledAt: '2026-07-01T00:00:00.000Z', points: 120000, idempotencyKey: 'MEMBERSHIP_POINTS:sub-1:2026-07' }, db as any);
  assert.equal(duplicateRun?.id, run?.id);
  assert.equal((await startMembershipPointGrantRun(run!.id, db as any))?.status, 'PROCESSING');
  await expectBillingError(markMembershipPointGrantRunSkipped(run!.id, 'later', db as any), 'MEMBERSHIP_POINT_RUN_INVALID_TRANSITION');
  await expectBillingError(markMembershipPointGrantRunGranted(run!.id, '', db as any), 'MEMBERSHIP_POINT_RUN_INVALID');
  const failed = await markMembershipPointGrantRunFailed(run!.id, 'err', db as any);
  assert.equal(failed?.status, 'FAILED');
  assert.equal((await startMembershipPointGrantRun(run!.id, db as any))?.status, 'PROCESSING');
  const granted = await markMembershipPointGrantRunGranted(run!.id, 'grant-1', db as any);
  assert.equal(granted?.creditGrantId, 'grant-1');
  await expectBillingError(markMembershipPointGrantRunGranted(run!.id, 'grant-2', db as any), 'MEMBERSHIP_POINT_RUN_IDEMPOTENCY_CONFLICT');
  const reversed = await markMembershipPointGrantRunReversed(run!.id, 'refund', db as any);
  assert.equal(reversed?.status, 'REVERSED');
  assert.equal((await getMembershipPointGrantRun(run!.id, db as any))?.status, 'REVERSED');

  await expectBillingError(scheduleMembershipPointGrantRun({ companyId: 'company-1', subscriptionId: 'sub-1', planCode: 'pro', grantPeriodKey: '2026-08', grantPeriodStart: '2026-08-01T00:00:00.000Z', grantPeriodEnd: '2026-09-01T00:00:00.000Z', scheduledAt: '2026-08-01T00:00:00.000Z', points: 10, idempotencyKey: 'bad-points' }, db as any), 'MEMBERSHIP_POINT_RUN_INVALID');
  const validRun = await scheduleMembershipPointGrantRun({ companyId: 'company-1', subscriptionId: 'sub-1', planCode: 'pro', grantPeriodKey: '2026-08', grantPeriodStart: '2026-08-01T00:00:00.000Z', grantPeriodEnd: '2026-09-01T00:00:00.000Z', scheduledAt: '2026-08-01T00:00:00.000Z', points: 120000, idempotencyKey: 'MEMBERSHIP_POINTS:sub-1:2026-08' }, db as any);
  assert.equal(validRun?.planCode, 'pro');
  await expectBillingError(scheduleMembershipPointGrantRun({ companyId: 'company-1', subscriptionId: 'sub-1', planCode: 'pro', grantPeriodKey: '2026-08', grantPeriodStart: '2026-08-01T00:00:00.000Z', grantPeriodEnd: '2026-09-01T00:00:00.000Z', scheduledAt: '2026-08-01T00:00:00.000Z', points: 120000, idempotencyKey: 'MEMBERSHIP_POINTS:sub-1:2026-08-conflict' }, db as any), 'MEMBERSHIP_POINT_RUN_IDEMPOTENCY_CONFLICT');
  const ledgerAllocations = await createCreditLedgerAllocations({ ledgerId: 'ledger-consume', allocations: [{ creditGrantId: 'grant-a', amount: 30 }, { creditGrantId: 'grant-b', amount: 70 }] }, db as any);
  assert.equal(ledgerAllocations.length, 2);
  assert.equal((await getCreditLedgerAllocations('ledger-consume', db as any)).length, 2);
  await expectBillingError(createCreditLedgerAllocations({ ledgerId: 'ledger-consume', allocations: [{ creditGrantId: 'grant-a', amount: 100 }] }, db as any), 'CREDIT_ALLOCATION_IDEMPOTENCY_CONFLICT');
  await expectBillingError(createCreditLedgerAllocations({ ledgerId: 'ledger-income', allocations: [{ creditGrantId: 'grant-a', amount: 100 }] }, db as any), 'CREDIT_ALLOCATION_INVALID');

  assert.equal(getMembershipPlan('trial').memberLimit, 5);
  assert.equal(getMembershipPlan('pro').dailyImageLimitPerMember, 20);
  assert.equal(countQualifyingMonthlyBillingPeriods([]).qualifyingMonthlyPeriodCount, 0);
  assert.equal(resolveCompanyModelAccess({ companyId: 'company-1', activePlanCode: 'trial' }).accessScope, 'DEEPSEEK_ONLY');
  assert.equal(canCompanyUseModel(resolveCompanyModelAccess({ companyId: 'company-1', activePlanCode: 'pro' }), 'gpt-5.4'), true);

  console.log(JSON.stringify({ ok: true, billingPeriods: db.state.billingPeriods.length, entitlements: db.state.entitlements.length, pointRuns: db.state.pointRuns.length, allocations: db.state.allocations.length }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
