import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import { TRIAL_CREDITS, TRIAL_DAYS } from './pricing';
import { getMembershipPlan, isDeprecatedPlanCode, type CommercialPlanCode, type MembershipPlanConfig } from './commercial-config';

export type SubscriptionSource = 'COMPANY_ONBOARDING' | 'ADMIN_REPAIR' | 'LEGACY_MIGRATION';

export type SubscriptionRecord = {
  id: string;
  companyId: string;
  planId: string | null;
  planCode: string | null;
  planName: string | null;
  billingCycle: string;
  status: string;
  startedAt: string | Date | null;
  expiresAt: string | Date | null;
  autoRenew: boolean | number | null;
  createdAt: string | Date | null;
  updatedAt: string | Date | null;
};

export type SubscriptionEntitlements = {
  planCode: CommercialPlanCode;
  isLegacy: boolean;
  isDeprecated: boolean;
  memberLimit: number;
  knowledgeSpaceLimit: number;
  modelScope: 'ALL' | readonly string[];
  dailyImageLimitPerMember: number;
  skillLimit: number;
};

export type SubscriptionInitializationInput = {
  companyId: string;
  source: SubscriptionSource;
  userId?: string | null;
  idempotencyKey?: string;
  db?: any;
  tx?: any;
};

export class BillingError extends Error {
  code: string;
  retryable: boolean;
  requestId: string | null;

  constructor(code: string, message: string, retryable = false, requestId: string | null = null) {
    super(message);
    this.name = 'BillingError';
    this.code = code;
    this.retryable = retryable;
    this.requestId = requestId;
  }
}

const WELCOME_IDEMPOTENCY_PREFIX = 'WELCOME';

function resolveConnection(input?: { db?: any; tx?: any }) {
  return input?.tx || input?.db || getDb();
}

async function readLatestCompanySubscription(connection: any, companyId: string): Promise<SubscriptionRecord | null> {
  return connection.prepare(
    `SELECT s.*, p.code as "planCode", p.name as "planName"
     FROM "Subscription" s
     LEFT JOIN "Plan" p ON p.id = s."planId"
     WHERE s."companyId" = ?
     ORDER BY s."createdAt" DESC
     LIMIT 1`,
  ).get(companyId);
}

async function readCurrentCompanySubscription(connection: any, companyId: string): Promise<SubscriptionRecord | null> {
  return connection.prepare(
    `SELECT s.*, p.code as "planCode", p.name as "planName"
     FROM "Subscription" s
     LEFT JOIN "Plan" p ON p.id = s."planId"
     WHERE s."companyId" = ? AND s.status IN ('trialing','active','past_due')
     ORDER BY s."createdAt" DESC
     LIMIT 1`,
  ).get(companyId);
}

function ensureKnownPlanCode(planCode: string | null): CommercialPlanCode {
  if (!planCode) throw new BillingError('PLAN_CODE_UNKNOWN', '订阅套餐暂不可识别', false);
  if (planCode === 'trial' || planCode === 'pro' || planCode === 'enterprise' || isDeprecatedPlanCode(planCode)) return planCode;
  throw new BillingError('PLAN_CODE_UNKNOWN', `未知套餐代码: ${planCode}`, false);
}

function buildEntitlements(plan: MembershipPlanConfig, planCode: CommercialPlanCode): SubscriptionEntitlements {
  return {
    planCode,
    isLegacy: isDeprecatedPlanCode(planCode),
    isDeprecated: Boolean(plan.deprecated),
    memberLimit: plan.memberLimit,
    knowledgeSpaceLimit: plan.knowledgeSpaceLimit,
    modelScope: plan.allowedModels,
    dailyImageLimitPerMember: plan.dailyImageLimitPerMember,
    skillLimit: plan.skillLimit,
  };
}

async function ensureCreditAccount(connection: any, companyId: string) {
  const account = await connection.prepare(`SELECT * FROM "CreditAccount" WHERE "companyId" = ?`).get(companyId);
  if (account) return account;
  const accountId = randomUUID();
  const now = new Date().toISOString();
  await connection.prepare(`INSERT INTO "CreditAccount" (id, "companyId", "totalBalance", "packageBalance", "purchasedBalance", "bonusBalance", "updatedAt") VALUES (?,?,?,?,?,?,?)`).run(accountId, companyId, 0, 0, 0, 0, now);
  return { id: accountId, companyId, totalBalance: 0, packageBalance: 0, purchasedBalance: 0, bonusBalance: 0 };
}

