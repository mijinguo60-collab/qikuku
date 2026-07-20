import { getRechargeTierByAmountCents } from './commercial-config';

export {
  CREDIT_NAME,
  CREDIT_PER_YUAN,
  FEATURE_CREDITS,
  MEMBER_PLAN_CATALOG as MEMBER_PLAN_CATALOG,
  MODEL_ALIASES,
  MODEL_PRICING,
  PERMANENT_MODEL_ACCESS_POLICY,
  PLAN_CATALOG,
  RECHARGE_OPTIONS,
  TRIAL_CREDITS,
  TRIAL_DAYS,
  calculateEstimatedChatPoints,
  canPlanUseModel,
  getAgentWholesalePrice,
  getContextMultiplier,
  getMembershipPlan,
  getModelBasePoints,
  getModelCreditLabel,
  getRechargeTierByAmountCents,
  isDeprecatedPlanCode,
  resolveModelPricingModelId,
  SUPER_AGENT_CONFIG,
} from './commercial-config';

export type { BillingCycle, CommercialPlanCode as PlanCode, ContextMultiplierTier, MembershipPlanConfig, MembershipPlanCode, ModelPricingConfig, PermanentModelAccessPolicy, RechargeTierConfig, SuperAgentConfig } from './commercial-config';

export function rechargeOption(amountCents: number) {
  const tier = getRechargeTierByAmountCents(amountCents);
  return { amountCents: tier.amountCents, baseCredits: tier.basePoints, bonusCredits: tier.bonusPoints };
}

export function estimatedCostCents(input: { outputTokens?: number; imageCount?: number }) {
  const llmOutputCostPerMillion = Number(process.env.LLM_OUTPUT_COST_PER_MILLION_TOKENS || 2);
  const imageCostCentsPerImage = Number(process.env.IMAGE_COST_CENTS_PER_IMAGE || 16);
  const textCost = Math.ceil(((input.outputTokens || 0) / 1_000_000) * llmOutputCostPerMillion * 100);
  return textCost + (input.imageCount || 0) * imageCostCentsPerImage;
}
