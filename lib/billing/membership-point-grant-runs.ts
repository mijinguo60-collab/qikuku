import { randomUUID } from 'node:crypto';
import { MembershipPointGrantRunStatus as PrismaMembershipPointGrantRunStatus } from '@prisma/client';
import { getDb } from '@/lib/db';
import { BillingError } from './subscriptions';
import type { BillingSqlClient } from './sql-client';

export type MembershipPointGrantRunStatus = PrismaMembershipPointGrantRunStatus;

export type MembershipPointGrantRunRecord = {
  id: string;
  companyId: string;
  subscriptionId: string;
  billingPeriodId: string | null;
  planCode: 'pro' | 'enterprise';
  grantPeriodKey: string;
  grantPeriodStart: string;
  grantPeriodEnd: string;
  scheduledAt: string;
  grantedAt: string | null;
  points: number;
  status: MembershipPointGrantRunStatus;
  creditGrantId: string | null;
  idempotencyKey: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  failureReason: string | null;
  metadataJson: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MembershipPointGrantRunInput = {
  companyId: string;
  subscriptionId: string;
  billingPeriodId?: string | null;
  planCode: 'pro' | 'enterprise';
  grantPeriodKey: string;
  grantPeriodStart: string | Date;
  grantPeriodEnd: string | Date;
  scheduledAt: string | Date;
  points: number;
  idempotencyKey: string;
  metadataJson?: unknown;
};

type MembershipPointGrantRunRow = {
  id: string;
  companyId: string;
  subscriptionId: string;
  billingPeriodId: string | null;
  planCode: 'pro' | 'enterprise';
  grantPeriodKey: string;
  grantPeriodStart: string | Date;
  grantPeriodEnd: string | Date;
  scheduledAt: string | Date;
  grantedAt: string | Date | null;
  points: number;
  status: MembershipPointGrantRunStatus;
  creditGrantId: string | null;
  idempotencyKey: string;
  attemptCount: number;
  lastAttemptAt: string | Date | null;
  failureReason: string | null;
  metadataJson: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

const MEMBERSHIP_POINT_GRANT_RUN_SELECT = `
  SELECT
    id,
    "companyId",
    "subscriptionId",
    "billingPeriodId",
    "planCode",
    "grantPeriodKey",
    "grantPeriodStart",
    "grantPeriodEnd",
    "scheduledAt",
    "grantedAt",
    points,
    status,
    "creditGrantId",
    "idempotencyKey",
    "attemptCount",
    "lastAttemptAt",
    "failureReason",
    "metadataJson"::text AS "metadataJson",
    "createdAt",
    "updatedAt"
  FROM "MembershipPointGrantRun"
`;

function resolveConnection(dbOrTx?: BillingSqlClient): BillingSqlClient {
  return dbOrTx ?? (getDb() as BillingSqlClient);
}

function nowIso() {
  return new Date().toISOString();
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
      'MEMBERSHIP_POINT_RUN_INVALID',
      'metadataJson 无法序列化',
      false,
    );
  }

  return JSON.stringify(
    sortJsonValue(JSON.parse(serialized) as unknown),
  );
}

function toRecord(row: MembershipPointGrantRunRow | null): MembershipPointGrantRunRecord | null {
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.companyId,
    subscriptionId: row.subscriptionId,
    billingPeriodId: row.billingPeriodId,
    planCode: row.planCode,
    grantPeriodKey: row.grantPeriodKey,
    grantPeriodStart: new Date(row.grantPeriodStart).toISOString(),
    grantPeriodEnd: new Date(row.grantPeriodEnd).toISOString(),
    scheduledAt: new Date(row.scheduledAt).toISOString(),
    grantedAt: row.grantedAt ? new Date(row.grantedAt).toISOString() : null,
    points: Number(row.points),
    status: row.status,
    creditGrantId: row.creditGrantId,
    idempotencyKey: row.idempotencyKey,
    attemptCount: Number(row.attemptCount),
    lastAttemptAt: row.lastAttemptAt ? new Date(row.lastAttemptAt).toISOString() : null,
    failureReason: row.failureReason,
    metadataJson: normalizeJson(row.metadataJson),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function assertTimeOrder(start: string | Date, end: string | Date) {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) throw new BillingError('MEMBERSHIP_POINT_RUN_INVALID', '发放周期结束时间必须晚于开始时间', false);
}