async function grantWelcomeCredits(connection: any, input: { companyId: string; subscriptionId: string; userId?: string | null; idempotencyKey: string }) {
  const existing = await connection.prepare(`SELECT id FROM "CreditLedger" WHERE "idempotencyKey" = ?`).get(input.idempotencyKey);
  if (existing) {
    const account = await connection.prepare(`SELECT "totalBalance" FROM "CreditAccount" WHERE "companyId" = ?`).get(input.companyId);
    return { duplicated: true, balance: Number(account?.totalBalance || 0) };
  }

  const account = await ensureCreditAccount(connection, input.companyId);
  const before = Number(account.totalBalance || 0);
  const grantId = randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await connection.prepare(`INSERT INTO "CreditGrant" (id, "companyId", "sourceType", "sourceId", "originalAmount", "remainingAmount", "expiresAt", "createdAt") VALUES (?,?,?,?,?,?,?,?)`).run(
    grantId, input.companyId, 'trial', input.subscriptionId, TRIAL_CREDITS, TRIAL_CREDITS, expiresAt, now,
  );
  await connection.prepare(`UPDATE "CreditAccount" SET "totalBalance" = ?, "bonusBalance" = ?, "updatedAt" = ? WHERE id = ?`).run(
    before + TRIAL_CREDITS,
    Number(account.bonusBalance || 0) + TRIAL_CREDITS,
    now,
    account.id,
  );
  await connection.prepare(`INSERT INTO "CreditLedger" (id, "companyId", "userId", "grantId", type, "featureType", amount, "balanceBefore", "balanceAfter", "requestId", "idempotencyKey", description, "metadataJson", "createdAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    randomUUID(), input.companyId, input.userId || null, grantId, 'credit', 'welcome', TRIAL_CREDITS, before, before + TRIAL_CREDITS, input.subscriptionId, input.idempotencyKey, '体验版首次赠送积分', null, now,
  );
  return { duplicated: false, balance: before + TRIAL_CREDITS, grantId };
}

export async function getCompanySubscription(companyId: string, db = getDb()) {
  return readCurrentCompanySubscription(db, companyId);
}

export async function requireCompanySubscription(companyId: string, db = getDb()) {
  const current = await readCurrentCompanySubscription(db, companyId);
  if (current) return current;
  const latest = await readLatestCompanySubscription(db, companyId);
  if (latest) throw new BillingError('COMPANY_SUBSCRIPTION_INACTIVE', '当前企业订阅已失效，请联系管理员处理', false);
  throw new BillingError('COMPANY_SUBSCRIPTION_MISSING', '当前企业尚未开通订阅', false);
}

export function resolveSubscriptionEntitlements(subscription: Pick<SubscriptionRecord, 'planCode' | 'planName'> | null | undefined): SubscriptionEntitlements {
  const planCode = ensureKnownPlanCode(subscription?.planCode || null);
  const plan = getMembershipPlan(planCode);
  return buildEntitlements(plan, planCode);
}

async function initializeTrialSubscription(connection: any, input: SubscriptionInitializationInput) {
  await connection.prepare(`SELECT id FROM "Company" WHERE id = ?${connection.prepare ? ' FOR UPDATE' : ''}`).get(input.companyId).catch(async () => connection.prepare(`SELECT id FROM "Company" WHERE id = ?`).get(input.companyId));

  const latest = await readLatestCompanySubscription(connection, input.companyId);
  if (latest) {
    const subscription = latest;
    const shouldRepairGrant = input.source !== 'COMPANY_ONBOARDING' && subscription.planCode === 'trial';
    const grantResult = shouldRepairGrant
      ? await grantWelcomeCredits(connection, {
          companyId: input.companyId,
          subscriptionId: subscription.id,
          userId: input.userId || null,
          idempotencyKey: input.idempotencyKey || `${WELCOME_IDEMPOTENCY_PREFIX}:${input.companyId}`,
        })
      : { duplicated: true, balance: null as number | null };
    return { created: false, subscription, grantCreated: !grantResult.duplicated, balance: grantResult.balance };
  }

  const plan = await connection.prepare(`SELECT id, code, name FROM "Plan" WHERE code = ?`).get('trial');
  if (!plan?.id) throw new BillingError('TRIAL_INITIALIZATION_FAILED', '体验套餐未配置，无法初始化企业试用订阅', false);

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const subscriptionId = randomUUID();
  try {
    await connection.prepare(
      `INSERT INTO "Subscription" (id, "companyId", "planId", "billingCycle", status, "startedAt", "expiresAt", "autoRenew", "createdAt", "updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(subscriptionId, input.companyId, plan.id, 'trial', 'trialing', now, expiresAt, false, now, now);
    const grantResult = await grantWelcomeCredits(connection, {
      companyId: input.companyId,
      subscriptionId,
      userId: input.userId || null,
      idempotencyKey: input.idempotencyKey || `${WELCOME_IDEMPOTENCY_PREFIX}:${input.companyId}`,
    });
    return {
      created: true,
      subscription: { id: subscriptionId, companyId: input.companyId, planId: plan.id, planCode: 'trial', planName: plan.name, billingCycle: 'trial', status: 'trialing', startedAt: now, expiresAt, autoRenew: false, createdAt: now, updatedAt: now },
      grantCreated: !grantResult.duplicated,
      balance: grantResult.balance,
    };
  } catch (error: any) {
    throw new BillingError('TRIAL_INITIALIZATION_FAILED', error?.message || '体验订阅初始化失败', false);
  }
}

export async function initializeTrialSubscriptionForCompany(input: SubscriptionInitializationInput) {
  const connection = resolveConnection(input);
  if (input.tx) return initializeTrialSubscription(connection, input);
  if (input.db && typeof input.db.transactionAsync === 'function') {
    return input.db.transactionAsync((tx: any) => initializeTrialSubscription(tx, { ...input, tx }));
  }
  return initializeTrialSubscription(connection, input);
}
