/**
 * Unified LLM Provider — wraps language-provider with logging, timing, mock fallback
 */
import { chatCompletion, chatCompletionStream, ChatCompletionOptions, testLanguageConnection } from './language-provider';

export interface LlmResult {
  answer: string;
  model: string;
  modelStatus: 'live' | 'mock' | 'error';
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  latencyMs: number;
  error?: string;
}

const KEY = process.env.DEEPSEEK_API_KEY || '';
const URL = process.env.DEEPSEEK_BASE_URL || '';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

export function getLlmConfig() {
  return {
    apiKeyExists: !!KEY,
    baseUrlExists: !!URL,
    model: MODEL,
    isReady: !!KEY && !!URL,
  };
}

export async function llmChatCompletion(opts: ChatCompletionOptions): Promise<LlmResult> {
  const start = Date.now();
  if (!getLlmConfig().isReady) {
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      return { answer: '', model: 'none', modelStatus: 'error', latencyMs: 0, error: '生产环境未配置语言模型 API' };
    }
    // Development mock
    return {
      answer: '⚠️ Mock 回复 — 未配置语言模型 API。生产环境下将无法生成正式回答。',
      model: 'mock',
      modelStatus: 'mock',
      latencyMs: Date.now() - start,
    };
  }

  try {
    const result = await chatCompletion({
      ...opts,
      apiKey: KEY,
      baseUrl: URL,
      model: MODEL,
    });
    return {
      answer: result.answer,
      model: MODEL,
      modelStatus: 'live',
      usage: result.usage,
      latencyMs: Date.now() - start,
    };
  } catch (e: any) {
    return {
      answer: '',
      model: MODEL,
      modelStatus: 'error',
      latencyMs: Date.now() - start,
      error: e.message || 'API 调用失败',
    };
  }
}

export { chatCompletion, chatCompletionStream, testLanguageConnection };
export type { ChatCompletionOptions };
