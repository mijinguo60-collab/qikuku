export type MembershipPlanCode = 'trial' | 'pro' | 'enterprise';
export type DeprecatedPlanCode = 'basic' | 'custom';
export type CommercialPlanCode = MembershipPlanCode | DeprecatedPlanCode;
export type BillingCycle = 'monthly' | 'yearly';
export type MembershipBillingCycle = BillingCycle;

export type ContextMultiplierTier = {
  maxTokens: number | null;
  multiplier: 1 | 2 | 4 | 8;
};

export type ModelPricingConfig = {
  modelId: string;
  displayName: string;
  basePoints: number;
  creditLabel: string;
};

export type ModelAliasConfig = Record<string, string>;

export type RechargeTierConfig = {
  amountCents: number;
  basePoints: number;
  bonusPoints: number;
  basePointsValidDays: number;
  bonusPointsValidDays: number;
};

export type SuperAgentWholesalePrice = Record<BillingCycle, number>;

export type PermanentModelAccessPolicy = {
  monthlyPaidMonthsRequired: number;
  eligiblePlanCodes: readonly MembershipPlanCode[];
  eligibleBillingCycles: readonly BillingCycle[];
  annualPurchaseUnlocksImmediately: boolean;
  superAgentSelfCompanyUnlocksImmediately: boolean;
  overlappingPeriodsCountOnce: boolean;
  refundedPeriodsCount: boolean;
};

export type CompanyPermanentEntitlementType = 'ALL_MODELS_PERMANENT';

export type CompanyPermanentEntitlementSource = 'MONTHLY_MILESTONE' | 'ANNUAL_PURCHASE' | 'SUPER_AGENT_SELF_COMPANY' | 'ADMIN_GRANT' | 'LEGACY_MIGRATION';

export type CompanyEntitlementGrantType = 'ALL_MODELS_PERMANENT';

export type CompanyEntitlementGrantSourceType = 'MONTHLY_MILESTONE' | 'ANNUAL_PURCHASE' | 'SUPER_AGENT_SELF_COMPANY' | 'ADMIN_GRANT' | 'LEGACY_MIGRATION';

export type CompanyPermanentEntitlement = {
  type: CompanyPermanentEntitlementType;
  source: CompanyPermanentEntitlementSource;
  sourceOrderId?: string | null;
  grantedAt?: string | Date | null;
  effectiveAt?: string | Date | null;
  revokedAt?: string | Date | null;
  metadataJson?: unknown;
};

