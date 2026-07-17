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
  ['kimi-k26', 'Kimi-K2.6', 'kimi'], ['kimi-k25', 'Kimi-K2.5', 'kimi'],
  ['glm-52', 'GLM-5.2', 'glm'], ['glm-51', 'GLM-5.1', 'glm'],
  ['claude-opus-48', 'Claude Opus 4.8', 'anthropic'], ['claude-opus-47', 'Claude Opus 4.7', 'anthropic'],
  ['claude-opus-46', 'Claude Opus 4.6', 'anthropic'], ['claude-opus-45', 'Claude Opus 4.5', 'anthropic'],
  ['claude-sonnet-46', 'Claude Sonnet 4.6', 'anthropic'], ['claude-sonnet-45', 'Claude Sonnet 4.5', 'anthropic'], ['claude-haiku-45', 'Claude Haiku 4.5', 'anthropic'],
  ['qwen-36-27b', 'Qwen3.6-27B', 'alibaba'],
].map(([id, displayName, provider], index) => disabled(id, displayName, provider as ModelProvider, 100 + index));

type VerifiedGeminiEntry = Pick<ModelCatalogEntry, 'id' | 'displayName' | 'description' | 'recommended' | 'tier' | 'estimatedCredits' | 'sortOrder'> & {
  providerModelId: string;
  details: Pick<ModelDetails, 'reasoning' | 'speed' | 'chinese' | 'longContext' | 'bestFor'>;
};

// These are the three IDs returned by the approved channel's /v1/models and
// verified through text, SSE, RAG-context and Skill+RAG-context requests on
// 2026-07-17. Credentials remain shared, while every request receives the
// exact selected providerModelId; GEMINI_MODEL is deliberately unsupported.
const verifiedGeminiEntries: VerifiedGeminiEntry[] = [
  {
    id: 'gemini-3-flash-preview', providerModelId: 'gemini-3-flash-preview', displayName: 'Gemini 3 Flash Preview',
    description: '快速响应的 Gemini 模型，适合高频企业知识问答、资料总结、内容整理和轻量任务处理。',
    recommended: false, tier: 'fast', estimatedCredits: 5, sortOrder: 110,
    details: { reasoning: '定位为轻量企业资料归纳与日常问答。', speed: '定位为快速响应。', chinese: '已完成中文企业资料问答验证。', longContext: '当前未验证超长上下文上限。', bestFor: '高频资料查询、内容整理和轻量任务。' },
  },
  {
    id: 'gemini-31-pro-preview', providerModelId: 'gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro Preview',
    description: '面向复杂分析和高质量输出的进阶模型，适合长资料归纳、复杂问题拆解、方案生成和决策辅助。',
    recommended: false, tier: 'advanced', estimatedCredits: 15, sortOrder: 111,
    details: { reasoning: '定位为复杂问题拆解与结构化分析。', speed: '定位为深度分析优先。', chinese: '已完成中文资料分析验证。', longContext: '当前未验证超长上下文上限。', bestFor: '多资料归纳、方案生成和决策辅助。' },
  },
  {
    id: 'gemini-35-flash', providerModelId: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash',
    description: '兼顾响应速度与任务质量的实用模型，适合日常企业问答、批量资料处理、总结和结构化输出。',
    recommended: true, tier: 'recommended', estimatedCredits: 8, sortOrder: 112,
    details: { reasoning: '定位为效率与资料处理质量兼顾。', speed: '定位为快速且稳健的日常响应。', chinese: '已完成中文企业问答验证。', longContext: '当前未验证超长上下文上限。', bestFor: '日常问答、批量资料总结和结构化输出。' },
  },
];

function verifiedGeminiModels(): ModelCatalogEntry[] {
  const configured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_BASE_URL);
  const verifiedIds = new Set(verifiedGeminiEntries.map((entry) => entry.providerModelId));
  return verifiedGeminiEntries.map((entry) => {
    const base = disabled(entry.id, entry.displayName, 'google', entry.sortOrder);
    return {
      ...base,
      description: entry.description,
      iconKey: 'google',
      recommended: entry.recommended,
      tier: entry.tier,
      estimatedCredits: entry.estimatedCredits,
      inputCreditRate: entry.estimatedCredits / 5,
      outputCreditRate: entry.estimatedCredits / 5,
      providerModelId: configured && verifiedIds.has(entry.providerModelId) ? entry.providerModelId : null,
      enabled: configured && verifiedIds.has(entry.providerModelId),
      supportsText: true,
      supportsStreaming: true,
      // Qikuku extracts documents and injects text into the shared RAG prompt.
      // This is intentionally distinct from a provider-native file upload.
      supportsParsedDocument: true,
      supportsVision: false,
      supportsNativeFileInput: false,
      supportsWebSearch: false,
      supportsFileSearch: false,
      supportsToolCalling: false,
      allowedFileTypes: parsedDocumentTypes,
      details: {
        ...base.details,
        ...entry.details,
        vision: '当前统一 Provider 尚不发送图片内容，因此不支持会话图片输入。',
        files: '支持企库库解析 PDF、DOCX、XLSX、TXT、MD、CSV、JSON 后注入文本；不支持模型原生文件输入。',
        webSearch: '当前未配置并验证真实联网搜索，不能开启联网。',
        tools: '当前未验证工具调用，不能启用。',
        limitations: '企业事实仅以检索到的资料为准；资料不足时会明确说明。',
      },
      verification: configured && verifiedIds.has(entry.providerModelId) ? 'configured' : 'unverified',
    };
  });
}

