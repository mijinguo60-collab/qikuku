import { randomUUID } from 'node:crypto';
import { CompanyEntitlementSourceType as PrismaCompanyEntitlementSourceType, CompanyEntitlementType as PrismaCompanyEntitlementType } from '@prisma/client';
import { getDb } from '@/lib/db';
import { BillingError } from './subscriptions';
import type { BillingSqlClient } from './sql-client';

export type CompanyEntitlementGrantType = PrismaCompanyEntitlementType;
export type CompanyEntitlementGrantSourceType = PrismaCompanyEntitlementSourceType;

export type CompanyEntitlementGrantRecord = {
  id: string;
  companyId: string;
  entitlementType: CompanyEntitlementGrantType;
  sourceType: CompanyEntitlementGrantSourceType;
  sourceId: string;
  sourceOrderId: string | null;
  grantedAt: string;
  effectiveAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  metadataJson: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CompanyEntitlementGrantInput = {
  companyId: string;
  entitlementType: CompanyEntitlementGrantType;
  sourceType: CompanyEntitlementGrantSourceType;
  sourceId: string;
  sourceOrderId?: string | null;
  effectiveAt: string | Date;
  metadataJson?: unknown;
};

type CompanyEntitlementGrantRow = {
  id: string;
  companyId: string;
  entitlementType: CompanyEntitlementGrantType;
  sourceType: CompanyEntitlementGrantSourceType;
  sourceId: string;
  sourceOrderId: string | null;
  grantedAt: string | Date;
  effectiveAt: string | Date | null;
  revokedAt: string | Date | null;
  revocationReason: string | null;
  metadataJson: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

const COMPANY_ENTITLEMENT_GRANT_SELECT = `
  SELECT
    id,
    "companyId",
    "entitlementType",
    "sourceType",
    "sourceId",
    "sourceOrderId",
    "grantedAt",
    "effectiveAt",
    "revokedAt",
    "revocationReason",
    "metadataJson"::text AS "metadataJson",
    "createdAt",
    "updatedAt"
  FROM "CompanyEntitlementGrant"
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
      'ENTITLEMENT_GRANT_INVALID',
      'metadataJson 无法序列化',
      false,
    );
  }

  return JSON.stringify(
    sortJsonValue(JSON.parse(serialized) as unknown),
  );
}

function toRecord(row: CompanyEntitlementGrantRow | null): CompanyEntitlementGrantRecord | null {
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.companyId,
    entitlementType: row.entitlementType,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    sourceOrderId: row.sourceOrderId,
    grantedAt: new Date(row.grantedAt).toISOString(),
    effectiveAt: row.effectiveAt ? new Date(row.effectiveAt).toISOString() : null,
    revokedAt: row.revokedAt ? new Date(row.revokedAt).toISOString() : null,
    revocationReason: row.revocationReason,
    metadataJson: normalizeJson(row.metadataJson),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function validateInput(input: CompanyEntitlementGrantInput) {
  if (!input.companyId) throw new BillingError('ENTITLEMENT_GRANT_INVALID', 'companyId 不能为空', false);
  if (!input.sourceId) throw new BillingError('ENTITLEMENT_GRANT_INVALID', 'sourceId 不能为空', false);
  const effectiveAt = new Date(input.effectiveAt);
  if (!Number.isFinite(effectiveAt.getTime())) throw new BillingError('ENTITLEMENT_GRANT_INVALID', 'effectiveAt 无效', false);
  if (input.sourceType === PrismaCompanyEntitlementSourceType.SUPER_AGENT_SELF_COMPANY && input.sourceId === input.companyId) {
    throw new BillingError('ENTITLEMENT_GRANT_INVALID', 'SUPER_AGENT_SELF_COMPANY 必须使用稳定绑定关系 ID', false);
  }
  if (input.sourceType === PrismaCompanyEntitlementSourceType.ANNUAL_PURCHASE && !input.sourceOrderId) {
    throw new BillingError('ENTITLEMENT_GRANT_INVALID', '年卡权益建议提供 sourceOrderId', false);
  }
}

function compareExistingAndIncoming(existing: CompanyEntitlementGrantRow, input: CompanyEntitlementGrantInput) {
  const comparable = {
    companyId: existing.companyId,
    entitlementType: existing.entitlementType,
    sourceType: existing.sourceType,
    sourceId: existing.sourceId,
    sourceOrderId: existing.sourceOrderId ?? null,
    effectiveAt: existing.effectiveAt ? new Date(existing.effectiveAt).toISOString() : null,
    metadataJson: normalizeJson(existing.metadataJson),
  };
  const incoming = {
    companyId: input.companyId,
    entitlementType: input.entitlementType,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceOrderId: input.sourceOrderId ?? null,
    effectiveAt: new Date(input.effectiveAt).toISOString(),
    metadataJson: normalizeJson(input.metadataJson),
  };
  for (const key of Object.keys(incoming) as (keyof typeof incoming)[]) {
    if (comparable[key] !== incoming[key]) throw new BillingError('ENTITLEMENT_GRANT_IDEMPOTENCY_CONFLICT', `权益授权幂等冲突: ${String(key)}`, false);
  }
}

export async function grantCompanyEntitlement(input: CompanyEntitlementGrantInput, dbOrTx?: BillingSqlClient) {
  const tx = resolveConnection(dbOrTx);
  validateInput(input);
  const existing = await tx.prepare<CompanyEntitlementGrantRow>(`${COMPANY_ENTITLEMENT_GRANT_SELECT} WHERE "companyId" = ? AND "entitlementType" = ? AND "sourceType" = ? AND "sourceId" = ?`).get(input.companyId, input.entitlementType, input.sourceType, input.sourceId);
  if (existing) {
    compareExistingAndIncoming(existing, input);
    return toRecord(existing);
  }

  const id = randomUUID();
  const now = nowIso();
  await tx.prepare(
    `INSERT INTO "CompanyEntitlementGrant" (id, "companyId", "entitlementType", "sourceType", "sourceId", "sourceOrderId", "grantedAt", "effectiveAt", "revokedAt", "revocationReason", "metadataJson", "createdAt", "updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(id, input.companyId, input.entitlementType, input.sourceType, input.sourceId, input.sourceOrderId ?? null, now, new Date(input.effectiveAt).toISOString(), null, null, normalizeJson(input.metadataJson), now, now);
  return toRecord(await tx.prepare<CompanyEntitlementGrantRow>(`${COMPANY_ENTITLEMENT_GRANT_SELECT} WHERE id = ?`).get(id));
}

export async function revokeCompanyEntitlementGrant(input: { id?: string; companyId?: string; entitlementType?: CompanyEntitlementGrantType; sourceType?: CompanyEntitlementGrantSourceType; sourceId?: string; revocationReason?: string }, dbOrTx?: BillingSqlClient) {
  const tx = resolveConnection(dbOrTx);
  let current: CompanyEntitlementGrantRow | null = null;
  if (input.id) current = await tx.prepare<CompanyEntitlementGrantRow>(`${COMPANY_ENTITLEMENT_GRANT_SELECT} WHERE id = ?`).get(input.id);
  else if (input.companyId && input.entitlementType && input.sourceType && input.sourceId) {
    current = await tx.prepare<CompanyEntitlementGrantRow>(`${COMPANY_ENTITLEMENT_GRANT_SELECT} WHERE "companyId" = ? AND "entitlementType" = ? AND "sourceType" = ? AND "sourceId" = ?`).get(input.companyId, input.entitlementType, input.sourceType, input.sourceId);
  }
  if (!current) return null;
  if (current.revokedAt) return toRecord(current);
  const now = nowIso();
  await tx.prepare(`UPDATE "CompanyEntitlementGrant" SET "revokedAt" = ?, "revocationReason" = ?, "updatedAt" = ? WHERE id = ? AND "revokedAt" IS NULL`).run(now, input.revocationReason ?? null, now, current.id);
  return toRecord(await tx.prepare<CompanyEntitlementGrantRow>(`${COMPANY_ENTITLEMENT_GRANT_SELECT} WHERE id = ?`).get(current.id));
}

export async function hasActiveCompanyEntitlement(companyId: string, entitlementType: CompanyEntitlementGrantType, dbOrTx?: BillingSqlClient) {
  const tx = resolveConnection(dbOrTx);
  const row = await tx.prepare<{ id: string }>(`SELECT id FROM "CompanyEntitlementGrant" WHERE "companyId" = ? AND "entitlementType" = ? AND "effectiveAt" <= ? AND "revokedAt" IS NULL LIMIT 1`).get(companyId, entitlementType, nowIso());
  return Boolean(row);
}

export async function listActiveCompanyEntitlementGrants(companyId: string, entitlementType: CompanyEntitlementGrantType, dbOrTx?: BillingSqlClient) {
  const tx = resolveConnection(dbOrTx);
  const rows = await tx.prepare<CompanyEntitlementGrantRow>(`${COMPANY_ENTITLEMENT_GRANT_SELECT} WHERE "companyId" = ? AND "entitlementType" = ? AND "effectiveAt" <= ? AND "revokedAt" IS NULL ORDER BY "effectiveAt" ASC, "createdAt" ASC`).all(companyId, entitlementType, nowIso());
  return rows.map(toRecord).filter((item): item is CompanyEntitlementGrantRecord => Boolean(item));
}
