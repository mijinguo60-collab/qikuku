/**
 * Pure policy for a future platform-admin manual-credit workflow.
 *
 * This module deliberately has no database or HTTP dependencies.  A future
 * write service must execute its plan in one database transaction while it
 * holds the target CreditAccount row lock.
 */

export const MANUAL_CREDIT_SOURCE_TYPE = 'manual';
export const MANUAL_CREDIT_FEATURE_TYPE = 'manual_adjustment';
export const MANUAL_CREDIT_MAX_AMOUNT = 100_000;
export const MANUAL_CREDIT_DUAL_CONFIRM_AMOUNT = 20_000;

export type ManualCreditDirection = 'grant' | 'deduct';

export type CreditBuckets = {
  totalBalance: number;
  packageBalance: number;
  purchasedBalance: number;
  bonusBalance: number;
};

export type ManualGrantCandidate = {
  id: string;
  sourceType: string;
  remainingAmount: number;
  expiresAt: Date | null;
  createdAt: Date;
};

export type NormalizedManualCreditRequest = {
  direction: ManualCreditDirection;
  amount: number;
  reason: string;
  idempotencyKey: string;
  requiresDualConfirmation: boolean;
};

export type ManualDeductionPart = {
  grantId: string;
  amount: number;
};

const SENSITIVE_REASON_PATTERN = /\b(?:bearer\s+\S+|authorization\s*[:=]|cookie\s*[:=]|(?:postgres|postgresql):\/\/|(?:api[_-]?key|secret|token)\s*[:=])\b/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function validBuckets(value: CreditBuckets) {
  return [value.totalBalance, value.packageBalance, value.purchasedBalance, value.bonusBalance]
    .every((amount) => isSafeInteger(amount) && amount >= 0)
    && value.totalBalance === value.packageBalance + value.purchasedBalance + value.bonusBalance;
}

export function validateManualCreditRequest(input: {
  direction: unknown;
  amount: unknown;
  reason: unknown;
  idempotencyKey: unknown;
}): { ok: true; value: NormalizedManualCreditRequest } | { ok: false; error: string } {
  if (input.direction !== 'grant' && input.direction !== 'deduct') {
    return { ok: false, error: '人工积分操作方向无效' };
  }
  if (!isSafeInteger(input.amount) || input.amount <= 0 || input.amount > MANUAL_CREDIT_MAX_AMOUNT) {
    return { ok: false, error: '人工积分数量无效或超出单笔上限' };
  }
  if (typeof input.reason !== 'string') {
    return { ok: false, error: '操作原因无效' };
  }
  const reason = input.reason.trim();
  if (reason.length < 2 || reason.length > 200 || SENSITIVE_REASON_PATTERN.test(reason)) {
    return { ok: false, error: '操作原因不符合安全要求' };
  }
  if (typeof input.idempotencyKey !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey)) {
    return { ok: false, error: '幂等键格式无效' };
  }
  return {
    ok: true,
    value: {
      direction: input.direction,
      amount: input.amount,
      reason,
      idempotencyKey: input.idempotencyKey,
      requiresDualConfirmation: input.amount >= MANUAL_CREDIT_DUAL_CONFIRM_AMOUNT,
    },
  };
}

/**
 * Manual grants are always bonus credits.  Package and purchased credits are
 * intentionally untouched.
 */
export function planManualGrant(account: CreditBuckets, amount: number): CreditBuckets {
  if (!validBuckets(account) || !isSafeInteger(amount) || amount <= 0) {
    throw new Error('人工赠送积分计划无效');
  }
  return {
    totalBalance: account.totalBalance + amount,
    packageBalance: account.packageBalance,
    purchasedBalance: account.purchasedBalance,
    bonusBalance: account.bonusBalance + amount,
  };
}

function expiryRank(grant: ManualGrantCandidate) {
  return grant.expiresAt ? grant.expiresAt.getTime() : Number.MAX_SAFE_INTEGER;
}

/**
 * Only unspent, manually granted bonus credits are eligible for a manual
 * deduction.  This prevents an operator from silently taking package or
 * customer-purchased credits.
 */
export function planManualDeduction(
  account: CreditBuckets,
  grants: ManualGrantCandidate[],
  amount: number,
): { account: CreditBuckets; parts: ManualDeductionPart[] } {
  if (!validBuckets(account) || !isSafeInteger(amount) || amount <= 0) {
    throw new Error('人工扣减积分计划无效');
  }
  const eligible = grants
    .filter((grant) => grant.sourceType === MANUAL_CREDIT_SOURCE_TYPE && isSafeInteger(grant.remainingAmount) && grant.remainingAmount > 0)
    .sort((left, right) => expiryRank(left) - expiryRank(right) || left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id));

  const available = eligible.reduce((sum, grant) => sum + grant.remainingAmount, 0);
  if (amount > available || amount > account.bonusBalance || amount > account.totalBalance) {
    throw new Error('可撤销的人工赠送积分不足');
  }

  let remaining = amount;
  const parts: ManualDeductionPart[] = [];
  for (const grant of eligible) {
    if (remaining === 0) break;
    const used = Math.min(remaining, grant.remainingAmount);
    parts.push({ grantId: grant.id, amount: used });
    remaining -= used;
  }
  return {
    account: {
      totalBalance: account.totalBalance - amount,
      packageBalance: account.packageBalance,
      purchasedBalance: account.purchasedBalance,
      bonusBalance: account.bonusBalance - amount,
    },
    parts,
  };
}
