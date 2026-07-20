import { randomUUID } from 'node:crypto';
import { MembershipBillingCycle as PrismaMembershipBillingCycle, MembershipBillingPeriodStatus as PrismaMembershipBillingPeriodStatus } from '@prisma/client';
import { getDb } from '@/lib/db';
import { BillingError } from './subscriptions';
import { getMembershipPlan, type CommercialPlanCode, type MembershipBillingCycle } from './commercial-config';
import type { BillingSqlClient } from './sql-client';

export type MembershipBillingCycleInput = MembershipBillingCycle | PrismaMembershipBillingCycle;

export type MembershipBillingPeriodRecord = {
  id: string;
  companyId: string;
  subscriptionId: string | null;
  paymentOrderId: string | null;
  provider: string;
  externalPeriodKey: string;
  planCode: CommercialPlanCode;
  billingCycle: MembershipBillingCycle;
  periodStart: string;
  periodEnd: string;
  status: PrismaMembershipBillingPeriodStatus;
  paymentCompletedAt: string | null;
  refundedAt: string | null;
  cancelledAt: string | null;
  invalidatedAt: string | null;
  invalidationReason: string | null;
  metadataJson: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MembershipBillingPeriodInput = {
  companyId: string;
  subscriptionId?: string | null;
  paymentOrderId?: string | null;
  provider: string;
  externalPeriodKey: string;
  planCode: string;
  billingCycle: MembershipBillingCycleInput;
  periodStart: string | Date;
  periodEnd: string | Date;
  status: PrismaMembershipBillingPeriodStatus;
  paymentCompletedAt?: string | Date | null;
  refundedAt?: string | Date | null;
  cancelledAt?: string | Date | null;
  invalidatedAt?: string | Date | null;
  invalidationReason?: string | null;
  metadataJson?: unknown;
};

type MembershipBillingPeriodRow = {
  id: string;
  companyId: string;
  subscriptionId: string | null;
  paymentOrderId: string | null;
  provider: string;
  externalPeriodKey: string;
  planCode: string;
  billingCycle: PrismaMembershipBillingCycle;
  periodStart: string | Date;
  periodEnd: string | Date;
  status: PrismaMembershipBillingPeriodStatus;
  paymentCompletedAt: string | Date | null;
  refundedAt: string | Date | null;
  cancelledAt: string | Date | null;
  invalidatedAt: string | Date | null;
  invalidationReason: string | null;
  metadataJson: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

const MEMBERSHIP_BILLING_PERIOD_SELECT = `
  SELECT
    id,
    "companyId",
    "subscriptionId",
    "paymentOrderId",
    provider,
    "externalPeriodKey",
    "planCode",
    "billingCycle",
    "periodStart",
    "periodEnd",
    status,
    "paymentCompletedAt",
    "refundedAt",
    "cancelledAt",
    "invalidatedAt",
    "invalidationReason",
    "metadataJson"::text AS "metadataJson",
    "createdAt",
    "updatedAt"
  FROM "MembershipBillingPeriod"
`;

function resolveConnection(dbOrTx?: BillingSqlClient): BillingSqlClient {
  return dbOrTx ?? (getDb() as BillingSqlClient);
}

function nowIso() {
  return new Date().toISOString();
}

export function toPrismaMembershipBillingCycle(billingCycle: MembershipBillingCycleInput): PrismaMembershipBillingCycle {
  if (billingCycle === 'monthly' || billingCycle === PrismaMembershipBillingCycle.MONTHLY) {
    return PrismaMembershipBillingCycle.MONTHLY;
  }
  if (billingCycle === 'yearly' || billingCycle === PrismaMembershipBillingCycle.YEARLY) {
    return PrismaMembershipBillingCycle.YEARLY;
  }
  throw new BillingError('BILLING_PERIOD_INVALID', `未知账期类型: ${String(billingCycle)}`, false);
}

export function fromPrismaMembershipBillingCycle(billingCycle: PrismaMembershipBillingCycle) {
  return billingCycle === PrismaMembershipBillingCycle.MONTHLY ? 'monthly' : 'yearly';
}

function toTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJsonValue(item)]),
    );
  }

  return value;
}

