export type PlanCode = 'trial' | 'basic' | 'pro' | 'enterprise' | 'custom';

export const CREDIT_NAME = 'AI 算力积分';
export const CREDIT_PER_YUAN = 100;
export const TRIAL_CREDITS = 3_000;
export const TRIAL_DAYS = 14;

export const PLAN_CATALOG = [
  { code: 'trial', name: '体验版', monthlyPrice: 0, yearlyPrice: 0, monthlyCredits: 0, maxMembers: 3, maxKnowledgeSpaces: 3, storageLimitBytes: 0, features: ['14 天体验', '100 个文件', '不含高级审计与平台 API'] },
  { code: 'basic', name: '基础版', monthlyPrice: 29900, yearlyPrice: 299000, monthlyCredits: 20_000, maxMembers: 5, maxKnowledgeSpaces: 10, storageLimitBytes: 5 * 1024 ** 3, features: ['企业知识库', '基础 AI 问答', '5GB 存储'] },
  { code: 'pro', name: '专业版', monthlyPrice: 89900, yearlyPrice: 899000, monthlyCredits: 80_000, maxMembers: 20, maxKnowledgeSpaces: 30, storageLimitBytes: 20 * 1024 ** 3, features: ['完整管理 Skill', '权限管理', '安全审计', '行业热点'] },
  { code: 'enterprise', name: '企业版', monthlyPrice: 249900, yearlyPrice: 2499000, monthlyCredits: 250_000, maxMembers: 50, maxKnowledgeSpaces: 100, storageLimitBytes: 100 * 1024 ** 3, features: ['开放 API', '高级审计', '自定义 Skill', '优先支持'] },
  { code: 'custom', name: '定制版', monthlyPrice: 500000, yearlyPrice: 0, monthlyCredits: 0, maxMembers: 0, maxKnowledgeSpaces: 0, storageLimitBytes: 0, features: ['按合同配置'] },
] as const;

export const RECHARGE_OPTIONS = [
  { amountCents: 5_000, baseCredits: 5_000, bonusCredits: 0 },
  { amountCents: 10_000, baseCredits: 10_000, bonusCredits: 500 },
  { amountCents: 30_000, baseCredits: 30_000, bonusCredits: 3_000 },
  { amountCents: 50_000, baseCredits: 50_000, bonusCredits: 6_000 },
  { amountCents: 100_000, baseCredits: 100_000, bonusCredits: 15_000 },
  { amountCents: 300_000, baseCredits: 300_000, bonusCredits: 60_000 },
] as const;

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

export const COST_CONFIG = {
  llmOutputCostPerMillion: Number(process.env.LLM_OUTPUT_COST_PER_MILLION_TOKENS || 2),
  imageCostCentsPerImage: Number(process.env.IMAGE_COST_CENTS_PER_IMAGE || 16),
};

export function rechargeOption(amountCents: number) {
  return RECHARGE_OPTIONS.find((option) => option.amountCents === amountCents) || null;
}

export function estimatedCostCents(input: { outputTokens?: number; imageCount?: number }) {
  const textCost = Math.ceil(((input.outputTokens || 0) / 1_000_000) * COST_CONFIG.llmOutputCostPerMillion * 100);
  return textCost + (input.imageCount || 0) * COST_CONFIG.imageCostCentsPerImage;
}