function validateInput(input: MembershipPointGrantRunInput) {
  if (!input.companyId) throw new BillingError('MEMBERSHIP_POINT_RUN_INVALID', 'companyId 不能为空', false);
  if (!input.subscriptionId) throw new BillingError('MEMBERSHIP_POINT_RUN_INVALID', 'subscriptionId 不能为空', false);
  if (!input.grantPeriodKey) throw new BillingError('MEMBERSHIP_POINT_RUN_INVALID', 'grantPeriodKey 不能为空', false);
  if (!Number.isInteger(input.points) || input.points <= 0) throw new BillingError('MEMBERSHIP_POINT_RUN_INVALID', 'points 必须为正整数', false);
  if (input.planCode !== 'pro' && input.planCode !== 'enterprise') throw new BillingError('MEMBERSHIP_POINT_RUN_INVALID', '仅 pro / enterprise 可发放会员积分', false);
  assertTimeOrder(input.grantPeriodStart, input.grantPeriodEnd);
  const expected = input.planCode === 'pro' ? 120000 : 400000;
  if (input.points !== expected) throw new BillingError('MEMBERSHIP_POINT_RUN_INVALID', `会员积分快照不匹配，期望 ${expected}`, false);
}

function compareExistingAndIncoming(existing: MembershipPointGrantRunRow, input: MembershipPointGrantRunInput) {
  const comparable = {
    companyId: existing.companyId,
    subscriptionId: existing.subscriptionId,
    billingPeriodId: existing.billingPeriodId ?? null,
    planCode: existing.planCode,
    grantPeriodKey: existing.grantPeriodKey,
    grantPeriodStart: new Date(existing.grantPeriodStart).toISOString(),
    grantPeriodEnd: new Date(existing.grantPeriodEnd).toISOString(),
    scheduledAt: new Date(existing.scheduledAt).toISOString(),
    points: Number(existing.points),
    idempotencyKey: existing.idempotencyKey,
    metadataJson: normalizeJson(existing.metadataJson),
  };
  const incoming = {
    companyId: input.companyId,
    subscriptionId: input.subscriptionId,
    billingPeriodId: input.billingPeriodId ?? null,
    planCode: input.planCode,
    grantPeriodKey: input.grantPeriodKey,
    grantPeriodStart: new Date(input.grantPeriodStart).toISOString(),
    grantPeriodEnd: new Date(input.grantPeriodEnd).toISOString(),
    scheduledAt: new Date(input.scheduledAt).toISOString(),
    points: input.points,
    idempotencyKey: input.idempotencyKey,
    metadataJson: normalizeJson(input.metadataJson),
  };
  for (const key of Object.keys(incoming) as (keyof typeof incoming)[]) {
    if (comparable[key] !== incoming[key]) throw new BillingError('MEMBERSHIP_POINT_RUN_IDEMPOTENCY_CONFLICT', `会员积分任务幂等冲突: ${String(key)}`, false);
  }
}

function ensureStateChange(current: MembershipPointGrantRunStatus, next: MembershipPointGrantRunStatus) {
  const allowed: Record<MembershipPointGrantRunStatus, readonly MembershipPointGrantRunStatus[]> = {
    PENDING: ['PROCESSING', 'SKIPPED'],
    PROCESSING: ['GRANTED', 'FAILED'],
    GRANTED: ['REVERSED'],
    FAILED: ['PROCESSING'],
    SKIPPED: [],
    REVERSED: [],
  };
  if (!allowed[current].includes(next)) throw new BillingError('MEMBERSHIP_POINT_RUN_INVALID_TRANSITION', `${current} -> ${next} 非法`, false);
}