function normalizeJson(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  let jsonValue: unknown = value;

  if (typeof value === 'string') {
    try {
      jsonValue = JSON.parse(value) as unknown;
    } catch {
      jsonValue = value;
    }
  }

  const serialized = JSON.stringify(jsonValue);

  if (serialized === undefined) {
    throw new BillingError(
      'BILLING_PERIOD_INVALID',
      'metadataJson 无法序列化',
      false,
    );
  }

  return JSON.stringify(
    sortJsonValue(JSON.parse(serialized) as unknown),
  );
}

function toRecord(row: MembershipBillingPeriodRow | null): MembershipBillingPeriodRecord | null {
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.companyId,
    subscriptionId: row.subscriptionId,
    paymentOrderId: row.paymentOrderId,
    provider: row.provider,
    externalPeriodKey: row.externalPeriodKey,
    planCode: row.planCode as CommercialPlanCode,
    billingCycle: fromPrismaMembershipBillingCycle(row.billingCycle),
    periodStart: new Date(row.periodStart).toISOString(),
    periodEnd: new Date(row.periodEnd).toISOString(),
    status: row.status,
    paymentCompletedAt: row.paymentCompletedAt ? new Date(row.paymentCompletedAt).toISOString() : null,
    refundedAt: row.refundedAt ? new Date(row.refundedAt).toISOString() : null,
    cancelledAt: row.cancelledAt ? new Date(row.cancelledAt).toISOString() : null,
    invalidatedAt: row.invalidatedAt ? new Date(row.invalidatedAt).toISOString() : null,
    invalidationReason: row.invalidationReason,
    metadataJson: normalizeJson(row.metadataJson),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function ensureKnownPlanCode(planCode: string): CommercialPlanCode {
  return getMembershipPlan(planCode).code;
}

function ensureBillingCycle(billingCycle: MembershipBillingCycleInput): MembershipBillingCycle {
  if (billingCycle === 'monthly' || billingCycle === PrismaMembershipBillingCycle.MONTHLY) return 'monthly';
  if (billingCycle === 'yearly' || billingCycle === PrismaMembershipBillingCycle.YEARLY) return 'yearly';
  throw new BillingError('BILLING_PERIOD_INVALID', `未知账期类型: ${billingCycle}`, false);
}

function ensureStatus(status: PrismaMembershipBillingPeriodStatus) {
  if (
    status === PrismaMembershipBillingPeriodStatus.PENDING ||
    status === PrismaMembershipBillingPeriodStatus.PAID ||
    status === PrismaMembershipBillingPeriodStatus.FAILED ||
    status === PrismaMembershipBillingPeriodStatus.CANCELLED ||
    status === PrismaMembershipBillingPeriodStatus.REFUNDED ||
    status === PrismaMembershipBillingPeriodStatus.INVALIDATED
  ) {
    return status;
  }
  throw new BillingError('BILLING_PERIOD_INVALID', `未知账期状态: ${status}`, false);
}

function validateInput(input: MembershipBillingPeriodInput) {
  if (!input.companyId) throw new BillingError('BILLING_PERIOD_INVALID', 'companyId 不能为空', false);
  if (!input.provider) throw new BillingError('BILLING_PERIOD_INVALID', 'provider 不能为空', false);
  if (!input.externalPeriodKey) throw new BillingError('BILLING_PERIOD_INVALID', 'externalPeriodKey 不能为空', false);
  const startTime = toTime(input.periodStart);
  const endTime = toTime(input.periodEnd);
  if (startTime === null || endTime === null || endTime <= startTime) {
    throw new BillingError('BILLING_PERIOD_INVALID', '账期结束时间必须晚于开始时间', false);
  }
  const planCode = ensureKnownPlanCode(input.planCode);
  const billingCycle = ensureBillingCycle(input.billingCycle);
  const status = ensureStatus(input.status);
  if (status === PrismaMembershipBillingPeriodStatus.PAID && !input.paymentCompletedAt) {
    throw new BillingError('BILLING_PERIOD_INVALID', 'PAID 账期必须提供 paymentCompletedAt', false);
  }
  return { planCode, billingCycle, status };
}

function compareExistingAndIncoming(existing: MembershipBillingPeriodRow, input: MembershipBillingPeriodInput, normalized: { planCode: CommercialPlanCode; billingCycle: MembershipBillingCycle; status: PrismaMembershipBillingPeriodStatus }) {
  const existingComparable = {
    companyId: existing.companyId,
    subscriptionId: existing.subscriptionId ?? null,
    paymentOrderId: existing.paymentOrderId ?? null,
    provider: existing.provider,
    externalPeriodKey: existing.externalPeriodKey,
    planCode: existing.planCode,
    billingCycle: fromPrismaMembershipBillingCycle(existing.billingCycle),
    periodStart: new Date(existing.periodStart).toISOString(),
    periodEnd: new Date(existing.periodEnd).toISOString(),
    status: existing.status,
    paymentCompletedAt: existing.paymentCompletedAt ? new Date(existing.paymentCompletedAt).toISOString() : null,
    refundedAt: existing.refundedAt ? new Date(existing.refundedAt).toISOString() : null,
    cancelledAt: existing.cancelledAt ? new Date(existing.cancelledAt).toISOString() : null,
    invalidatedAt: existing.invalidatedAt ? new Date(existing.invalidatedAt).toISOString() : null,
    invalidationReason: existing.invalidationReason ?? null,
    metadataJson: normalizeJson(existing.metadataJson),
  };
  const inputComparable = {
    companyId: input.companyId,
    subscriptionId: input.subscriptionId ?? null,
    paymentOrderId: input.paymentOrderId ?? null,
    provider: input.provider,
    externalPeriodKey: input.externalPeriodKey,
    planCode: normalized.planCode,
    billingCycle: normalized.billingCycle,
    periodStart: new Date(input.periodStart).toISOString(),
    periodEnd: new Date(input.periodEnd).toISOString(),
    status: normalized.status,
    paymentCompletedAt: input.paymentCompletedAt ? new Date(input.paymentCompletedAt).toISOString() : null,
    refundedAt: input.refundedAt ? new Date(input.refundedAt).toISOString() : null,
    cancelledAt: input.cancelledAt ? new Date(input.cancelledAt).toISOString() : null,
    invalidatedAt: input.invalidatedAt ? new Date(input.invalidatedAt).toISOString() : null,
    invalidationReason: input.invalidationReason ?? null,
    metadataJson: normalizeJson(input.metadataJson),
  };
  for (const key of Object.keys(inputComparable) as (keyof typeof inputComparable)[]) {
    if (existingComparable[key] !== inputComparable[key]) {
      throw new BillingError('BILLING_PERIOD_IDEMPOTENCY_CONFLICT', `账期幂等冲突: ${String(key)}`, false);
    }
  }
}

export async function createMembershipBillingPeriod(input: MembershipBillingPeriodInput, dbOrTx?: BillingSqlClient) {
  const tx = resolveConnection(dbOrTx);
  const normalized = validateInput(input);
  const existing = await tx.prepare<MembershipBillingPeriodRow>(`${MEMBERSHIP_BILLING_PERIOD_SELECT} WHERE "provider" = ? AND "externalPeriodKey" = ?`).get(input.provider, input.externalPeriodKey);
  if (existing) {
    compareExistingAndIncoming(existing, input, normalized);
    return toRecord(existing);
  }

  const id = randomUUID();
  const now = nowIso();
  await tx.prepare(
    `INSERT INTO "MembershipBillingPeriod" (id, "companyId", "subscriptionId", "paymentOrderId", provider, "externalPeriodKey", "planCode", "billingCycle", "periodStart", "periodEnd", status, "paymentCompletedAt", "refundedAt", "cancelledAt", "invalidatedAt", "invalidationReason", "metadataJson", "createdAt", "updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    input.companyId,
    input.subscriptionId ?? null,
    input.paymentOrderId ?? null,
    input.provider,
    input.externalPeriodKey,
    normalized.planCode,
    toPrismaMembershipBillingCycle(normalized.billingCycle),
    new Date(input.periodStart).toISOString(),
    new Date(input.periodEnd).toISOString(),
    normalized.status,
    input.paymentCompletedAt ? new Date(input.paymentCompletedAt).toISOString() : null,
    input.refundedAt ? new Date(input.refundedAt).toISOString() : null,
    input.cancelledAt ? new Date(input.cancelledAt).toISOString() : null,
    input.invalidatedAt ? new Date(input.invalidatedAt).toISOString() : null,
    input.invalidationReason ?? null,
    normalizeJson(input.metadataJson),
    now,
    now,
  );
  return toRecord(await tx.prepare<MembershipBillingPeriodRow>(`${MEMBERSHIP_BILLING_PERIOD_SELECT} WHERE id = ?`).get(id));
}

export async function getMembershipBillingPeriod(input: { id?: string; provider?: string; externalPeriodKey?: string }, dbOrTx?: BillingSqlClient) {
  const tx = resolveConnection(dbOrTx);
  if (input.id) return toRecord(await tx.prepare<MembershipBillingPeriodRow>(`${MEMBERSHIP_BILLING_PERIOD_SELECT} WHERE id = ?`).get(input.id));
  if (!input.provider || !input.externalPeriodKey) return null;
  return toRecord(await tx.prepare<MembershipBillingPeriodRow>(`${MEMBERSHIP_BILLING_PERIOD_SELECT} WHERE "provider" = ? AND "externalPeriodKey" = ?`).get(input.provider, input.externalPeriodKey));
}

export async function listQualifyingMonthlyBillingPeriods(companyId: string, dbOrTx?: BillingSqlClient) {
  const tx = resolveConnection(dbOrTx);
  const rows = await tx.prepare<MembershipBillingPeriodRow>(
    `${MEMBERSHIP_BILLING_PERIOD_SELECT}
     WHERE "companyId" = ?
       AND "planCode" IN ('pro', 'enterprise')
       AND "billingCycle" = ?
       AND status = ?
       AND "paymentCompletedAt" IS NOT NULL
       AND "refundedAt" IS NULL
       AND "cancelledAt" IS NULL
       AND "invalidatedAt" IS NULL
     ORDER BY "periodStart" ASC, "periodEnd" ASC, "createdAt" ASC`,
  ).all(companyId, toPrismaMembershipBillingCycle('monthly'), PrismaMembershipBillingPeriodStatus.PAID);
  return rows.map(toRecord).filter((item): item is MembershipBillingPeriodRecord => Boolean(item));
}

export async function invalidateMembershipBillingPeriod(input: { id?: string; provider?: string; externalPeriodKey?: string; invalidationReason?: string }, dbOrTx?: BillingSqlClient) {
  const tx = resolveConnection(dbOrTx);
  const period = await getMembershipBillingPeriod(input, tx);
  if (!period) return null;
  if (period.status === PrismaMembershipBillingPeriodStatus.INVALIDATED) return period;
  const now = nowIso();
  await tx.prepare(`UPDATE "MembershipBillingPeriod" SET status = ?, "invalidatedAt" = ?, "invalidationReason" = ?, "updatedAt" = ? WHERE id = ? AND status <> ?`).run(
    PrismaMembershipBillingPeriodStatus.INVALIDATED,
    now,
    input.invalidationReason ?? period.invalidationReason ?? null,
    now,
    period.id,
    PrismaMembershipBillingPeriodStatus.INVALIDATED,
  );
  return toRecord(await tx.prepare<MembershipBillingPeriodRow>(`${MEMBERSHIP_BILLING_PERIOD_SELECT} WHERE id = ?`).get(period.id));
}
