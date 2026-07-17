/**
 * Server-owned model catalogue. Display names are deliberately separate from
 * provider IDs: unverified B.AI-style names remain disabled until an upstream
 * provider/model mapping and live capability check have both been confirmed.
 */

export type ModelProvider = 'deepseek' | 'minimax' | 'kimi' | 'glm' | 'openai' | 'anthropic' | 'google' | 'alibaba';

export type ModelCapabilities = {
  supportsText: boolean;
  supportsVision: boolean;
  supportsNativeFileInput: boolean;
  supportsParsedDocument: boolean;
  supportsWebSearch: boolean;
  supportsFileSearch: boolean;
  supportsToolCalling: boolean;
  supportsStreaming: boolean;
};

export type ModelDetails = {
  reasoning: string;
  speed: string;
  chinese: string;
  longContext: string;
  vision: string;
  files: string;
  webSearch: string;
  tools: string;
  bestFor: string;
  limitations: string;
};

export type ModelCatalogEntry = ModelCapabilities & {
  id: string;
  displayName: string;
  provider: ModelProvider;
  providerModelId: string | null;
  description: string;
  iconKey: string;
  enabled: boolean;
  sortOrder: number;
  recommended: boolean;
  tier: 'recommended' | 'advanced' | 'fast' | 'unverified';
  inputCreditRate: number;
  outputCreditRate: number;
  estimatedCredits: number;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  allowedFileTypes: string[];
  maxFileSize: number | null;
  fallbackModelId: string | null;
  details: ModelDetails;
  /** Never shown as an “integrated” model until a live provider check has passed. */
  verification: 'configured' | 'unverified';
};

const parsedDocumentTypes = ['pdf', 'docx', 'xlsx', 'txt', 'md', 'csv', 'json'];

const disabled = (
  id: string,
  displayName: string,
  provider: ModelProvider,
  sortOrder: number,
): ModelCatalogEntry => ({
  id,
  displayName,
  provider,
  providerModelId: null,
  description: '尚未验证上游模型 ID 或可用性，当前不可选。',
  iconKey: provider,
  enabled: false,
  sortOrder,
  recommended: false,
  tier: 'unverified',
  inputCreditRate: 0,
  outputCreditRate: 0,
  estimatedCredits: 0,
  supportsText: false,
  supportsVision: false,
  supportsNativeFileInput: false,
  supportsParsedDocument: false,
  supportsWebSearch: false,
  supportsFileSearch: false,
  supportsToolCalling: false,
  supportsStreaming: false,
  contextWindow: null,
  maxOutputTokens: null,
  allowedFileTypes: [],
  maxFileSize: null,
  fallbackModelId: null,
  details: {
    reasoning: '待当前 API 通道完成真实验证。',
    speed: '待当前 API 通道完成真实验证。',
    chinese: '待当前 API 通道完成真实验证。',
    longContext: '待当前 API 通道完成真实验证。',
    vision: '待当前 API 通道完成真实验证。',
    files: '待当前 API 通道完成真实验证。',
    webSearch: '待当前 API 通道完成真实验证。',
    tools: '待当前 API 通道完成真实验证。',
    bestFor: '当前不可选；需要先确认上游模型 ID、能力和调用结果。',
    limitations: '尚未配置或验证，不能用于企业对话。',
  },
  verification: 'unverified',
});

function verifiedGpt(
  id: string,
  displayName: string,
  providerModelId: string,
  sortOrder: number,
  estimatedCredits: number,
  description: string,
  tier: ModelCatalogEntry['tier'],
  details: Pick<ModelDetails, 'reasoning' | 'speed' | 'chinese' | 'longContext' | 'bestFor'>,
): ModelCatalogEntry {
  const entry = disabled(id, displayName, 'openai', sortOrder);
  return {
    ...entry,
    providerModelId,
    description,
    tier,
    enabled: true,
    recommended: tier === 'recommended',
    inputCreditRate: estimatedCredits / 5,
    outputCreditRate: estimatedCredits / 5,
    estimatedCredits,
    supportsText: true,
    supportsStreaming: true,
    // Qikuku extracts these document formats and injects their text into the
    // shared RAG prompt. This is not a provider-native file upload claim.
    supportsParsedDocument: true,
    supportsVision: false,
    supportsNativeFileInput: false,
    supportsWebSearch: false,
    supportsFileSearch: false,
    supportsToolCalling: false,
    allowedFileTypes: parsedDocumentTypes,
    verification: 'configured',
    details: {
      ...entry.details,
      ...details,
      vision: '当前通道的图片输入验证失败，暂不支持图片识别。',
      files: '支持企库库解析 PDF、DOCX、XLSX、TXT、MD、CSV、JSON 后注入资料文本；不支持模型原生文件输入。',
      webSearch: '当前未配置并验证真实联网搜索，不能开启联网。',
      tools: '当前未验证工具调用，不能启用。',
      limitations: '企业事实仅以检索到的资料为准；资料不足时会明确说明。',
    },
  };
}

