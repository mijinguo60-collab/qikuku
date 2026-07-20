import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import { BillingError } from './subscriptions';
import type { BillingSqlClient } from './sql-client';

export type CreditLedgerAllocationRecord = {
  id: string;
  ledgerId: string;
  creditGrantId: string;
  amount: number;
  createdAt: string;
};

export type CreditLedgerAllocationInput = {
  ledgerId: string;
  allocations: Array<{ creditGrantId: string; amount: number }>;
};

type CreditLedgerRow = {
  id: string;
  companyId: string;
  amount: number;
  type: string;
};

type CreditLedgerAllocationRow = {
  id: string;
  ledgerId: string;
  creditGrantId: string;
  amount: number;
  createdAt: string | Date;
};

function resolveConnection(dbOrTx?: BillingSqlClient): BillingSqlClient {
  return dbOrTx ?? (getDb() as BillingSqlClient);
}

function nowIso() {
  return new Date().toISOString();
}

function toRecord(row: CreditLedgerAllocationRow | null): CreditLedgerAllocationRecord | null {
  if (!row) return null;
  return {
    id: row.id,
    ledgerId: row.ledgerId,
    creditGrantId: row.creditGrantId,
    amount: Number(row.amount),
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

function validateAllocations(input: CreditLedgerAllocationInput) {
  if (!input.ledgerId) throw new BillingError('CREDIT_ALLOCATION_INVALID', 'ledgerId 不能为空', false);
  if (!Array.isArray(input.allocations) || input.allocations.length === 0) throw new BillingError('CREDIT_ALLOCATION_INVALID', 'allocations 不能为空', false);
  const seen = new Set<string>();
  for (const allocation of input.allocations) {
    if (!allocation.creditGrantId) throw new BillingError('CREDIT_ALLOCATION_INVALID', 'creditGrantId 不能为空', false);
    if (!Number.isInteger(allocation.amount) || allocation.amount <= 0) throw new BillingError('CREDIT_ALLOCATION_INVALID', 'amount 必须为正整数', false);
    if (seen.has(allocation.creditGrantId)) throw new BillingError('CREDIT_ALLOCATION_INVALID', '同一 creditGrantId 不能重复', false);
    seen.add(allocation.creditGrantId);
  }
}

function isConsumptionLedger(type: string) {
  return type === 'debit' || type === 'consume' || type === 'usage';
}

async function createWithinTx(input: CreditLedgerAllocationInput, tx: BillingSqlClient) {
  const ledger = await tx.prepare<CreditLedgerRow>(`SELECT * FROM "CreditLedger" WHERE id = ? FOR UPDATE`).get(input.ledgerId);
  if (!ledger) throw new BillingError('CREDIT_ALLOCATION_INVALID', '消费流水不存在', false);
  if (!isConsumptionLedger(String(ledger.type))) throw new BillingError('CREDIT_ALLOCATION_INVALID', '只有消费类 CreditLedger 才能建立分配', false);

  const total = input.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  const expected = Math.abs(Number(ledger.amount));
  if (total !== expected) throw new BillingError('CREDIT_ALLOCATION_INVALID', `分配总额必须等于流水金额绝对值，期望 ${expected}`, false);

  const existing = await tx.prepare<CreditLedgerAllocationRow>(
    `SELECT * FROM "CreditLedgerAllocation" WHERE "ledgerId" = ? ORDER BY "createdAt" ASC`,
  ).all(input.ledgerId);

  const existingByGrant = new Map<string, CreditLedgerAllocationRow>(
    existing.map((item) => [item.creditGrantId, item]),
  );

  if (existing.length > 0) {
    if (existing.length !== input.allocations.length) {
      throw new BillingError(
        'CREDIT_ALLOCATION_IDEMPOTENCY_CONFLICT',
        '该流水已存在不同的完整分配方案',
        false,
      );
    }

    return input.allocations.map((allocation) => {
      const current = existingByGrant.get(allocation.creditGrantId);

      if (!current || Number(current.amount) !== allocation.amount) {
        throw new BillingError(
          'CREDIT_ALLOCATION_IDEMPOTENCY_CONFLICT',
          '该流水已存在不同的完整分配方案',
          false,
        );
      }

      return toRecord(current)!;
    });
  }

  const now = nowIso();
  const results: CreditLedgerAllocationRecord[] = [];

  for (const allocation of input.allocations) {
    const id = randomUUID();

    await tx.prepare(
      `INSERT INTO "CreditLedgerAllocation" (id, "ledgerId", "creditGrantId", amount, "createdAt") VALUES (?,?,?,?,?)`,
    ).run(
      id,
      input.ledgerId,
      allocation.creditGrantId,
      allocation.amount,
      now,
    );

    const row = await tx.prepare<CreditLedgerAllocationRow>(
      `SELECT * FROM "CreditLedgerAllocation" WHERE id = ?`,
    ).get(id);

    results.push(toRecord(row)!);
  }

  const sum = results.reduce(
    (totalAmount, allocation) => totalAmount + allocation.amount,
    0,
  );

  if (sum !== expected) {
    throw new BillingError(
      'CREDIT_ALLOCATION_INVALID',
      '分配总额不一致',
      false,
    );
  }

  return results;
}

export async function createCreditLedgerAllocations(input: CreditLedgerAllocationInput, dbOrTx?: BillingSqlClient) {
  const tx = resolveConnection(dbOrTx);
  validateAllocations(input);
  if (typeof tx.transactionAsync === 'function') {
    return tx.transactionAsync((innerTx) => createWithinTx(input, innerTx as BillingSqlClient));
  }
  return createWithinTx(input, tx);
}

export async function getCreditLedgerAllocations(ledgerId: string, dbOrTx?: BillingSqlClient) {
  const tx = resolveConnection(dbOrTx);
  const rows = await tx.prepare<CreditLedgerAllocationRow>(`SELECT * FROM "CreditLedgerAllocation" WHERE "ledgerId" = ? ORDER BY "createdAt" ASC`).all(ledgerId);
  return rows.map(toRecord).filter((item): item is CreditLedgerAllocationRecord => Boolean(item));
}
