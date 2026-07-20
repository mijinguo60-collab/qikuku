import assert from 'node:assert/strict';
import { canCompanyUseModel, countQualifyingMonthlyBillingPeriods, resolveCompanyModelAccess, type PaidMembershipPeriod } from '../lib/billing/model-access';
import { getMembershipPlan, getModelBasePoints, getPermanentModelAccessPolicy } from '../lib/billing/commercial-config';

function period(input: Partial<PaidMembershipPeriod> & Pick<PaidMembershipPeriod, 'planCode' | 'billingCycle' | 'periodStart' | 'periodEnd' | 'paymentStatus' | 'orderId'>): PaidMembershipPeriod {
  return {
    ...input,
    refundedAt: input.refundedAt ?? null,
  };
}

const policy = getPermanentModelAccessPolicy();
assert.equal(policy.monthlyPaidMonthsRequired, 3);
assert.deepEqual(policy.eligiblePlanCodes, ['pro', 'enterprise']);
assert.deepEqual(policy.eligibleBillingCycles, ['monthly', 'yearly']);

assert.equal(countQualifyingMonthlyBillingPeriods([]).qualifyingMonthlyPeriodCount, 0);
assert.equal(countQualifyingMonthlyBillingPeriods([
  period({ planCode: 'pro', billingCycle: 'monthly', periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2026-02-01T00:00:00.000Z', paymentStatus: 'paid', paymentCompletedAt: '2026-01-01T00:00:00.000Z', orderId: 'o1' }),
]).qualifyingMonthlyPeriodCount, 1);

const nonContiguous = countQualifyingMonthlyBillingPeriods([
  period({ planCode: 'pro', billingCycle: 'monthly', periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2026-02-01T00:00:00.000Z', paymentStatus: 'paid', paymentCompletedAt: '2026-01-01T00:00:00.000Z', orderId: 'o1' }),
  period({ planCode: 'enterprise', billingCycle: 'monthly', periodStart: '2026-03-01T00:00:00.000Z', periodEnd: '2026-04-01T00:00:00.000Z', paymentStatus: 'paid', paymentCompletedAt: '2026-03-01T00:00:00.000Z', orderId: 'o2' }),
  period({ planCode: 'pro', billingCycle: 'monthly', periodStart: '2026-05-01T00:00:00.000Z', periodEnd: '2026-06-01T00:00:00.000Z', paymentStatus: 'paid', paymentCompletedAt: '2026-05-01T00:00:00.000Z', orderId: 'o3' }),
]);
assert.equal(nonContiguous.qualifyingMonthlyPeriodCount, 3);

const overlapping = countQualifyingMonthlyBillingPeriods([
  period({ planCode: 'pro', billingCycle: 'monthly', periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2026-03-01T00:00:00.000Z', paymentStatus: 'paid', paymentCompletedAt: '2026-01-01T00:00:00.000Z', orderId: 'o1' }),
  period({ planCode: 'enterprise', billingCycle: 'monthly', periodStart: '2026-02-01T00:00:00.000Z', periodEnd: '2026-04-01T00:00:00.000Z', paymentStatus: 'paid', paymentCompletedAt: '2026-02-01T00:00:00.000Z', orderId: 'o2' }),
]);
assert.equal(overlapping.qualifyingMonthlyPeriodCount, 1);

const duplicateOrder = countQualifyingMonthlyBillingPeriods([
  period({ planCode: 'pro', billingCycle: 'monthly', periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2026-02-01T00:00:00.000Z', paymentStatus: 'paid', paymentCompletedAt: '2026-01-01T00:00:00.000Z', orderId: 'o1' }),
  period({ planCode: 'pro', billingCycle: 'monthly', periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2026-02-01T00:00:00.000Z', paymentStatus: 'paid', paymentCompletedAt: '2026-01-01T00:00:00.000Z', orderId: 'o1' }),
]);
assert.equal(duplicateOrder.qualifyingMonthlyPeriodCount, 1);

const refundedExcluded = countQualifyingMonthlyBillingPeriods([
  period({ planCode: 'pro', billingCycle: 'monthly', periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2026-02-01T00:00:00.000Z', paymentStatus: 'refunded', refundedAt: '2026-01-10T00:00:00.000Z', paymentCompletedAt: '2026-01-01T00:00:00.000Z', orderId: 'o1' }),
  period({ planCode: 'pro', billingCycle: 'monthly', periodStart: '2026-02-01T00:00:00.000Z', periodEnd: '2026-03-01T00:00:00.000Z', paymentStatus: 'failed', paymentCompletedAt: null, orderId: 'o2' }),
]);
assert.equal(refundedExcluded.qualifyingMonthlyPeriodCount, 0);

const activePro = resolveCompanyModelAccess({ companyId: 'c1', activePlanCode: 'pro' });
assert.equal(activePro.accessScope, 'ALL_MODELS');
assert.equal(activePro.isPermanent, false);
assert.equal(activePro.source, 'ACTIVE_MEMBERSHIP');
assert.equal(canCompanyUseModel(activePro, 'gpt-5.4'), true);

const trial = resolveCompanyModelAccess({ companyId: 'c1', activePlanCode: 'trial' });
assert.equal(trial.accessScope, 'DEEPSEEK_ONLY');
assert.equal(canCompanyUseModel(trial, 'deepseek-v4-pro'), true);
assert.equal(canCompanyUseModel(trial, 'gpt-5.4'), false);

const milestoneUnlock = resolveCompanyModelAccess({
  companyId: 'c1',
  activePlanCode: 'pro',
  paidMembershipPeriods: [
    period({ planCode: 'pro', billingCycle: 'monthly', periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2026-02-01T00:00:00.000Z', paymentStatus: 'paid', paymentCompletedAt: '2026-01-01T00:00:00.000Z', orderId: 'o1' }),
    period({ planCode: 'pro', billingCycle: 'monthly', periodStart: '2026-03-01T00:00:00.000Z', periodEnd: '2026-04-01T00:00:00.000Z', paymentStatus: 'paid', paymentCompletedAt: '2026-03-01T00:00:00.000Z', orderId: 'o2' }),
    period({ planCode: 'enterprise', billingCycle: 'monthly', periodStart: '2026-05-01T00:00:00.000Z', periodEnd: '2026-06-01T00:00:00.000Z', paymentStatus: 'paid', paymentCompletedAt: '2026-05-01T00:00:00.000Z', orderId: 'o3' }),
  ],
});
assert.equal(milestoneUnlock.isPermanent, true);
assert.equal(milestoneUnlock.source, 'MONTHLY_PURCHASE_MILESTONE');
assert.equal(milestoneUnlock.qualifyingMonthlyPeriodCount, 3);

const yearlyUnlock = resolveCompanyModelAccess({
  companyId: 'c1',
  activePlanCode: 'enterprise',
  paidMembershipPeriods: [
    period({ planCode: 'enterprise', billingCycle: 'yearly', periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2027-01-01T00:00:00.000Z', paymentStatus: 'paid', paymentCompletedAt: '2026-01-01T00:00:00.000Z', orderId: 'o4' }),
  ],
});
assert.equal(yearlyUnlock.isPermanent, true);
assert.equal(yearlyUnlock.source, 'ANNUAL_PURCHASE');

const refundedYearly = resolveCompanyModelAccess({
  companyId: 'c1',
  activePlanCode: 'enterprise',
  paidMembershipPeriods: [
    period({ planCode: 'enterprise', billingCycle: 'yearly', periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2027-01-01T00:00:00.000Z', paymentStatus: 'paid', refundedAt: '2026-03-01T00:00:00.000Z', paymentCompletedAt: '2026-01-01T00:00:00.000Z', orderId: 'o5' }),
  ],
});
assert.equal(refundedYearly.isPermanent, false);

const superAgentUnlock = resolveCompanyModelAccess({ companyId: 'c1', activePlanCode: 'trial', isSuperAgentSelfCompany: true });
assert.equal(superAgentUnlock.isPermanent, true);
assert.equal(superAgentUnlock.source, 'SUPER_AGENT_SELF_COMPANY');

const legacyUnlock = resolveCompanyModelAccess({ companyId: 'c1', activePlanCode: 'pro', permanentEntitlements: [{ type: 'ALL_MODELS_PERMANENT', source: 'LEGACY_MIGRATION', effectiveAt: '2026-01-01T00:00:00.000Z' }] });
assert.equal(legacyUnlock.isPermanent, true);
assert.equal(legacyUnlock.source, 'LEGACY_COMPATIBILITY');

const expiredMembership = resolveCompanyModelAccess({ companyId: 'c1', activePlanCode: null, permanentEntitlements: [{ type: 'ALL_MODELS_PERMANENT', source: 'MONTHLY_MILESTONE', effectiveAt: '2026-01-01T00:00:00.000Z' }] });
assert.equal(expiredMembership.isPermanent, true);
assert.equal(expiredMembership.accessScope, 'ALL_MODELS');
assert.equal(expiredMembership.qualifyingMonthlyPeriodCount, 0);

assert.equal(getMembershipPlan('trial').allowedModels.length, 2);
assert.equal(getModelBasePoints('gpt-5.4'), 10);
assert.equal(getModelBasePoints('deepseek-v4-pro'), 10);
assert.equal(getModelBasePoints('gemini-3.1-pro'), 30);

assert.throws(() => canCompanyUseModel(trial, 'unknown-model'), /UNKNOWN_MODEL_ID:/);
assert.equal(activePro.allowedModels, 'ALL');
assert.equal(expiredMembership.reason.includes('永久'), true);

assert.equal(getMembershipPlan('enterprise').memberLimit, 100);
assert.equal(getMembershipPlan('enterprise').dailyImageLimitPerMember, 100);
assert.equal(getMembershipPlan('trial').memberLimit, 5);
assert.equal(getMembershipPlan('trial').dailyImageLimitPerMember, 2);

assert.equal(countQualifyingMonthlyBillingPeriods([
  period({ planCode: 'pro', billingCycle: 'monthly', periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2026-02-01T00:00:00.000Z', paymentStatus: 'paid', paymentCompletedAt: '2026-01-01T00:00:00.000Z', orderId: 'dup-order' }),
  period({ planCode: 'pro', billingCycle: 'monthly', periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2026-02-01T00:00:00.000Z', paymentStatus: 'paid', paymentCompletedAt: '2026-01-01T00:00:00.000Z', orderId: 'dup-order' }),
]).qualifyingMonthlyPeriodCount, 1);

assert.equal(countQualifyingMonthlyBillingPeriods([
  period({ planCode: 'pro', billingCycle: 'monthly', periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2026-02-01T00:00:00.000Z', paymentStatus: 'paid', paymentCompletedAt: '2026-01-01T00:00:00.000Z', orderId: 'overlap-a' }),
  period({ planCode: 'enterprise', billingCycle: 'monthly', periodStart: '2026-01-15T00:00:00.000Z', periodEnd: '2026-02-15T00:00:00.000Z', paymentStatus: 'paid', paymentCompletedAt: '2026-01-15T00:00:00.000Z', orderId: 'overlap-b' }),
]).qualifyingMonthlyPeriodCount, 1);

console.log(JSON.stringify({ ok: true, qualifyingMonthlyPeriodCount: nonContiguous.qualifyingMonthlyPeriodCount }));
