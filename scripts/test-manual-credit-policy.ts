import assert from 'node:assert/strict';
import {
  MANUAL_CREDIT_DUAL_CONFIRM_AMOUNT,
  planManualDeduction,
  planManualGrant,
  validateManualCreditRequest,
} from '../lib/billing/manual-credit-policy';

const account = { totalBalance: 120, packageBalance: 30, purchasedBalance: 40, bonusBalance: 50 };
const valid = validateManualCreditRequest({
  direction: 'grant',
  amount: MANUAL_CREDIT_DUAL_CONFIRM_AMOUNT,
  reason: '活动补偿积分',
  idempotencyKey: 'manual-credit-operation-0001',
});
assert.equal(valid.ok, true);
if (valid.ok) assert.equal(valid.value.requiresDualConfirmation, true);

assert.equal(validateManualCreditRequest({ direction: 'grant', amount: 0, reason: '活动补偿积分', idempotencyKey: 'manual-credit-operation-0001' }).ok, false);
assert.equal(validateManualCreditRequest({ direction: 'grant', amount: 1, reason: 'Bearer private-value', idempotencyKey: 'manual-credit-operation-0001' }).ok, false);
assert.equal(validateManualCreditRequest({ direction: 'grant', amount: 1, reason: '活动补偿积分', idempotencyKey: 'short' }).ok, false);

assert.deepEqual(planManualGrant(account, 10), { totalBalance: 130, packageBalance: 30, purchasedBalance: 40, bonusBalance: 60 });

const plan = planManualDeduction(account, [
  { id: 'later', sourceType: 'manual', remainingAmount: 30, expiresAt: null, createdAt: new Date('2026-07-02T00:00:00Z') },
  { id: 'first', sourceType: 'manual', remainingAmount: 20, expiresAt: new Date('2026-07-01T00:00:00Z'), createdAt: new Date('2026-07-01T00:00:00Z') },
  { id: 'purchased', sourceType: 'purchase', remainingAmount: 40, expiresAt: null, createdAt: new Date('2026-07-01T00:00:00Z') },
], 35);
assert.deepEqual(plan.parts, [{ grantId: 'first', amount: 20 }, { grantId: 'later', amount: 15 }]);
assert.deepEqual(plan.account, { totalBalance: 85, packageBalance: 30, purchasedBalance: 40, bonusBalance: 15 });
assert.throws(() => planManualDeduction(account, [], 1), /可撤销的人工赠送积分不足/);

console.log('manual-credit-policy: passed');