export type CompanyEntitlementGrant = {
  id: string;
  companyId: string;
  entitlementType: CompanyEntitlementGrantType;
  sourceType: CompanyEntitlementGrantSourceType;
  sourceId?: string | null;
  sourceOrderId?: string | null;
  grantedAt: string | Date;
  effectiveAt?: string | Date | null;
  revokedAt?: string | Date | null;
  revocationReason?: string | null;
  metadataJson?: unknown;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export type SuperAgentConfig = {
  annualFeeCents: number;
  demoPoints: number;
  leadPoolPoints: number;
  demoPointsValidDays: number;
  leadGrantPerCompanyLimit: number;
  leadGrantValidDays: number;
  rechargePurchaseRate: number;
  wholesalePrices: Record<'pro' | 'enterprise', SuperAgentWholesalePrice>;
};

export type MembershipPlanConfig = {
  code: CommercialPlanCode;
  displayName: string;
  name: string;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  monthlyPrice: number;
  yearlyPrice: number;
  monthlyGrantedPoints: number;
  monthlyCredits: number;
  welcomePoints: number;
  welcomePointsValidDays: number;
  memberLimit: number;
  maxMembers: number;
  dailyImageLimitPerMember: number;
  knowledgeSpaceLimit: number;
  maxKnowledgeSpaces: number;
  skillLimit: number;
  allowedModels: 'ALL' | readonly string[];
  basicRolePermission: boolean;
  departmentRolePermission: boolean;
  auditEnabled: boolean;
  usageAnalyticsLevel: 'none' | 'basic' | 'advanced';
  supportLevel: 'standard' | 'priority' | 'dedicated';
  trainingBenefits: readonly string[];
  storageLimitBytes: number;
  features: readonly string[];
  deprecated?: true;
};

function withLegacyFields(plan: Omit<MembershipPlanConfig, 'name' | 'monthlyPrice' | 'yearlyPrice' | 'monthlyCredits' | 'maxMembers' | 'maxKnowledgeSpaces'> & { name: string }): MembershipPlanConfig {
  return {
    ...plan,
    monthlyPrice: plan.monthlyPriceCents,
    yearlyPrice: plan.yearlyPriceCents,
    monthlyCredits: plan.monthlyGrantedPoints,
    maxMembers: plan.memberLimit,
    maxKnowledgeSpaces: plan.knowledgeSpaceLimit,
  };
}

const planCatalog = {
  trial: withLegacyFields({
    code: 'trial',
    displayName: '初级会员·基础体验版',
    name: '初级会员·基础体验版',
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    monthlyGrantedPoints: 0,
    welcomePoints: 3000,
    welcomePointsValidDays: 14,
    memberLimit: 5,
    dailyImageLimitPerMember: 2,
    knowledgeSpaceLimit: 1,
    skillLimit: 0,
    allowedModels: ['deepseek-v4-flash', 'deepseek-v4-pro'] as const,
    basicRolePermission: true,
    departmentRolePermission: false,
    auditEnabled: false,
    usageAnalyticsLevel: 'none',
    supportLevel: 'standard',
    trainingBenefits: [] as const,
    storageLimitBytes: 0,
    features: [
      '赠送 3,000 体验积分（14 天有效）',
      '最多 5 名成员',
      '每名成员每日最多生成 2 张图片',
      '仅可使用 DeepSeek V4 Flash / DeepSeek V4 Pro',
      '1 个知识空间',
      '不开放企业 Skill',
    ] as const,
  }),
  pro: withLegacyFields({
    code: 'pro',
    displayName: '中级会员·专业版',
    name: '中级会员·专业版',
    monthlyPriceCents: 129900,
    yearlyPriceCents: 1290000,
    monthlyGrantedPoints: 120000,
    welcomePoints: 0,
    welcomePointsValidDays: 0,
    memberLimit: 20,
    dailyImageLimitPerMember: 20,
    knowledgeSpaceLimit: 10,
    skillLimit: 5,
    allowedModels: 'ALL' as const,
    basicRolePermission: true,
    departmentRolePermission: true,
    auditEnabled: false,
    usageAnalyticsLevel: 'basic',
    supportLevel: 'priority',
    trainingBenefits: ['年卡赠送 1 次线上培训'] as const,
    storageLimitBytes: 20 * 1024 ** 3,
    features: [
      '每月发放 120,000 会员积分',
      '最多 20 名成员',
      '每名成员每日最多生成 20 张图片',
      '解锁全部模型',
      '10 个知识空间',
      '5 个企业 Skill',
      '部门与角色权限',
      '基础用量统计',
    ] as const,
  }),
  enterprise: withLegacyFields({
    code: 'enterprise',
    displayName: '高级会员·企业版',
    name: '高级会员·企业版',
    monthlyPriceCents: 399900,
    yearlyPriceCents: 3990000,
    monthlyGrantedPoints: 400000,
    welcomePoints: 0,
    welcomePointsValidDays: 0,
    memberLimit: 100,
    dailyImageLimitPerMember: 100,
    knowledgeSpaceLimit: 50,
    skillLimit: 30,
    allowedModels: 'ALL' as const,
    basicRolePermission: true,
    departmentRolePermission: true,
    auditEnabled: true,
    usageAnalyticsLevel: 'advanced',
    supportLevel: 'dedicated',
    trainingBenefits: ['年卡赠送 2 次培训', '年卡赠送 1 次基础经营诊断'] as const,
    storageLimitBytes: 100 * 1024 ** 3,
    features: [
      '每月发放 400,000 会员积分',
      '最多 100 名成员',
      '每名成员每日最多生成 100 张图片',
      '解锁全部模型',
      '50 个知识空间',
      '30 个企业 Skill',
      '高级权限和审计记录',
      '高级统计与成员分析',
      '专属服务群',
    ] as const,
  }),
  basic: withLegacyFields({
    code: 'basic',
    displayName: '基础版（deprecated）',
    name: '基础版（deprecated）',
    monthlyPriceCents: 29900,
    yearlyPriceCents: 299000,
    monthlyGrantedPoints: 20000,
    welcomePoints: 0,
    welcomePointsValidDays: 0,
    memberLimit: 5,
    dailyImageLimitPerMember: 2,
    knowledgeSpaceLimit: 10,
    skillLimit: 0,
    allowedModels: 'ALL' as const,
    basicRolePermission: true,
    departmentRolePermission: false,
    auditEnabled: false,
    usageAnalyticsLevel: 'basic',
    supportLevel: 'standard',
    trainingBenefits: [] as const,
    storageLimitBytes: 5 * 1024 ** 3,
    features: ['企业知识库', '基础 AI 问答', '5GB 存储'] as const,
    deprecated: true as const,
  }),
  custom: withLegacyFields({
    code: 'custom',
    displayName: '定制版（deprecated）',
    name: '定制版（deprecated）',
    monthlyPriceCents: 500000,
    yearlyPriceCents: 0,
    monthlyGrantedPoints: 0,
    welcomePoints: 0,
    welcomePointsValidDays: 0,
    memberLimit: 0,
    dailyImageLimitPerMember: 0,
    knowledgeSpaceLimit: 0,
    skillLimit: 0,
    allowedModels: 'ALL' as const,
    basicRolePermission: true,
    departmentRolePermission: true,
    auditEnabled: true,
    usageAnalyticsLevel: 'advanced',
    supportLevel: 'dedicated',
    trainingBenefits: [] as const,
    storageLimitBytes: 0,
    features: ['按合同配置'] as const,
    deprecated: true as const,
  }),
} as const satisfies Record<CommercialPlanCode, MembershipPlanConfig>;

export const MEMBERSHIP_PLAN_CODES = ['trial', 'pro', 'enterprise'] as const satisfies readonly MembershipPlanCode[];
export const DEPRECATED_PLAN_CODES = ['basic', 'custom'] as const satisfies readonly DeprecatedPlanCode[];

export const CONTEXT_MULTIPLIER_TIERS: readonly ContextMultiplierTier[] = [
  { maxTokens: 5000, multiplier: 1 },
  { maxTokens: 15000, multiplier: 2 },
  { maxTokens: 30000, multiplier: 4 },
  { maxTokens: null, multiplier: 8 },
] as const;

export const MODEL_PRICING = {
  'deepseek-v4-flash': { modelId: 'deepseek-v4-flash', displayName: 'DeepSeek V4 Flash', basePoints: 5, creditLabel: '5积分起/次' },
  'deepseek-v4-pro': { modelId: 'deepseek-v4-pro', displayName: 'DeepSeek V4 Pro', basePoints: 10, creditLabel: '10积分起/次' },
  'gpt-5.4-mini': { modelId: 'gpt-5.4-mini', displayName: 'GPT-5.4 mini', basePoints: 5, creditLabel: '5积分起/次' },
  'gpt-5.6-luna': { modelId: 'gpt-5.6-luna', displayName: 'GPT-5.6 Luna', basePoints: 5, creditLabel: '5积分起/次' },
  'claude-haiku-4-5': { modelId: 'claude-haiku-4-5', displayName: 'Claude Haiku 4.5', basePoints: 5, creditLabel: '5积分起/次' },
  'gpt-5.4': { modelId: 'gpt-5.4', displayName: 'GPT-5.4', basePoints: 10, creditLabel: '10积分起/次' },
  'gpt-5.5': { modelId: 'gpt-5.5', displayName: 'GPT-5.5', basePoints: 10, creditLabel: '10积分起/次' },
  'gpt-5.6-terra': { modelId: 'gpt-5.6-terra', displayName: 'GPT-5.6 Terra', basePoints: 10, creditLabel: '10积分起/次' },
  'gemini-3-flash': { modelId: 'gemini-3-flash', displayName: 'Gemini 3 Flash', basePoints: 10, creditLabel: '10积分起/次' },
  'claude-sonnet-4-6': { modelId: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6', basePoints: 10, creditLabel: '10积分起/次' },
  'gpt-5.6-sol': { modelId: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', basePoints: 15, creditLabel: '15积分起/次' },
  'claude-opus-4-6': { modelId: 'claude-opus-4-6', displayName: 'Claude Opus 4.6', basePoints: 15, creditLabel: '15积分起/次' },
  'claude-opus-4-7': { modelId: 'claude-opus-4-7', displayName: 'Claude Opus 4.7', basePoints: 15, creditLabel: '15积分起/次' },
  'claude-opus-4-8': { modelId: 'claude-opus-4-8', displayName: 'Claude Opus 4.8', basePoints: 15, creditLabel: '15积分起/次' },
  'gemini-3.5-flash': { modelId: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash', basePoints: 25, creditLabel: '25积分起/次' },
  'gemini-3.1-pro': { modelId: 'gemini-3.1-pro', displayName: 'Gemini 3.1 Pro', basePoints: 30, creditLabel: '30积分起/次' },
  'glm-5.2': { modelId: 'glm-5.2', displayName: 'GLM-5.2', basePoints: 30, creditLabel: '30积分起/次' },
} as const satisfies Record<string, ModelPricingConfig>;

export const MODEL_ALIASES: ModelAliasConfig = {
  'gemini-3-flash-preview': 'gemini-3-flash',
  'gemini-31-pro-preview': 'gemini-3.1-pro',
  'glm-52': 'glm-5.2',
};

const rechargeTiers = [
  { amountCents: 5000, basePoints: 5000, bonusPoints: 0, basePointsValidDays: 730, bonusPointsValidDays: 90 },
  { amountCents: 10000, basePoints: 10000, bonusPoints: 500, basePointsValidDays: 730, bonusPointsValidDays: 90 },
  { amountCents: 30000, basePoints: 30000, bonusPoints: 3000, basePointsValidDays: 730, bonusPointsValidDays: 90 },
  { amountCents: 50000, basePoints: 50000, bonusPoints: 6000, basePointsValidDays: 730, bonusPointsValidDays: 90 },
  { amountCents: 100000, basePoints: 100000, bonusPoints: 15000, basePointsValidDays: 730, bonusPointsValidDays: 90 },
  { amountCents: 300000, basePoints: 300000, bonusPoints: 60000, basePointsValidDays: 730, bonusPointsValidDays: 90 },
] as const satisfies readonly RechargeTierConfig[];

export const RECHARGE_OPTIONS = rechargeTiers.map((tier) => ({
  amountCents: tier.amountCents,
  baseCredits: tier.basePoints,
  bonusCredits: tier.bonusPoints,
})) as readonly { amountCents: number; baseCredits: number; bonusCredits: number }[];

export const SUPER_AGENT_CONFIG: SuperAgentConfig = {
  annualFeeCents: 1680000,
  demoPoints: 300000,
  leadPoolPoints: 300000,
  demoPointsValidDays: 365,
  leadGrantPerCompanyLimit: 3000,
  leadGrantValidDays: 14,
  rechargePurchaseRate: 0.8,
  wholesalePrices: {
    pro: { monthly: 89900, yearly: 890000 },
    enterprise: { monthly: 279900, yearly: 2790000 },
  },
};

export const PERMANENT_MODEL_ACCESS_POLICY: PermanentModelAccessPolicy = {
  monthlyPaidMonthsRequired: 3,
  eligiblePlanCodes: ['pro', 'enterprise'],
  eligibleBillingCycles: ['monthly', 'yearly'],
  annualPurchaseUnlocksImmediately: true,
  superAgentSelfCompanyUnlocksImmediately: true,
  overlappingPeriodsCountOnce: true,
  refundedPeriodsCount: false,
};

export function getPermanentModelAccessPolicy() {
  return PERMANENT_MODEL_ACCESS_POLICY;
}

export const MEMBER_PLAN_CATALOG = [planCatalog.trial, planCatalog.pro, planCatalog.enterprise] as const;
export const PLAN_CATALOG = [planCatalog.trial, planCatalog.basic, planCatalog.pro, planCatalog.enterprise, planCatalog.custom] as const;

export const TRIAL_CREDITS = planCatalog.trial.welcomePoints;
export const TRIAL_DAYS = planCatalog.trial.welcomePointsValidDays;
export const CREDIT_NAME = 'AI 算力积分';
export const CREDIT_PER_YUAN = 100;
export const FEATURE_CREDITS = {
  knowledge_chat: 5,
  skill_chat: 15,
  content_generation: 15,
  sales_assistant: 15,
  support_assistant: 15,
  training_plan: 15,
  business_diagnosis: 30,
  file_embedding: 5,
  image_generation: 100,
  image_edit: 100,
} as const;

export function isDeprecatedPlanCode(code: string): code is DeprecatedPlanCode {
  return code === 'basic' || code === 'custom';
}

export function getMembershipPlan(code: string): MembershipPlanConfig {
  const plan = planCatalog[code as CommercialPlanCode];
  if (!plan) throw new Error(`UNKNOWN_PLAN_CODE:${code}`);
  return plan;
}

export function resolveModelPricingModelId(modelId: string) {
  return MODEL_ALIASES[modelId] || modelId;
}

export function canPlanUseModel(planCode: string, modelId: string) {
  const plan = getMembershipPlan(planCode);
  const resolvedModelId = resolveModelPricingModelId(modelId);
  if (plan.allowedModels === 'ALL') return Boolean(MODEL_PRICING[resolvedModelId as keyof typeof MODEL_PRICING]);
  return plan.allowedModels.includes(resolvedModelId);
}

export function getModelBasePoints(modelId: string) {
  const resolvedModelId = resolveModelPricingModelId(modelId);
  const model = MODEL_PRICING[resolvedModelId as keyof typeof MODEL_PRICING];
  if (!model) throw new Error(`UNKNOWN_MODEL_ID:${modelId}`);
  return model.basePoints;
}

export function getModelCreditLabel(modelId: string) {
  const resolvedModelId = resolveModelPricingModelId(modelId);
  const model = MODEL_PRICING[resolvedModelId as keyof typeof MODEL_PRICING];
  if (!model) throw new Error(`UNKNOWN_MODEL_ID:${modelId}`);
  return model.creditLabel;
}

export function getContextMultiplier(effectiveTokens: number) {
  if (!Number.isFinite(effectiveTokens) || effectiveTokens < 0) throw new Error(`INVALID_EFFECTIVE_TOKENS:${effectiveTokens}`);
  for (const tier of CONTEXT_MULTIPLIER_TIERS) {
    if (tier.maxTokens === null || effectiveTokens <= tier.maxTokens) return tier.multiplier;
  }
  return 8;
}

export function calculateEstimatedChatPoints(modelId: string, effectiveTokens: number) {
  return getModelBasePoints(modelId) * getContextMultiplier(effectiveTokens);
}

export function getRechargeTierByAmountCents(amountCents: number) {
  const tier = rechargeTiers.find((item) => item.amountCents === amountCents);
  if (!tier) throw new Error(`UNKNOWN_RECHARGE_AMOUNT:${amountCents}`);
  if (tier.basePoints !== tier.amountCents) throw new Error(`RECHARGE_BASE_POINTS_MISMATCH:${tier.amountCents}`);
  return tier;
}

export function getAgentWholesalePrice(planCode: string, billingCycle: BillingCycle) {
  if (isDeprecatedPlanCode(planCode) || planCode === 'trial') throw new Error(`AGENT_PRICING_NOT_AVAILABLE:${planCode}`);
  const price = SUPER_AGENT_CONFIG.wholesalePrices[planCode as 'pro' | 'enterprise']?.[billingCycle];
  if (!price) throw new Error(`AGENT_PRICING_NOT_AVAILABLE:${planCode}:${billingCycle}`);
  return price;
}

export function getRechargeTierList() {
  return [...rechargeTiers];
}

export function getModelPricingList() {
  return Object.values(MODEL_PRICING);
}
