import { getMembershipPlan, getModelBasePoints, PERMANENT_MODEL_ACCESS_POLICY, type CompanyPermanentEntitlement } from './commercial-config';

export type ModelAccessSource = 'ACTIVE_MEMBERSHIP' | 'MONTHLY_PURCHASE_MILESTONE' | 'ANNUAL_PURCHASE' | 'SUPER_AGENT_SELF_COMPANY' | 'TRIAL_DEFAULT' | 'LEGACY_COMPATIBILITY';

export type PaidMembershipPeriod = {
  planCode: 'pro' | 'enterprise';
  billingCycle: 'monthly' | 'yearly';
  periodStart: string | Date;
  periodEnd: string | Date;
  paymentStatus: 'paid' | 'refunded' | 'failed' | 'pending' | 'canceled';
  paymentCompletedAt?: string | Date | null;
  refundedAt: string | Date | null;
  orderId: string;
  billingPeriodId?: string | null;
};

export type ModelAccessContext = {
  companyId: string;
  activePlanCode?: string | null;
  paidMembershipPeriods?: readonly PaidMembershipPeriod[];
  permanentEntitlements?: readonly CompanyPermanentEntitlement[];
  isSuperAgentSelfCompany?: boolean;
};

export type ModelAccessResult = {
  accessScope: 'DEEPSEEK_ONLY' | 'ALL_MODELS';
  isPermanent: boolean;
  source: ModelAccessSource;
  qualifyingMonthlyPeriodCount: number;
  /** @deprecated Use qualifyingMonthlyPeriodCount. */
  qualifyingPaidMonths: number;
  unlockedAt: string | null;
  allowedModels: readonly string[] | 'ALL';
  reason: string;
};

export type QualifiedMonthlyBillingPeriod = {
  periodKey: string;
  orderId: string;
  billingPeriodId: string | null;
  planCode: PaidMembershipPeriod['planCode'];
  billingCycle: 'monthly';
  periodStart: string;
  periodEnd: string;
  paymentCompletedAt: string | null;
};

export type MonthlyBillingPeriodCountResult = {
  qualifyingMonthlyPeriodCount: number;
  /** @deprecated Use qualifyingMonthlyPeriodCount. */
  qualifyingPaidMonths: number;
  acceptedPeriods: QualifiedMonthlyBillingPeriod[];
  rejectedPeriods: Array<{ orderId: string; billingPeriodId: string | null; reason: string }>;
  rejectionReason: string | null;
};

function toDate(value: string | Date) {
  return value instanceof Date ? new Date(value.getTime()) : new Date(value);
}