export async function scheduleMembershipPointGrantRun(input: MembershipPointGrantRunInput, dbOrTx?: BillingSqlClient) {
  const tx = resolveConnection(dbOrTx);
  validateInput(input);
  const existingByKey = await tx.prepare<MembershipPointGrantRunRow>(`${MEMBERSHIP_POINT_GRANT_RUN_SELECT} WHERE "idempotencyKey" = ?`).get(input.idempotencyKey);
  if (existingByKey) {
    compareExistingAndIncoming(existingByKey, input);
    return toRecord(existingByKey);
  }
  const existingBySubscription = await tx.prepare<MembershipPointGrantRunRow>(`${MEMBERSHIP_POINT_GRANT_RUN_SELECT} WHERE "subscriptionId" = ? AND "grantPeriodKey" = ?`).get(input.subscriptionId, input.grantPeriodKey);
  if (existingBySubscription) {
    compareExistingAndIncoming(existingBySubscription, input);
    return toRecord(existingBySubscription);
  }

  const id = randomUUID();
  const now = nowIso();
  await tx.prepare(
    `INSERT INTO "MembershipPointGrantRun" (id, "companyId", "subscriptionId", "billingPeriodId", "planCode", "grantPeriodKey", "grantPeriodStart", "grantPeriodEnd", "scheduledAt", "grantedAt", points, status, "creditGrantId", "idempotencyKey", "attemptCount", "lastAttemptAt", "failureReason", "metadataJson", "createdAt", "updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(id, input.companyId, input.subscriptionId, input.billingPeriodId ?? null, input.planCode, input.grantPeriodKey, new Date(input.grantPeriodStart).toISOString(), new Date(input.grantPeriodEnd).toISOString(), new Date(input.scheduledAt).toISOString(), null, input.points, PrismaMembershipPointGrantRunStatus.PENDING, null, input.idempotencyKey, 0, null, null, normalizeJson(input.metadataJson), now, now);
  return toRecord(await tx.prepare<MembershipPointGrantRunRow>(`${MEMBERSHIP_POINT_GRANT_RUN_SELECT} WHERE id = ?`).get(id));
}

export async function startMembershipPointGrantRun(id: string, dbOrTx?: BillingSqlClient) {
  const tx = resolveConnection(dbOrTx);
  const current = await tx.prepare<MembershipPointGrantRunRow>(`${MEMBERSHIP_POINT_GRANT_RUN_SELECT} WHERE id = ?`).get(id);
  if (!current) return null;
  ensureStateChange(current.status, PrismaMembershipPointGrantRunStatus.PROCESSING);
  const now = nowIso();
  await tx.prepare(`UPDATE "MembershipPointGrantRun" SET status = ?, "attemptCount" = "attemptCount" + 1, "lastAttemptAt" = ?, "updatedAt" = ? WHERE id = ?`).run(PrismaMembershipPointGrantRunStatus.PROCESSING, now, now, id);
  return toRecord(await tx.prepare<MembershipPointGrantRunRow>(`${MEMBERSHIP_POINT_GRANT_RUN_SELECT} WHERE id = ?`).get(id));
}

export async function markMembershipPointGrantRunGranted(id: string, creditGrantId: string, dbOrTx?: BillingSqlClient) {
  const tx = resolveConnection(dbOrTx);
  if (!creditGrantId) throw new BillingError('MEMBERSHIP_POINT_RUN_INVALID', 'creditGrantId 不能为空', false);
  const current = await tx.prepare<MembershipPointGrantRunRow>(`${MEMBERSHIP_POINT_GRANT_RUN_SELECT} WHERE id = ?`).get(id);
  if (!current) return null;
  if (current.creditGrantId && current.creditGrantId !== creditGrantId) throw new BillingError('MEMBERSHIP_POINT_RUN_IDEMPOTENCY_CONFLICT', '同一任务已绑定其他 CreditGrant', false);
  const creditGrantInUse = await tx.prepare<{ id: string }>(`SELECT id FROM "MembershipPointGrantRun" WHERE "creditGrantId" = ? AND id <> ? LIMIT 1`).get(creditGrantId, id);
  if (creditGrantInUse) throw new BillingError('MEMBERSHIP_POINT_RUN_IDEMPOTENCY_CONFLICT', '同一 CreditGrant 不能被两个任务占用', false);
  ensureStateChange(
    current.status,
    PrismaMembershipPointGrantRunStatus.GRANTED,
  );
  const now = nowIso();
  await tx.prepare(`UPDATE "MembershipPointGrantRun" SET status = ?, "creditGrantId" = ?, "grantedAt" = ?, "updatedAt" = ? WHERE id = ?`).run(PrismaMembershipPointGrantRunStatus.GRANTED, creditGrantId, now, now, id);
  return toRecord(await tx.prepare<MembershipPointGrantRunRow>(`${MEMBERSHIP_POINT_GRANT_RUN_SELECT} WHERE id = ?`).get(id));
}

export async function markMembershipPointGrantRunFailed(id: string, failureReason: string | null = null, dbOrTx?: BillingSqlClient) {
  const tx = resolveConnection(dbOrTx);
  const current = await tx.prepare<MembershipPointGrantRunRow>(`${MEMBERSHIP_POINT_GRANT_RUN_SELECT} WHERE id = ?`).get(id);
  if (!current) return null;
  ensureStateChange(current.status, PrismaMembershipPointGrantRunStatus.FAILED);
  const now = nowIso();
  await tx.prepare(`UPDATE "MembershipPointGrantRun" SET status = ?, "failureReason" = ?, "updatedAt" = ? WHERE id = ?`).run(PrismaMembershipPointGrantRunStatus.FAILED, failureReason, now, id);
  return toRecord(await tx.prepare<MembershipPointGrantRunRow>(`${MEMBERSHIP_POINT_GRANT_RUN_SELECT} WHERE id = ?`).get(id));
}

export async function markMembershipPointGrantRunSkipped(id: string, failureReason: string | null = null, dbOrTx?: BillingSqlClient) {
  const tx = resolveConnection(dbOrTx);
  const current = await tx.prepare<MembershipPointGrantRunRow>(`${MEMBERSHIP_POINT_GRANT_RUN_SELECT} WHERE id = ?`).get(id);
  if (!current) return null;
  ensureStateChange(current.status, PrismaMembershipPointGrantRunStatus.SKIPPED);
  const now = nowIso();
  await tx.prepare(`UPDATE "MembershipPointGrantRun" SET status = ?, "failureReason" = ?, "updatedAt" = ? WHERE id = ?`).run(PrismaMembershipPointGrantRunStatus.SKIPPED, failureReason, now, id);
  return toRecord(await tx.prepare<MembershipPointGrantRunRow>(`${MEMBERSHIP_POINT_GRANT_RUN_SELECT} WHERE id = ?`).get(id));
}

export async function markMembershipPointGrantRunReversed(id: string, failureReason: string | null = null, dbOrTx?: BillingSqlClient) {
  const tx = resolveConnection(dbOrTx);
  const current = await tx.prepare<MembershipPointGrantRunRow>(`${MEMBERSHIP_POINT_GRANT_RUN_SELECT} WHERE id = ?`).get(id);
  if (!current) return null;
  ensureStateChange(current.status, PrismaMembershipPointGrantRunStatus.REVERSED);
  const now = nowIso();
  await tx.prepare(`UPDATE "MembershipPointGrantRun" SET status = ?, "failureReason" = ?, "updatedAt" = ? WHERE id = ?`).run(PrismaMembershipPointGrantRunStatus.REVERSED, failureReason, now, id);
  return toRecord(await tx.prepare<MembershipPointGrantRunRow>(`${MEMBERSHIP_POINT_GRANT_RUN_SELECT} WHERE id = ?`).get(id));
}

export async function getMembershipPointGrantRun(id: string, dbOrTx?: BillingSqlClient) {
  const tx = resolveConnection(dbOrTx);
  return toRecord(await tx.prepare<MembershipPointGrantRunRow>(`${MEMBERSHIP_POINT_GRANT_RUN_SELECT} WHERE id = ?`).get(id));
}