function verifiedDeepSeekModels(): ModelCatalogEntry[] {
  const configured = Boolean(process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_BASE_URL);
  // These are the only two DeepSeek IDs listed by the approved channel and
  // verified through text and SSE requests.  Selection always supplies the
  // exact providerModelId; no DEEPSEEK_MODEL environment fallback exists.
  const verifiedIds = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);
  const entries = [
    {
      id: 'deepseek-v4-flash', providerModelId: 'deepseek-v4-flash', displayName: 'DeepSeek V4 Flash',
      description: '快速高效的企业知识问答，适合高频资料查询、内容总结、制度检索和日常员工问答。',
      recommended: true, tier: 'fast' as const, estimatedCredits: 5, sortOrder: 1,
    },
    {
      id: 'deepseek-v4-pro', providerModelId: 'deepseek-v4-pro', displayName: 'DeepSeek V4 Pro',
      description: '面向复杂企业问题的进阶分析，适合多资料比较、经营问题拆解和结构化方案。',
      recommended: false, tier: 'advanced' as const, estimatedCredits: 12, sortOrder: 2,
    },
  ];

  return entries.map((entry): ModelCatalogEntry => ({
    ...entry,
    provider: 'deepseek',
    iconKey: 'deepseek',
    providerModelId: configured && verifiedIds.has(entry.providerModelId) ? entry.providerModelId : null,
    enabled: configured && verifiedIds.has(entry.providerModelId),
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
      reasoning: entry.id.endsWith('pro') ? '适合跨资料比较、问题拆解和多步骤分析；企业事实仍以检索资料为准。' : '适合日常企业资料查询、内容总结与短流程梳理。',
      speed: entry.id.endsWith('pro') ? '侧重分析深度，响应通常较稳健。' : '侧重快速响应，适合高频员工问答。',
      chinese: entry.id.endsWith('pro') ? '适合中文经营分析、方案结构化与管理讨论。' : '适合中文制度检索、资料总结和日常工作问答。',
      longContext: entry.id.endsWith('pro') ? '适合在检索到的多段企业资料之间进行比较与归纳。' : '适合围绕当前检索到的企业资料快速作答。',
      vision: '当前通道未验证图片识别，不支持会话图片输入。',
      files: '支持企库库先解析 PDF、DOCX、XLSX、TXT、MD、CSV、JSON 后注入文本；不支持模型原生文件。',
      webSearch: '当前未配置真实联网搜索，不能开启联网。',
      tools: '当前未验证工具调用，不能启用。',
      bestFor: entry.id.endsWith('pro') ? '经营问题拆解、多资料对比、结构化方案和分析型 Skill。' : '制度检索、流程查询、内容总结和高频企业知识库问答。',
      limitations: '企业事实仅以检索到的资料为准；资料不足时会明确说明。',
    },
    verification: configured && verifiedIds.has(entry.providerModelId) ? 'configured' : 'unverified',
  }));
}

export function getServerModelCatalog(): ModelCatalogEntry[] {
  return [...verifiedDeepSeekModels(), ...gptReferenceEntries, ...verifiedGeminiModels(), ...referenceEntries].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getEnabledModels() {
  return getServerModelCatalog().filter((model) => model.enabled);
}

export function getEnabledModel(modelId: string | undefined | null) {
  if (!modelId) return null;
  return getEnabledModels().find((model) => model.id === modelId) || null;
}

export function toPublicModel(model: ModelCatalogEntry) {
  const { providerModelId, ...safe } = model;
  // providerModelId is safe to expose only for an enabled model; unavailable
  // entries deliberately have no fabricated upstream ID.
  return { ...safe, providerModelId: model.enabled ? providerModelId : null };
}
