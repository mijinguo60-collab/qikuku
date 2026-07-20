import assert from 'node:assert/strict';
import { calculateEstimatedChatPoints, canPlanUseModel, getAgentWholesalePrice, getContextMultiplier, getMembershipPlan, getModelBasePoints, getModelCreditLabel, getRechargeTierByAmountCents, isDeprecatedPlanCode, PLAN_CATALOG, RECHARGE_OPTIONS, SUPER_AGENT_CONFIG } from '../lib/billing/pricing';
import { getPermanentModelAccessPolicy } from '../lib/billing/commercial-config';

function expectError(fn: () => unknown, prefix: string) {
  assert.throws(fn, (error) => error instanceof Error && error.message.startsWith(prefix));
}

assert.equal(getMembershipPlan('trial').memberLimit, 5);
assert.equal(getMembershipPlan('trial').dailyImageLimitPerMember, 2);
assert.equal(getMembershipPlan('pro').memberLimit, 20);
assert.equal(getMembershipPlan('pro').dailyImageLimitPerMember, 20);
assert.equal(getMembershipPlan('enterprise').memberLimit, 100);
assert.equal(getMembershipPlan('enterprise').dailyImageLimitPerMember, 100);

assert.deepEqual(getMembershipPlan('trial').allowedModels, ['deepseek-v4-flash', 'deepseek-v4-pro']);
assert.equal(canPlanUseModel('trial', 'deepseek-v4-flash'), true);
assert.equal(canPlanUseModel('trial', 'gpt-5.4'), false);
assert.equal(canPlanUseModel('pro', 'gpt-5.4'), true);
assert.equal(canPlanUseModel('enterprise', 'claude-opus-4-8'), true);

assert.equal(getModelBasePoints('gpt-5.4'), 10);
assert.equal(getModelBasePoints('deepseek-v4-pro'), 10);
assert.equal(getModelBasePoints('gemini-3.1-pro'), 30);
assert.equal(getModelCreditLabel('gpt-5.4'), '10积分起/次');

assert.equal(getContextMultiplier(5000), 1);
assert.equal(getContextMultiplier(5001), 2);
assert.equal(getContextMultiplier(15001), 4);
assert.equal(getContextMultiplier(30001), 8);
assert.equal(calculateEstimatedChatPoints('gpt-5.4', 16000), 40);

assert.equal(getRechargeTierByAmountCents(100000).basePoints, 100000);
assert.equal(getRechargeTierByAmountCents(100000).bonusPoints, 15000);
assert.equal(getRechargeTierByAmountCents(300000).basePoints, 300000);
assert.equal(getRechargeTierByAmountCents(300000).bonusPoints, 60000);
for (const tier of RECHARGE_OPTIONS) assert.equal(tier.baseCredits, tier.amountCents);

assert.equal(isDeprecatedPlanCode('basic'), true);
assert.equal(isDeprecatedPlanCode('custom'), true);
assert.equal(isDeprecatedPlanCode('trial'), false);

assert.equal(PLAN_CATALOG.some((plan) => plan.code === 'trial' && plan.monthlyGrantedPoints === 0), true);
assert.equal(getMembershipPlan('pro').trainingBenefits.length, 1);
assert.equal(getMembershipPlan('enterprise').trainingBenefits.length, 2);
assert.ok(getMembershipPlan('trial').features.some((feature) => feature.includes('DeepSeek V4 Flash')));

expectError(() => getMembershipPlan('unknown'), 'UNKNOWN_PLAN_CODE:');
expectError(() => getModelBasePoints('unknown-model'), 'UNKNOWN_MODEL_ID:');
expectError(() => getRechargeTierByAmountCents(123), 'UNKNOWN_RECHARGE_AMOUNT:');
expectError(() => getAgentWholesalePrice('trial', 'monthly'), 'AGENT_PRICING_NOT_AVAILABLE:');

assert.equal(getAgentWholesalePrice('pro', 'monthly'), 89900);
assert.equal(getAgentWholesalePrice('pro', 'yearly'), 890000);
assert.equal(getAgentWholesalePrice('enterprise', 'monthly'), 279900);
assert.equal(getAgentWholesalePrice('enterprise', 'yearly'), 2790000);
assert.equal(SUPER_AGENT_CONFIG.demoPoints, 300000);
assert.equal(SUPER_AGENT_CONFIG.leadPoolPoints, 300000);
assert.equal(SUPER_AGENT_CONFIG.rechargePurchaseRate, 0.8);
assert.equal(getPermanentModelAccessPolicy().monthlyPaidMonthsRequired, 3);

console.log(JSON.stringify({ ok: true }));