function toTime(value: string | Date) {
  const time = toDate(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function clampPeriod(period: PaidMembershipPeriod) {
  const start = toTime(period.periodStart);
  const end = toTime(period.periodEnd);
  if (start === null || end === null || end <= start) return null;
  return { start, end, period };
}

function canonicalPeriodKey(period: PaidMembershipPeriod) {
  if (period.billingPeriodId) return `billingPeriodId:${period.billingPeriodId}`;
  return `orderId:${period.orderId}`;
}

function normalizePeriod(period: PaidMembershipPeriod): QualifiedMonthlyBillingPeriod | null {
  const clamped = clampPeriod(period);
  if (!clamped) return null;
  return {
    periodKey: canonicalPeriodKey(period),
    orderId: period.orderId,
    billingPeriodId: period.billingPeriodId || null,
    planCode: period.planCode,
    billingCycle: 'monthly',
    periodStart: new Date(clamped.start).toISOString(),
    periodEnd: new Date(clamped.end).toISOString(),
    paymentCompletedAt: period.paymentCompletedAt ? new Date(period.paymentCompletedAt).toISOString() : null,
  };
}

function overlaps(left: QualifiedMonthlyBillingPeriod, right: QualifiedMonthlyBillingPeriod) {
  return new Date(left.periodStart).getTime() < new Date(right.periodEnd).getTime() && new Date(right.periodStart).getTime() < new Date(left.periodEnd).getTime();
}

export function countQualifyingMonthlyBillingPeriods(periods: readonly PaidMembershipPeriod[]): MonthlyBillingPeriodCountResult {
  const acceptedPeriods: QualifiedMonthlyBillingPeriod[] = [];
  const rejectedPeriods: MonthlyBillingPeriodCountResult['rejectedPeriods'] = [];
  const seenKeys = new Set<string>();

  const eligible = periods
    .filter((period) => {
      if (!PERMANENT_MODEL_ACCESS_POLICY.eligiblePlanCodes.includes(period.planCode)) {
        rejectedPeriods.push({ orderId: period.orderId, billingPeriodId: period.billingPeriodId || null, reason: 'INELIGIBLE_PLAN_CODE' });
        return false;
      }
      if (period.billingCycle !== 'monthly') {
        rejectedPeriods.push({ orderId: period.orderId, billingPeriodId: period.billingPeriodId || null, reason: 'INELIGIBLE_BILLING_CYCLE' });
        return false;
      }
      if (period.paymentStatus !== 'paid' || !period.paymentCompletedAt) {
        rejectedPeriods.push({ orderId: period.orderId, billingPeriodId: period.billingPeriodId || null, reason: 'PAYMENT_NOT_SUCCESSFUL' });
        return false;
      }
      if (period.refundedAt && !PERMANENT_MODEL_ACCESS_POLICY.refundedPeriodsCount) {
        rejectedPeriods.push({ orderId: period.orderId, billingPeriodId: period.billingPeriodId || null, reason: 'REFUNDED_PERIOD' });
        return false;
      }
      return true;
    })
    .map(normalizePeriod)
    .filter((period): period is QualifiedMonthlyBillingPeriod => Boolean(period))
    .sort((a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime() || new Date(a.periodEnd).getTime() - new Date(b.periodEnd).getTime());

  for (const period of eligible) {
    if (seenKeys.has(period.periodKey)) {
      rejectedPeriods.push({ orderId: period.orderId, billingPeriodId: period.billingPeriodId, reason: 'DUPLICATE_PERIOD' });
      continue;
    }

    const overlapsAccepted = acceptedPeriods.some((accepted) => overlaps(accepted, period));
    if (overlapsAccepted) {
      rejectedPeriods.push({ orderId: period.orderId, billingPeriodId: period.billingPeriodId, reason: 'OVERLAPPING_PERIOD' });
      continue;
    }

    seenKeys.add(period.periodKey);
    acceptedPeriods.push(period);
  }

  return {
    qualifyingMonthlyPeriodCount: acceptedPeriods.length,
    qualifyingPaidMonths: acceptedPeriods.length,
    acceptedPeriods,
    rejectedPeriods,
    rejectionReason: rejectedPeriods.length ? rejectedPeriods[0].reason : null,
  };
}

function resolvePermanentEntitlement(context: ModelAccessContext) {
  return context.permanentEntitlements?.find((entitlement) => entitlement.type === 'ALL_MODELS_PERMANENT' && !entitlement.revokedAt) || null;
}

export function resolveCompanyModelAccess(context: ModelAccessContext): ModelAccessResult {
  const permanentEntitlement = resolvePermanentEntitlement(context);
  if (context.isSuperAgentSelfCompany && PERMANENT_MODEL_ACCESS_POLICY.superAgentSelfCompanyUnlocksImmediately) {
    return { accessScope: 'ALL_MODELS', isPermanent: true, source: 'SUPER_AGENT_SELF_COMPANY', qualifyingMonthlyPeriodCount: 0, qualifyingPaidMonths: 0, unlockedAt: null, allowedModels: 'ALL', reason: '超级代理自用企业永久解锁全部模型' };
  }
  if (permanentEntitlement) {
    return { accessScope: 'ALL_MODELS', isPermanent: true, source: 'LEGACY_COMPATIBILITY', qualifyingMonthlyPeriodCount: 0, qualifyingPaidMonths: 0, unlockedAt: permanentEntitlement.effectiveAt ? String(permanentEntitlement.effectiveAt) : null, allowedModels: 'ALL', reason: '企业已存在永久模型权益' };
  }

  const activePlanCode = context.activePlanCode || null;
  if (activePlanCode === 'pro' || activePlanCode === 'enterprise') {
    if (context.paidMembershipPeriods?.some((period) => period.planCode === activePlanCode && period.billingCycle === 'yearly' && period.paymentStatus === 'paid' && !period.refundedAt)) {
      return { accessScope: 'ALL_MODELS', isPermanent: true, source: 'ANNUAL_PURCHASE', qualifyingMonthlyPeriodCount: 0, qualifyingPaidMonths: 0, unlockedAt: null, allowedModels: 'ALL', reason: '年卡支付成功后立即永久解锁全部模型' };
    }

    const { qualifyingMonthlyPeriodCount } = countQualifyingMonthlyBillingPeriods(context.paidMembershipPeriods || []);
    if (qualifyingMonthlyPeriodCount >= PERMANENT_MODEL_ACCESS_POLICY.monthlyPaidMonthsRequired) {
      return { accessScope: 'ALL_MODELS', isPermanent: true, source: 'MONTHLY_PURCHASE_MILESTONE', qualifyingMonthlyPeriodCount, qualifyingPaidMonths: qualifyingMonthlyPeriodCount, unlockedAt: null, allowedModels: 'ALL', reason: '月卡累计达到永久解锁条件' };
    }

    const currentPlan = getMembershipPlan(activePlanCode);
    return { accessScope: 'ALL_MODELS', isPermanent: false, source: 'ACTIVE_MEMBERSHIP', qualifyingMonthlyPeriodCount, qualifyingPaidMonths: qualifyingMonthlyPeriodCount, unlockedAt: null, allowedModels: currentPlan.allowedModels, reason: '当前有效会员可使用全部模型' };
  }

  if (activePlanCode === 'trial') {
    const plan = getMembershipPlan('trial');
    return { accessScope: 'DEEPSEEK_ONLY', isPermanent: false, source: 'TRIAL_DEFAULT', qualifyingMonthlyPeriodCount: 0, qualifyingPaidMonths: 0, unlockedAt: null, allowedModels: plan.allowedModels, reason: '体验会员仅可使用 DeepSeek 模型' };
  }

  return { accessScope: 'DEEPSEEK_ONLY', isPermanent: false, source: 'LEGACY_COMPATIBILITY', qualifyingMonthlyPeriodCount: 0, qualifyingPaidMonths: 0, unlockedAt: null, allowedModels: getMembershipPlan('trial').allowedModels, reason: '未识别会员或无有效会员，默认仅允许 DeepSeek 模型' };
}

export function canCompanyUseModel(accessResult: ModelAccessResult, modelId: string) {
  const resolvedModelId = modelId.replace(/-preview$/, '');
  getModelBasePoints(resolvedModelId);
  if (accessResult.allowedModels === 'ALL') return true;
  return accessResult.allowedModels.includes(resolvedModelId);
}

export function getPermanentModelAccessPolicy() {
  return PERMANENT_MODEL_ACCESS_POLICY;
}

export function canCompanyUseModelWithAccessResult(accessResult: ModelAccessResult, modelId: string) {
  return canCompanyUseModel(accessResult, modelId);
}
