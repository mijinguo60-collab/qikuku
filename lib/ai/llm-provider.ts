/** Unified LLM provider with configuration checks shared by chat and Skill chat. */
import { chatCompletion, chatCompletionStream, ChatCompletionOptions, ChatCompletionResponse, testLanguageConnection } from './language-provider';
import type { ModelProvider } from './model-catalog';

export interface LlmResult {
  answer: string;
  model: string;
  modelStatus: 'live' | 'error';
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  latencyMs: number;
  error?: string;
}

export type RuntimeLlmProvider = Extract<ModelProvider, 'deepseek' | 'openai' | 'google' | 'anthropic' | 'glm'>;

export type LlmRequestOptions = ChatCompletionOptions & {
  /**
   * Runtime provider is selected by the server-owned model catalogue, never
   * from a client supplied provider name.
   */
  provider?: RuntimeLlmProvider;
};

const providerEnvironment: Record<RuntimeLlmProvider, {
  key: 'DEEPSEEK_API_KEY' | 'OPENAI_API_KEY' | 'GEMINI_API_KEY' | 'CLAUDE_API_KEY' | 'GLM_API_KEY';
  baseUrl: 'DEEPSEEK_BASE_URL' | 'OPENAI_BASE_URL' | 'GEMINI_BASE_URL' | 'CLAUDE_BASE_URL' | 'GLM_BASE_URL';
  label: string;
}> = {
  deepseek: {
    key: 'DEEPSEEK_API_KEY', baseUrl: 'DEEPSEEK_BASE_URL', label: 'DeepSeek',
  },
  // GPT stays disabled until the operator supplies an OpenAI-compatible
  // endpoint and the exact upstream model IDs pass the live verification.
  openai: {
    key: 'OPENAI_API_KEY', baseUrl: 'OPENAI_BASE_URL', label: 'OpenAI',
  },
  // Gemini requests use the same generic OpenAI-compatible adapter only after
  // the configured channel proves that it supports the protocol. Model choice
  // is always supplied by the server-owned catalogue, never GEMINI_MODEL.
  google: {
    key: 'GEMINI_API_KEY', baseUrl: 'GEMINI_BASE_URL', label: 'Gemini',
  },
  // Claude stays unavailable until this channel proves OpenAI-compatible
  // request/response semantics. The exact selected model is always supplied
  // by the server catalogue; CLAUDE_MODEL is intentionally unsupported.
  anthropic: {
    key: 'CLAUDE_API_KEY', baseUrl: 'CLAUDE_BASE_URL', label: 'Claude',
  },
  // GLM uses the verified OpenAI-compatible route. Model selection always
  // comes from the catalogue; GLM_MODEL is intentionally not supported as a
  // global fallback.
  glm: {
    key: 'GLM_API_KEY', baseUrl: 'GLM_BASE_URL', label: 'GLM',
  },
};

export function isRuntimeLlmProvider(provider: ModelProvider): provider is RuntimeLlmProvider {
  return provider === 'deepseek' || provider === 'openai' || provider === 'google' || provider === 'anthropic' || provider === 'glm';
}

export function getLlmConfig(provider: RuntimeLlmProvider = 'deepseek') {
  const environment = providerEnvironment[provider];
  const apiKey = process.env[environment.key] || '';
  const baseUrl = process.env[environment.baseUrl] || '';
  // Provider credentials are shared, but each request must choose a verified
  // model from the server-owned catalogue.  Never fall back to a global model.
  const model = '';
  const error = !baseUrl
    ? `${environment.label} API 地址未配置，请设置 ${environment.baseUrl}`
    : !apiKey
      ? `${environment.label} API Key 未配置，请设置 ${environment.key}`
      : '';
  return { provider, label: environment.label, apiKeyExists: !!apiKey, baseUrlExists: !!baseUrl, model, isReady: !error, error, apiKey, baseUrl };
}

function configuredOptions(options: LlmRequestOptions): ChatCompletionOptions {
  const config = getLlmConfig(options.provider || 'deepseek');
  if (!config.isReady) throw new Error(config.error);
  const model = options.model || config.model;
  if (!model) throw new Error(`${config.label} 模型 ID 未配置，请先完成上游模型列表验证`);
  return { ...options, apiKey: config.apiKey, baseUrl: config.baseUrl, model };
}

export async function llmChatCompletion(options: LlmRequestOptions): Promise<LlmResult> {
  const start = Date.now();
  const config = getLlmConfig(options.provider || 'deepseek');
  const selectedModel = options.model || config.model;
  if (!config.isReady) return { answer: '', model: selectedModel, modelStatus: 'error', latencyMs: 0, error: config.error };
  try {
    const result = await chatCompletion(configuredOptions(options));
    return { answer: result.answer, model: selectedModel, modelStatus: 'live', usage: result.usage, latencyMs: Date.now() - start };
  } catch (error: any) {
    return { answer: '', model: selectedModel, modelStatus: 'error', latencyMs: Date.now() - start, error: error.message || '模型接口调用失败' };
  }
}

export async function* llmChatCompletionStream(options: LlmRequestOptions): AsyncGenerator<string, ChatCompletionResponse, unknown> {
  const stream = chatCompletionStream(configuredOptions(options));
  // Preserve the upstream generator return value: it carries final usage data
  // when an OpenAI-compatible provider includes it in the terminal event.
  while (true) {
    const next = await stream.next();
    if (next.done) return next.value;
    yield next.value;
  }
}

export { chatCompletion, chatCompletionStream, testLanguageConnection };
export type { ChatCompletionOptions };
