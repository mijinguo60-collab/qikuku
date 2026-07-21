export const PRODUCTION_ENDPOINT = 'ep-little-dream-atph250c';
export const TEST_ENDPOINT = 'ep-snowy-tooth-ata0virv';

export type DatabaseTarget = 'local' | 'test' | 'production' | 'unknown';
export type MaintenanceMode = 'dry-run' | 'apply';

export type MaintenanceArgs = {
  mode: MaintenanceMode;
  allowProduction: boolean;
};

export type MaintenanceWriteDecision =
  | { allowed: true }
  | { allowed: false; reason: 'unknown' | 'production_without_allow' };

export type InitBillingCompanyRow = {
  id: string;
};

export type InitBillingSubscriptionRow = {
  id?: string;
  companyId: string;
  planCode: string | null;
  createdAt: string | Date | null;
  updatedAt: string | Date | null;
};

export type InitBillingWelcomeGrantRow = {
  companyId: string;
  idempotencyKey: string;
};

export type InitBillingDryRunSummary = {
  totalCompanies: number;
  companiesWithoutSubscription: number;
  trialCompaniesMissingWelcomeGrant: number;
  companiesWithExistingWelcomeGrant: number;
  skippedNonTrialCompanies: number;
  expectedNewTrialSubscriptions: number;
  expectedWelcomePointGrants: number;
  expectedWelcomePointsTotal: number;
};

function parseDatabaseHostname(databaseUrl: string): string {
  return new URL(databaseUrl).hostname.toLowerCase();
}

function isLocalHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.endsWith('.local');
}

function isDirectPostgresUrl(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') return false;
    const hostname = url.hostname.toLowerCase();
    return !hostname.includes('pooler');
  } catch {
    return false;
  }
}

export function parseMaintenanceArgs(args: readonly string[]): MaintenanceArgs {
  if (args.length === 0 || (args.length === 1 && args[0] === '--dry-run')) {
    return { mode: 'dry-run', allowProduction: false };
  }
  if (args.length === 1 && args[0] === '--apply') {
    return { mode: 'apply', allowProduction: false };
  }
  if (args.length === 2 && args.includes('--apply') && args.includes('--allow-production')) {
    return { mode: 'apply', allowProduction: true };
  }
  throw new Error('UNSUPPORTED_ARGUMENT');
}

export function classifyDatabaseTarget(databaseUrl: string): DatabaseTarget {
  const hostname = parseDatabaseHostname(databaseUrl);

  if (isLocalHostname(hostname)) return 'local';
  if (hostname.startsWith(`${TEST_ENDPOINT}.`)) return 'test';
  if (hostname.startsWith(`${PRODUCTION_ENDPOINT}.`)) return 'production';
  return 'unknown';
}

export function isReadableDirectPostgresUrl(databaseUrl: string) {
  return isDirectPostgresUrl(databaseUrl);
}

export function resolveMaintenanceWriteDecision(target: DatabaseTarget, allowProduction: boolean): MaintenanceWriteDecision {
  if (target === 'unknown') return { allowed: false, reason: 'unknown' };
  if (target === 'production' && !allowProduction) return { allowed: false, reason: 'production_without_allow' };
  return { allowed: true };
}

function compareTimeline(a: InitBillingSubscriptionRow, b: InitBillingSubscriptionRow) {
  const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
  const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
  if (aTime !== bTime) return aTime - bTime;
  const aId = a.id || '';
  const bId = b.id || '';
  if (aId !== bId) return aId.localeCompare(bId);
  return a.companyId.localeCompare(b.companyId);
}

export function buildInitBillingDryRunSummary(input: {
  companies: readonly InitBillingCompanyRow[];
  subscriptions: readonly InitBillingSubscriptionRow[];
  welcomeGrants: readonly InitBillingWelcomeGrantRow[];
  trialCredits: number;
}): InitBillingDryRunSummary {
  const companies = [...input.companies];
  const welcomeGrantCompanies = new Set(input.welcomeGrants.map((grant) => grant.companyId));

  const subscriptionsByCompany = new Map<string, InitBillingSubscriptionRow[]>();
  for (const subscription of input.subscriptions) {
    const bucket = subscriptionsByCompany.get(subscription.companyId);
    if (bucket) bucket.push(subscription);
    else subscriptionsByCompany.set(subscription.companyId, [subscription]);
  }

  let companiesWithoutSubscription = 0;
  let trialCompaniesMissingWelcomeGrant = 0;
  let companiesWithExistingWelcomeGrant = 0;
  let skippedNonTrialCompanies = 0;

  for (const company of companies) {
    const companySubscriptions = subscriptionsByCompany.get(company.id) || [];
    if (companySubscriptions.length === 0) {
      companiesWithoutSubscription += 1;
      continue;
    }
    const sorted = [...companySubscriptions].sort(compareTimeline);
    const latest = sorted.length ? sorted[sorted.length - 1] : null;
    if (!latest || latest.planCode !== 'trial') {
      skippedNonTrialCompanies += 1;
      continue;
    }
    if (welcomeGrantCompanies.has(company.id)) {
      companiesWithExistingWelcomeGrant += 1;
    } else {
      trialCompaniesMissingWelcomeGrant += 1;
    }
  }

  const expectedNewTrialSubscriptions = companiesWithoutSubscription;
  const expectedWelcomePointGrants = expectedNewTrialSubscriptions + trialCompaniesMissingWelcomeGrant;

  return {
    totalCompanies: companies.length,
    companiesWithoutSubscription,
    trialCompaniesMissingWelcomeGrant,
    companiesWithExistingWelcomeGrant,
    skippedNonTrialCompanies,
    expectedNewTrialSubscriptions,
    expectedWelcomePointGrants,
    expectedWelcomePointsTotal: expectedWelcomePointGrants * input.trialCredits,
  };
}

export function formatMaintenanceTarget(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const host = url.hostname.toLowerCase();
  const [databaseName] = url.pathname.replace(/^\//, '').split('?');
  return {
    host,
    database: databaseName || '',
    pooled: host.includes('pooler'),
    direct: isDirectPostgresUrl(databaseUrl),
    target: classifyDatabaseTarget(databaseUrl),
  };
}
