/** Unified LLM provider with configuration checks shared by chat and Skill chat. */
import { chatCompletion, chatCompletionStream, ChatCompletionOptions, testLanguageConnection } from './language-provider';

export interface LlmResult {
  answer: string;
  model: string;
  modelStatus: 'live' | 'error';
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  latencyMs: number;
  error?: string;
}

export function getLlmConfig() {
  const apiKey = process.env.DEEPSEEK_API_KEY || '';
  const baseUrl = process.env.DEEPSEEK_BASE_URL || '';
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const error = !baseUrl
    ? '模型 API 地址未配置，请设置 DEEPSEEK_BASE_URL'
    : !apiKey
      ? '模型 API Key 未配置，请设置 DEEPSEEK_API_KEY'
      : '';
  return { apiKeyExists: !!apiKey, baseUrlExists: !!baseUrl, model, isReady: !error, error, apiKey, baseUrl };
}

function configuredOptions(options: ChatCompletionOptions): ChatCompletionOptions {
  const config = getLlmConfig();
  if (!config.isReady) throw new Error(config.error);
  return { ...options, apiKey: config.apiKey, baseUrl: config.baseUrl, model: options.model || config.model };
}

export async function llmChatCompletion(options: ChatCompletionOptions): Promise<LlmResult> {
  const start = Date.now();
  const config = getLlmConfig();
  if (!config.isReady) return { answer: '', model: config.model, modelStatus: 'error', latencyMs: 0, error: config.error };
  try {
    const result = await chatCompletion(configuredOptions(options));
    return { answer: result.answer, model: config.model, modelStatus: 'live', usage: result.usage, latencyMs: Date.now() - start };
  } catch (error: any) {
    return { answer: '', model: config.model, modelStatus: 'error', latencyMs: Date.now() - start, error: error.message || '模型接口调用失败' };
  }
}

export async function* llmChatCompletionStream(options: ChatCompletionOptions) {
  const stream = chatCompletionStream(configuredOptions(options));
  for await (const chunk of stream) yield chunk;
}

export { chatCompletion, chatCompletionStream, testLanguageConnection };
export type { ChatCompletionOptions };
