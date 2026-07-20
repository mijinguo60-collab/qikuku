import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { MembershipBillingCycle as PrismaMembershipBillingCycle, MembershipBillingPeriodStatus as PrismaMembershipBillingPeriodStatus } from '@prisma/client';
import type { BillingSqlClient, SqlPrimitive, SqlStatement } from '../lib/billing/sql-client';
import {
  createCreditLedgerAllocations,
  getCreditLedgerAllocations,
} from '../lib/billing/credit-ledger-allocations';
import {
  createMembershipBillingPeriod,
  getMembershipBillingPeriod,
  invalidateMembershipBillingPeriod,
  listQualifyingMonthlyBillingPeriods,
} from '../lib/billing/billing-periods';
import {
  grantCompanyEntitlement,
  hasActiveCompanyEntitlement,
  listActiveCompanyEntitlementGrants,
  revokeCompanyEntitlementGrant,
} from '../lib/billing/entitlement-grants';
import {
  getMembershipPointGrantRun,
  markMembershipPointGrantRunFailed,
  markMembershipPointGrantRunGranted,
  markMembershipPointGrantRunReversed,
  markMembershipPointGrantRunSkipped,
  scheduleMembershipPointGrantRun,
  startMembershipPointGrantRun,
} from '../lib/billing/membership-point-grant-runs';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

const REQUIRED_ENDPOINT = 'ep-snowy-tooth-ata0virv.c-9.us-east-1.aws.neon.tech';
const FORBIDDEN_ENDPOINT = 'ep-little-dream-atph250c';
const ROLLBACK_SENTINEL = Symbol('BILLING_V2_TEST_ROLLBACK_SENTINEL');

type CountMap = Record<string, number>;

type DbTargetInfo = {
  host: string;
  database: string;
  pooled: boolean;
  direct: boolean;
  endpointMatch: boolean;
};

type FixtureContext = {
  companyId: string;
  planId: string;
  subscriptionId: string;
  paymentOrderId: string;
  creditGrantIds: [string, string, string];
  creditLedgerId: string;
};

class RollbackSentinelError extends Error {
  readonly sentinel = ROLLBACK_SENTINEL;

  constructor() {
    super('billing-v2 test rollback');
    this.name = 'RollbackSentinelError';
  }
}

function mustGetEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseTarget(url: string): DbTargetInfo {
  const parsed = new URL(url);
  const host = parsed.hostname;
  return {
    host,
    database: parsed.pathname.replace(/^\//, ''),
    pooled: host.includes('pooler'),
    direct: !host.includes('pooler'),
    endpointMatch: host === REQUIRED_ENDPOINT,
  };
}

function assertSafeEnvironment(): DbTargetInfo {
  if (process.env.BILLING_V2_DB_ROLLBACK_TEST !== '1') {
    throw new Error('BILLING_V2_DB_ROLLBACK_TEST 必须显式设置为 1');
  }
  const directUrl = mustGetEnv('DATABASE_DIRECT_URL');
  const target = parseTarget(directUrl);
  if (!target.direct) {
    throw new Error('必须使用 DATABASE_DIRECT_URL 的 direct 地址，禁止使用 pooler');
  }
  if (!target.endpointMatch) {
    throw new Error(`数据库 host 必须精确匹配测试 Endpoint: ${REQUIRED_ENDPOINT}`);
  }
  if (target.host.includes(FORBIDDEN_ENDPOINT)) {
    throw new Error(`检测到生产 Endpoint 标识，拒绝执行: ${FORBIDDEN_ENDPOINT}`);
  }
  return target;
}

function maskHost(host: string): string {
  const [prefix, ...rest] = host.split('.');
  return `${prefix.slice(0, 8)}***.${rest.join('.')}`;
}

function toPgParams(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function queryCount(client: Client, table: string): Promise<number> {
  const result = await client.query<{ c: string }>(`SELECT count(*)::text AS c FROM "${table}"`);
  return Number(result.rows[0]?.c ?? '0');
}

async function snapshotCounts(client: Client, tables: string[]): Promise<CountMap> {
  const snapshot: CountMap = {};
  for (const table of tables) {
    snapshot[table] = await queryCount(client, table);
  }
  return snapshot;
}

function expectCountZero(snapshot: CountMap, tables: string[]) {
  for (const table of tables) {
    assert.equal(snapshot[table], 0, `${table} must start at 0`);
  }
}

function createBillingSqlClient(client: Client): BillingSqlClient {
  let savepointSequence = 0;

  const createStatement = <Row extends Record<string, SqlPrimitive | undefined>>(sql: string): SqlStatement<Row> => ({
    get: async (...params: readonly SqlPrimitive[]) => {
      const result = await client.query<Row>(toPgParams(sql), [...params]);
      return (result.rows[0] ?? null) as Row | null;
    },
    all: async (...params: readonly SqlPrimitive[]) => {
      const result = await client.query<Row>(toPgParams(sql), [...params]);
      return result.rows;
    },
    run: async (...params: readonly SqlPrimitive[]) => {
      const result = await client.query(toPgParams(sql), [...params]);
      return { changes: result.rowCount ?? 0 };
    },
  });

  const txClient: BillingSqlClient = {
    prepare: createStatement,
    // eslint-disable-next-line no-unused-vars
    async transactionAsync<T>(fn: (tx: BillingSqlClient) => Promise<T>): Promise<T> {
      const savepoint = `billing_v2_sp_${++savepointSequence}`;
      await client.query(`SAVEPOINT ${savepoint}`);
      try {
        const result = await fn(txClient);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`).catch(() => undefined);
        throw error;
      }
    },
  };

  return txClient;
}

async function selectOne<T extends Record<string, unknown>>(client: Client, sql: string, params: readonly SqlPrimitive[]): Promise<T | null> {
  const result = await client.query<T>(toPgParams(sql), [...params]);
  return result.rows[0] ?? null;
}

async function ensurePlan(client: Client, code: string, name: string, monthlyPrice: number): Promise<string> {
  const existing = await selectOne<{ id: string }>(client, 'SELECT id FROM "Plan" WHERE code = $1 LIMIT 1', [code]);
  if (existing) return existing.id;
  const id = randomUUID();
  const now = new Date().toISOString();
  await client.query(
    'INSERT INTO "Plan" (id, code, name, "monthlyPrice", "yearlyPrice", "monthlyCredits", "maxMembers", "maxKnowledgeSpaces", "storageLimitBytes", "enabled", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    [id, code, name, monthlyPrice, monthlyPrice * 10, 0, 10, 10, 0, true, now, now],
  );
  return id;
}

async function ensureCompany(client: Client): Promise<string> {
  const existing = await selectOne<{ id: string }>(client, 'SELECT id FROM "Company" ORDER BY "createdAt" ASC LIMIT 1', []);
  if (existing) return existing.id;
  const id = randomUUID();
  const now = new Date().toISOString();
  await client.query('INSERT INTO "Company" (id, name, plan, "createdAt") VALUES ($1,$2,$3,$4)', [id, 'Billing V2 rollback test', 'free', now]);
  return id;
}

async function ensureSubscription(client: Client, companyId: string, planId: string): Promise<string> {
  const existing = await selectOne<{ id: string }>(client, 'SELECT id FROM "Subscription" WHERE "companyId" = $1 ORDER BY "createdAt" ASC LIMIT 1', [companyId]);
  if (existing) return existing.id;
  const id = randomUUID();
  const now = new Date().toISOString();
  await client.query('INSERT INTO "Subscription" (id, "companyId", "planId", "billingCycle", "status", "startedAt", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [id, companyId, planId, 'monthly', 'trialing', now, now, now]);
  return id;
}

async function ensurePaymentOrder(client: Client, companyId: string): Promise<string> {
  const existing = await selectOne<{ id: string }>(client, 'SELECT id FROM "PaymentOrder" WHERE "companyId" = $1 ORDER BY "createdAt" ASC LIMIT 1', [companyId]);
  if (existing) return existing.id;
  const id = randomUUID();
  const now = new Date().toISOString();
  await client.query(
    'INSERT INTO "PaymentOrder" (id, "orderNo", "companyId", "orderType", provider, status, "amountCents", currency, subject, "baseCredits", "bonusCredits", "firstRechargeBonus", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
    [id, `BILLING-V2-${id.slice(0, 12)}`, companyId, 'subscription', 'manual', 'paid', 0, 'CNY', 'Billing V2 test order', 0, 0, 0, now, now],
  );
  return id;
}

async function ensureCreditGrants(client: Client, companyId: string): Promise<[string, string, string]> {
  const now = new Date().toISOString();
  const grants = [
    await selectOne<{ id: string }>(client, 'SELECT id FROM "CreditGrant" WHERE "companyId" = $1 AND "sourceId" = $2 LIMIT 1', [companyId, 'grant-a']),
    await selectOne<{ id: string }>(client, 'SELECT id FROM "CreditGrant" WHERE "companyId" = $1 AND "sourceId" = $2 LIMIT 1', [companyId, 'grant-b']),
    await selectOne<{ id: string }>(client, 'SELECT id FROM "CreditGrant" WHERE "companyId" = $1 AND "sourceId" = $2 LIMIT 1', [companyId, 'grant-c']),
  ];
  const ids: [string, string, string] = [grants[0]?.id ?? '', grants[1]?.id ?? '', grants[2]?.id ?? ''];
  for (let index = 0; index < ids.length; index += 1) {
    if (ids[index]) continue;
    const id = randomUUID();
    await client.query(
      'INSERT INTO "CreditGrant" (id, "companyId", "sourceType", "sourceId", "grantType", "originalAmount", "remainingAmount", "createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, companyId, 'billing-v2-test', `grant-${String.fromCharCode(97 + index)}`, 'MANUAL_ADJUSTMENT', 1000, 1000, now],
    );
    ids[index] = id;
  }
  return ids;
}

async function ensureCreditLedger(client: Client, companyId: string): Promise<string> {
  const existing = await selectOne<{ id: string }>(client, 'SELECT id FROM "CreditLedger" WHERE "companyId" = $1 AND "idempotencyKey" = $2 LIMIT 1', [companyId, 'billing-v2-ledger']);
  if (existing) return existing.id;
  const id = randomUUID();
  const now = new Date().toISOString();
  await client.query(
    'INSERT INTO "CreditLedger" (id, "companyId", type, amount, "balanceBefore", "balanceAfter", "idempotencyKey", "createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [id, companyId, 'debit', -100, 1000, 900, 'billing-v2-ledger', now],
  );
  return id;
}

async function ensureFixtures(client: Client): Promise<FixtureContext> {
  const planId = await ensurePlan(client, 'pro', 'Professional', 89900);
  const companyId = await ensureCompany(client);
  const subscriptionId = await ensureSubscription(client, companyId, planId);
  const paymentOrderId = await ensurePaymentOrder(client, companyId);
  const creditGrantIds = await ensureCreditGrants(client, companyId);
  const creditLedgerId = await ensureCreditLedger(client, companyId);
  return { companyId, planId, subscriptionId, paymentOrderId, creditGrantIds, creditLedgerId };
}

async function expectErrorCode(promise: Promise<unknown>, expectedCode: string) {
  await assert.rejects(promise, (error: unknown) => {
    if (!(error instanceof Error)) return false;
    const code = Reflect.get(error, 'code');
    return String(code ?? error.message).includes(expectedCode);
  });
}

async function expectPgError<T>(
  db: BillingSqlClient,
  fn: () => Promise<T>,
  expectedSqlState: string,
) {
  if (!db.transactionAsync) {
    throw new Error('Billing SQL client does not support SAVEPOINT transactions');
  }

  await assert.rejects(
    () => db.transactionAsync!(async () => fn()),
    (error: unknown) => {
      if (!(error instanceof Error)) return false;
      const code = Reflect.get(error, 'code');
      return String(code ?? '').includes(expectedSqlState);
    },
  );
}

async function runBillingV2Transaction(client: Client, ctx: FixtureContext) {
  const db = createBillingSqlClient(client);

  const billingPeriod = await createMembershipBillingPeriod(
    {
      companyId: ctx.companyId,
      subscriptionId: ctx.subscriptionId,
      paymentOrderId: ctx.paymentOrderId,
      provider: 'WECHAT',
      externalPeriodKey: `WECHAT:${randomUUID()}`,
      planCode: 'pro',
      billingCycle: PrismaMembershipBillingCycle.MONTHLY,
      periodStart: '2026-07-01T00:00:00.000Z',
      periodEnd: '2026-08-01T00:00:00.000Z',
      status: PrismaMembershipBillingPeriodStatus.PAID,
      paymentCompletedAt: '2026-07-01T00:00:00.000Z',
      metadataJson: { source: 'billing-v2-db-test' },
    },
    db,
  );
  assert.ok(billingPeriod);
  assert.equal((await getMembershipBillingPeriod({ provider: 'WECHAT', externalPeriodKey: billingPeriod!.externalPeriodKey }, db))?.id, billingPeriod!.id);
  assert.equal((await listQualifyingMonthlyBillingPeriods(ctx.companyId, db)).length, 1);

  const duplicateBillingPeriod = await createMembershipBillingPeriod(
    {
      companyId: ctx.companyId,
      subscriptionId: ctx.subscriptionId,
      paymentOrderId: ctx.paymentOrderId,
      provider: 'WECHAT',
      externalPeriodKey: billingPeriod!.externalPeriodKey,
      planCode: 'pro',
      billingCycle: PrismaMembershipBillingCycle.MONTHLY,
      periodStart: '2026-07-01T00:00:00.000Z',
      periodEnd: '2026-08-01T00:00:00.000Z',
      status: PrismaMembershipBillingPeriodStatus.PAID,
      paymentCompletedAt: '2026-07-01T00:00:00.000Z',
      metadataJson: { source: 'billing-v2-db-test' },
    },
    db,
  );
  assert.equal(duplicateBillingPeriod?.id, billingPeriod?.id);

  await expectErrorCode(
    createMembershipBillingPeriod(
      {
        companyId: ctx.companyId,
        subscriptionId: ctx.subscriptionId,
        paymentOrderId: ctx.paymentOrderId,
        provider: 'WECHAT',
        externalPeriodKey: billingPeriod!.externalPeriodKey,
        planCode: 'pro',
        billingCycle: PrismaMembershipBillingCycle.MONTHLY,
        periodStart: '2026-07-01T00:00:00.000Z',
        periodEnd: '2026-08-01T00:00:00.000Z',
        status: PrismaMembershipBillingPeriodStatus.PAID,
        paymentCompletedAt: '2026-07-01T00:00:00.000Z',
        metadataJson: { source: 'billing-v2-db-test-conflict' },
      },
      db,
    ),
    'BILLING_PERIOD_IDEMPOTENCY_CONFLICT',
  );

  await expectPgError(
    db,
    () => createMembershipBillingPeriod(
      {
        companyId: randomUUID(),
        subscriptionId: ctx.subscriptionId,
        provider: 'WECHAT',
        externalPeriodKey: `WECHAT:${randomUUID()}`,
        planCode: 'pro',
        billingCycle: PrismaMembershipBillingCycle.MONTHLY,
        periodStart: '2026-07-01T00:00:00.000Z',
        periodEnd: '2026-08-01T00:00:00.000Z',
        status: PrismaMembershipBillingPeriodStatus.PAID,
        paymentCompletedAt: '2026-07-01T00:00:00.000Z',
      },
      db,
    ),
    '23503',
  );

  const invalidated = await invalidateMembershipBillingPeriod({ provider: 'WECHAT', externalPeriodKey: billingPeriod!.externalPeriodKey, invalidationReason: 'manual-check' }, db);
  assert.equal(invalidated?.status, 'INVALIDATED');
  assert.equal((await listQualifyingMonthlyBillingPeriods(ctx.companyId, db)).length, 0);

  const annualEntitlement = await grantCompanyEntitlement(
    {
      companyId: ctx.companyId,
      entitlementType: 'ALL_MODELS_PERMANENT',
      sourceType: 'ANNUAL_PURCHASE',
      sourceId: `annual-${randomUUID()}`,
      sourceOrderId: ctx.paymentOrderId,
      effectiveAt: '2026-07-01T00:00:00.000Z',
      metadataJson: { source: 'billing-v2-db-test' },
    },
    db,
  );
  assert.ok(annualEntitlement);
  assert.equal(await hasActiveCompanyEntitlement(ctx.companyId, 'ALL_MODELS_PERMANENT', db), true);
  assert.equal((await listActiveCompanyEntitlementGrants(ctx.companyId, 'ALL_MODELS_PERMANENT', db)).length, 1);

  const monthlyEntitlement = await grantCompanyEntitlement(
    {
      companyId: ctx.companyId,
      entitlementType: 'ALL_MODELS_PERMANENT',
      sourceType: 'MONTHLY_MILESTONE',
      sourceId: `milestone-${randomUUID()}`,
      effectiveAt: '2026-07-01T00:00:00.000Z',
    },
    db,
  );
  assert.ok(monthlyEntitlement);
  assert.equal((await listActiveCompanyEntitlementGrants(ctx.companyId, 'ALL_MODELS_PERMANENT', db)).length, 2);
  assert.equal((await grantCompanyEntitlement({
    companyId: ctx.companyId,
    entitlementType: 'ALL_MODELS_PERMANENT',
    sourceType: 'ANNUAL_PURCHASE',
    sourceId: annualEntitlement!.sourceId,
    sourceOrderId: ctx.paymentOrderId,
    effectiveAt: '2026-07-01T00:00:00.000Z',
    metadataJson: { source: 'billing-v2-db-test' },
  }, db))?.id, annualEntitlement?.id);

  await expectErrorCode(
    grantCompanyEntitlement({
      companyId: ctx.companyId,
      entitlementType: 'ALL_MODELS_PERMANENT',
      sourceType: 'ANNUAL_PURCHASE',
      sourceId: annualEntitlement!.sourceId,
      sourceOrderId: `${ctx.paymentOrderId}-conflict`,
      effectiveAt: '2026-07-01T00:00:00.000Z',
      metadataJson: { source: 'billing-v2-db-test' },
    }, db),
    'ENTITLEMENT_GRANT_IDEMPOTENCY_CONFLICT',
  );

  const revokedAnnual = await revokeCompanyEntitlementGrant({ id: annualEntitlement!.id, revocationReason: 'manual-revoke' }, db);
  assert.equal(Boolean(revokedAnnual?.revokedAt), true);
  assert.equal(await hasActiveCompanyEntitlement(ctx.companyId, 'ALL_MODELS_PERMANENT', db), true);
  const revokedMonthly = await revokeCompanyEntitlementGrant({ id: monthlyEntitlement!.id, revocationReason: 'manual-revoke' }, db);
  assert.equal(Boolean(revokedMonthly?.revokedAt), true);
  assert.equal(await hasActiveCompanyEntitlement(ctx.companyId, 'ALL_MODELS_PERMANENT', db), false);

  const monthlyRun = await scheduleMembershipPointGrantRun(
    {
      companyId: ctx.companyId,
      subscriptionId: ctx.subscriptionId,
      billingPeriodId: billingPeriod?.id,
      planCode: 'pro',
      grantPeriodKey: '2026-07',
      grantPeriodStart: '2026-07-01T00:00:00.000Z',
      grantPeriodEnd: '2026-08-01T00:00:00.000Z',
      scheduledAt: '2026-07-01T00:00:00.000Z',
      points: 120000,
      idempotencyKey: `MEMBERSHIP_POINTS:${ctx.subscriptionId}:2026-07`,
      metadataJson: { source: 'billing-v2-db-test' },
    },
    db,
  );
  assert.ok(monthlyRun);
  assert.equal((await getMembershipPointGrantRun(monthlyRun!.id, db))?.id, monthlyRun!.id);

  const duplicateMonthlyRun = await scheduleMembershipPointGrantRun(
    {
      companyId: ctx.companyId,
      subscriptionId: ctx.subscriptionId,
      billingPeriodId: billingPeriod?.id,
      planCode: 'pro',
      grantPeriodKey: '2026-07',
      grantPeriodStart: '2026-07-01T00:00:00.000Z',
      grantPeriodEnd: '2026-08-01T00:00:00.000Z',
      scheduledAt: '2026-07-01T00:00:00.000Z',
      points: 120000,
      idempotencyKey: `MEMBERSHIP_POINTS:${ctx.subscriptionId}:2026-07`,
      metadataJson: { source: 'billing-v2-db-test' },
    },
    db,
  );
  assert.equal(duplicateMonthlyRun?.id, monthlyRun?.id);

  await expectErrorCode(
    scheduleMembershipPointGrantRun(
      {
        companyId: ctx.companyId,
        subscriptionId: ctx.subscriptionId,
        billingPeriodId: billingPeriod?.id,
        planCode: 'pro',
        grantPeriodKey: '2026-07',
        grantPeriodStart: '2026-07-01T00:00:00.000Z',
        grantPeriodEnd: '2026-08-01T00:00:00.000Z',
        scheduledAt: '2026-07-01T00:00:00.000Z',
        points: 120000,
        idempotencyKey: `MEMBERSHIP_POINTS:${ctx.subscriptionId}:2026-07-conflict`,
        metadataJson: { source: 'billing-v2-db-test-conflict' },
      },
      db,
    ),
    'MEMBERSHIP_POINT_RUN_IDEMPOTENCY_CONFLICT',
  );

  const processingRun = await startMembershipPointGrantRun(monthlyRun!.id, db);
  assert.equal(processingRun?.status, 'PROCESSING');

  await expectErrorCode(markMembershipPointGrantRunSkipped(monthlyRun!.id, 'skip-after-processing', db), 'MEMBERSHIP_POINT_RUN_INVALID_TRANSITION');

  const failedRun = await markMembershipPointGrantRunFailed(monthlyRun!.id, 'manual-failed', db);
  assert.equal(failedRun?.status, 'FAILED');
  const retryingRun = await startMembershipPointGrantRun(monthlyRun!.id, db);
  assert.equal(retryingRun?.status, 'PROCESSING');

  await expectErrorCode(markMembershipPointGrantRunGranted(monthlyRun!.id, '', db), 'MEMBERSHIP_POINT_RUN_INVALID');
  const grantedRun = await markMembershipPointGrantRunGranted(monthlyRun!.id, ctx.creditGrantIds[0], db);
  assert.equal(grantedRun?.creditGrantId, ctx.creditGrantIds[0]);
  await expectErrorCode(markMembershipPointGrantRunGranted(monthlyRun!.id, ctx.creditGrantIds[1], db), 'MEMBERSHIP_POINT_RUN_IDEMPOTENCY_CONFLICT');
  const reversedRun = await markMembershipPointGrantRunReversed(monthlyRun!.id, 'reversed-for-refund', db);
  assert.equal(reversedRun?.status, 'REVERSED');

  await expectPgError(
    db,
    () => scheduleMembershipPointGrantRun(
      {
        companyId: ctx.companyId,
        subscriptionId: randomUUID(),
        planCode: 'pro',
        grantPeriodKey: '2026-09',
        grantPeriodStart: '2026-09-01T00:00:00.000Z',
        grantPeriodEnd: '2026-10-01T00:00:00.000Z',
        scheduledAt: '2026-09-01T00:00:00.000Z',
        points: 120000,
        idempotencyKey: `MEMBERSHIP_POINTS:${randomUUID()}`,
      },
      db,
    ),
    '23503',
  );

  const allocationRecords = await createCreditLedgerAllocations(
    {
      ledgerId: ctx.creditLedgerId,
      allocations: [
        { creditGrantId: ctx.creditGrantIds[0], amount: 30 },
        { creditGrantId: ctx.creditGrantIds[1], amount: 70 },
      ],
    },
    db,
  );
  assert.equal(allocationRecords.length, 2);
  assert.equal((await getCreditLedgerAllocations(ctx.creditLedgerId, db)).length, 2);

  await expectErrorCode(
    createCreditLedgerAllocations(
      {
        ledgerId: ctx.creditLedgerId,
        allocations: [
          { creditGrantId: ctx.creditGrantIds[0], amount: 30 },
          { creditGrantId: ctx.creditGrantIds[0], amount: 70 },
        ],
      },
      db,
    ),
    'CREDIT_ALLOCATION_INVALID',
  );

  await expectErrorCode(
    createCreditLedgerAllocations(
      {
        ledgerId: ctx.creditLedgerId,
        allocations: [{ creditGrantId: ctx.creditGrantIds[0], amount: 100 }],
      },
      db,
    ),
    'CREDIT_ALLOCATION_IDEMPOTENCY_CONFLICT',
  );

  await expectErrorCode(
    createCreditLedgerAllocations(
      {
        ledgerId: ctx.creditLedgerId,
        allocations: [{ creditGrantId: ctx.creditGrantIds[2], amount: 100 }],
      },
      db,
    ),
    'CREDIT_ALLOCATION_IDEMPOTENCY_CONFLICT',
  );

  await expectPgError(
    db,
    () => client.query(
      'INSERT INTO "CreditLedgerAllocation" (id, "ledgerId", "creditGrantId", amount, "createdAt") VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), randomUUID(), ctx.creditGrantIds[2], 1, new Date().toISOString()],
    ),
    '23503',
  );

  await expectErrorCode(
    createCreditLedgerAllocations(
      {
        ledgerId: randomUUID(),
        allocations: [{ creditGrantId: ctx.creditGrantIds[0], amount: 100 }],
      },
      db,
    ),
    'CREDIT_ALLOCATION_INVALID',
  );
}

async function main() {
  const target = assertSafeEnvironment();
  const directUrl = mustGetEnv('DATABASE_DIRECT_URL');
  const client = new Client({ connectionString: directUrl, ssl: { rejectUnauthorized: false } });

  console.log(JSON.stringify({
    target: {
      host: maskHost(target.host),
      database: target.database,
      endpointMatch: target.endpointMatch,
    },
  }, null, 2));

  await client.connect();
  try {
    const migrationExists = await selectOne<{ migration_name: string }>(client, 'SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = $1 LIMIT 1', ['20260718143000_billing_commercial_v2_foundation']);
    assert.ok(migrationExists, '缺少 Billing V2 迁移记录 20260718143000_billing_commercial_v2_foundation');

    const v2Tables = ['MembershipBillingPeriod', 'CompanyEntitlementGrant', 'MembershipPointGrantRun', 'CreditLedgerAllocation'];
    const coreTables = ['Company', 'Subscription', 'CreditGrant', 'CreditLedger'];
    const beforeV2 = await snapshotCounts(client, v2Tables);
    const beforeCore = await snapshotCounts(client, coreTables);
    const beforeMigrations = await queryCount(client, '_prisma_migrations');

    expectCountZero(beforeV2, v2Tables);
    console.log(JSON.stringify({ beforeV2, beforeCore, beforeMigrations }, null, 2));

    await client.query('BEGIN');
    let shouldRollback = false;
    try {
      const fixtureContext = await ensureFixtures(client);
      await runBillingV2Transaction(client, fixtureContext);
      shouldRollback = true;
      throw new RollbackSentinelError();
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof RollbackSentinelError || Reflect.get(error as object, 'sentinel') === ROLLBACK_SENTINEL) {
        console.log('[billing-v2-db-test] expected rollback completed');
      } else {
        throw error;
      }
    } finally {
      if (!shouldRollback) {
        // no-op: rollback already handled in catch for both success and failure
      }
    }

    const afterV2 = await snapshotCounts(client, v2Tables);
    const afterCore = await snapshotCounts(client, coreTables);
    const afterMigrations = await queryCount(client, '_prisma_migrations');

    assert.deepEqual(afterV2, beforeV2, 'Billing V2 表在回滚后必须恢复到测试前数量');
    assert.deepEqual(afterCore, beforeCore, '核心表数量在回滚后必须保持不变');
    assert.equal(afterMigrations, beforeMigrations, '_prisma_migrations 记录数量必须不变');

    console.log(JSON.stringify({
      afterV2,
      afterCore,
      afterMigrations,
      ok: true,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(String(error));
  }
  process.exitCode = 1;
});