// The GPT section intentionally contains only the six models on the user's
// current channel.  Their upstream IDs were listed by /v1/models and each
// passed text, streaming, RAG-context and Skill+RAG-context validation on
// 2026-07-16.  Capabilities which the current channel rejected or does not
// expose stay false rather than inheriting an upstream vendor claim.
const gptReferenceEntries: ModelCatalogEntry[] = [
  verifiedGpt('gpt-54', 'GPT-5.4', 'gpt-5.4', 100, 8, '均衡型通用助手，适合常规企业资料问答、总结和结构化表达。', 'recommended', {
    reasoning: '定位为通用型分析与表达。', speed: '定位为均衡响应。', chinese: '定位为中文企业沟通与资料整理。', longContext: '定位为处理中长企业资料。', bestFor: '制度查询、内容归纳和常规工作协作。',
  }),
  verifiedGpt('gpt-54-mini', 'GPT-5.4 mini', 'gpt-5.4-mini', 101, 5, '轻量快速模型，面向高频、短上下文的企业知识查询和提纲生成。', 'fast', {
    reasoning: '定位为轻量级日常推理。', speed: '定位为快速响应。', chinese: '定位为简洁中文问答。', longContext: '定位为短到中等长度资料处理。', bestFor: '高频问答、快速摘要和要点提取。',
  }),
  verifiedGpt('gpt-55', 'GPT-5.5', 'gpt-5.5', 102, 12, '进阶分析模型，面向需要拆解问题、比较资料和形成建议的企业任务。', 'advanced', {
    reasoning: '定位为进阶的多步骤分析。', speed: '定位为稳健响应。', chinese: '定位为中文分析与建议生成。', longContext: '定位为跨段资料对比。', bestFor: '问题拆解、方案比较和分析型 Skill。',
  }),
  verifiedGpt('gpt-56-luna', 'GPT-5.6 Luna', 'gpt-5.6-luna', 103, 12, '长资料阅读取向，面向多份企业文档的归纳、脉络梳理与持续对话。', 'advanced', {
    reasoning: '定位为基于资料脉络的归纳。', speed: '定位为阅读优先的稳健响应。', chinese: '定位为中文长资料梳理。', longContext: '定位为较长企业资料与连续上下文。', bestFor: '会议纪要、制度集合和多轮资料梳理。',
  }),
  verifiedGpt('gpt-56-sol', 'GPT-5.6 Sol', 'gpt-5.6-sol', 104, 18, '高阶推理取向，面向复杂经营问题、严谨分析框架和关键决策辅助。', 'advanced', {
    reasoning: '定位为高阶复杂推理。', speed: '定位为优先保证分析深度。', chinese: '定位为中文经营分析。', longContext: '定位为复杂资料与多步骤论证。', bestFor: '经营诊断、复杂方案和高级分析型 Skill。',
  }),
  verifiedGpt('gpt-56-terra', 'GPT-5.6 Terra', 'gpt-5.6-terra', 105, 15, '企业实务分析取向，面向跨部门资料整合、流程推演和可执行行动建议。', 'advanced', {
    reasoning: '定位为企业实务场景推演。', speed: '定位为稳健的结构化输出。', chinese: '定位为跨部门中文协作。', longContext: '定位为整合多来源企业资料。', bestFor: '流程优化、跨部门协同和行动清单。',
  }),
];

const referenceEntries: ModelCatalogEntry[] = [
  ['minimax-m3', 'MiniMax-M3', 'minimax'], ['minimax-m27', 'MiniMax-M2.7', 'minimax'],
  ['deepseek-v4-pro', 'DeepSeek-V4-Pro', 'deepseek'],
  ['kimi-k26', 'Kimi-K2.6', 'kimi'], ['kimi-k25', 'Kimi-K2.5', 'kimi'],
  ['glm-52', 'GLM-5.2', 'glm'], ['glm-51', 'GLM-5.1', 'glm'],
  ['claude-opus-48', 'Claude Opus 4.8', 'anthropic'], ['claude-opus-47', 'Claude Opus 4.7', 'anthropic'],
  ['claude-opus-46', 'Claude Opus 4.6', 'anthropic'], ['claude-opus-45', 'Claude Opus 4.5', 'anthropic'],
  ['claude-sonnet-46', 'Claude Sonnet 4.6', 'anthropic'], ['claude-sonnet-45', 'Claude Sonnet 4.5', 'anthropic'], ['claude-haiku-45', 'Claude Haiku 4.5', 'anthropic'],
  ['gemini-31-pro', 'Gemini 3.1 Pro', 'google'], ['gemini-35-flash', 'Gemini 3.5 Flash', 'google'], ['gemini-3-flash', 'Gemini 3 Flash', 'google'],
  ['qwen-36-27b', 'Qwen3.6-27B', 'alibaba'],
].map(([id, displayName, provider], index) => disabled(id, displayName, provider as ModelProvider, 100 + index));

