import { getCompanySubscription, initializeTrialSubscriptionForCompany } from './subscriptions';

export { getCompanySubscription, initializeTrialSubscriptionForCompany, requireCompanySubscription } from './subscriptions';
export type { BillingError, SubscriptionEntitlements, SubscriptionInitializationInput, SubscriptionRecord, SubscriptionSource } from './subscriptions';

/**
 * Deprecated compatibility wrapper.
 * Business request paths should use getCompanySubscription() or
 * initializeTrialSubscriptionForCompany() directly.
 */
export async function getCurrentCompanySubscription(companyId: string) {
  return getCompanySubscription(companyId);
}

/**
 * Deprecated compatibility wrapper retained for existing maintenance flows.
 * Do not use from ordinary request handlers.
 */
export async function ensureCompanySubscription(companyId: string, userId?: string) {
  return initializeTrialSubscriptionForCompany({ companyId, source: 'LEGACY_MIGRATION', userId });
}