function configuredDeepSeekModels(): ModelCatalogEntry[] {
  const configured = Boolean(process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_BASE_URL);
  if (!configured) return [disabled('deepseek-configured', 'DeepSeek（当前通道）', 'deepseek', 1)];

  // This allow-list is deliberately explicit.  An ID is exposed only after it
  // has been listed by the configured upstream and passed a minimal real call.
  // Operators can narrow the local catalogue without a code release.
  const configuredDefault = process.env.DEEPSEEK_MODEL?.trim() || '';
  // On 2026-07-16 the configured upstream returned exactly these two IDs and
  // both passed a minimal completion call.  An operator may override this with
  // DEEPSEEK_VERIFIED_MODEL_IDS after changing the upstream channel.
  const verifiedIds = new Set((process.env.DEEPSEEK_VERIFIED_MODEL_IDS
    || (configuredDefault === 'deepseek-v4-flash' ? 'deepseek-v4-flash,deepseek-v4-pro' : configuredDefault))
    .split(',').map((value) => value.trim()).filter(Boolean));
  const entries = [
    {
      id: 'deepseek-v4-flash', providerModelId: 'deepseek-v4-flash', displayName: 'DeepSeek V4 Flash',
      description: '快速企业资料问答。适合日常制度、流程与产品查询；支持流式输出和已解析文档上下文。',
      recommended: true, tier: 'fast' as const, estimatedCredits: 5, sortOrder: 1,
    },
    {
      id: 'deepseek-v4-pro', providerModelId: 'deepseek-v4-pro', displayName: 'DeepSeek V4 Pro',
      description: '面向复杂企业资料分析与多步骤梳理；支持流式输出和已解析文档上下文，响应通常较慢。',
      recommended: false, tier: 'advanced' as const, estimatedCredits: 12, sortOrder: 2,
    },
  ];

  return entries.map((entry): ModelCatalogEntry => ({
    ...entry,
    provider: 'deepseek',
    iconKey: 'deepseek',
    enabled: verifiedIds.has(entry.providerModelId),
    inputCreditRate: 1,
    outputCreditRate: 1,
    supportsText: true,
    // The current OpenAI-compatible route has only been verified for text.
    // Parsed documents are extracted by Qikuku before model invocation.
    supportsVision: false,
    supportsNativeFileInput: false,
    supportsParsedDocument: true,
    supportsWebSearch: false,
    supportsFileSearch: false,
    supportsToolCalling: false,
    supportsStreaming: true,
    contextWindow: null,
    maxOutputTokens: null,
    allowedFileTypes: parsedDocumentTypes,
    maxFileSize: null,
    fallbackModelId: null,
    details: {
      reasoning: entry.id.endsWith('pro') ? '适合多步骤资料归纳与分析；以实际企业资料为依据。' : '适合日常企业资料查询与短流程梳理。',
      speed: entry.id.endsWith('pro') ? '偏稳健，响应通常较慢。' : '偏快速，适合高频问答。',
      chinese: '已在当前企业中文知识库问答链路中验证。',
      longContext: '上下文窗口由当前通道决定，系统会优先注入检索到的企业资料。',
      vision: '当前通道未验证图片识别，不支持会话图片输入。',
      files: '支持企库库先解析 PDF、DOCX、XLSX、TXT、MD、CSV、JSON 后注入文本；不支持模型原生文件。',
      webSearch: '当前未配置真实联网搜索，不能开启联网。',
      tools: '当前未验证工具调用，不能启用。',
      bestFor: entry.id.endsWith('pro') ? '复杂制度梳理、跨资料对比和分析型 Skill。' : '制度、流程、产品等日常企业知识库问答。',
      limitations: '企业事实仅以检索到的资料为准；资料不足时会明确说明。',
    },
    verification: verifiedIds.has(entry.providerModelId) ? 'configured' : 'unverified',
  }));
}

export function getServerModelCatalog(): ModelCatalogEntry[] {
  return [...configuredDeepSeekModels(), ...gptReferenceEntries, ...referenceEntries].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getEnabledModels() {
  return getServerModelCatalog().filter((model) => model.enabled);
}

export function getEnabledModel(modelId: string | undefined | null) {
  const requested = modelId || 'deepseek-configured';
  return getEnabledModels().find((model) => model.id === requested) || null;
}

export function toPublicModel(model: ModelCatalogEntry) {
  const { providerModelId, ...safe } = model;
  // providerModelId is safe to expose only for an enabled model; unavailable
  // entries deliberately have no fabricated upstream ID.
  return { ...safe, providerModelId: model.enabled ? providerModelId : null };
}
