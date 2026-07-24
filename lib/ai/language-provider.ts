/**
 * 语言模型调用 - 支持 OpenAI 兼容格式。
 * API Key 仅服务端调用，前端不暴露。
 */
import { buildOpenAiCompatibleEndpoint, providerStatusMessage, redactProviderBody, responseShape } from './provider-utils';

const MODEL_REQUEST_TIMEOUT_MS = 60_000;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  model?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  apiKey?: string;
  baseUrl?: string;
}

export interface ChatCompletionResponse {
  answer: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

function contentToText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const part = item as Record<string, unknown>;
        return contentToText(part.text || part.content || part.value);
      }
      return '';
    }).join('');
  }
  if (value && typeof value === 'object') {
    const part = value as Record<string, unknown>;
    return contentToText(part.text || part.content || part.value);
  }
  return '';
}

export function extractModelContent(data: unknown): string {
  const result = data as Record<string, any>;
  const choice = Array.isArray(result?.choices) ? result.choices[0] : null;
  // reasoning_content is internal model thinking — never treat it as the final answer.
  return contentToText(choice?.delta?.content)
    || contentToText(choice?.message?.content)
    || contentToText(choice?.text)
    || contentToText(result?.output_text)
    || contentToText(result?.content)
    || contentToText(result?.output);
}

function getOptions(options: ChatCompletionOptions) {
  const model = options.model || '';
  const apiKey = options.apiKey || '';
  const baseUrl = options.baseUrl || '';
  if (!model) throw new Error('模型 ID 未配置，请从可用模型目录中选择模型');
  if (!apiKey) throw new Error('模型 API Key 未配置');
  const url = buildOpenAiCompatibleEndpoint(baseUrl, '/chat/completions', '模型 API 地址未配置');
  return { model, apiKey, url };
}

function usageFrom(data: any) {
  return data?.usage ? {
    promptTokens: data.usage.prompt_tokens || 0,
    completionTokens: data.usage.completion_tokens || 0,
    totalTokens: data.usage.total_tokens || 0,
  } : undefined;
}

export async function* chatCompletionStream(options: ChatCompletionOptions): AsyncGenerator<string, ChatCompletionResponse, unknown> {
  const { model, apiKey, url } = getOptions(options);
  const streamAbort = AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: options.messages,
        max_tokens: options.maxTokens || 2048,
        temperature: options.temperature ?? 0.7,
        stream: true,
      }),
      signal: streamAbort,
    });
  } catch (error: any) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Error('模型流式响应超时，请稍后重试');
    throw error;
  }

  if (!res.ok) {
    const body = await res.text();
    console.error('[LLM] Provider response error', { status: res.status, body: redactProviderBody(body) });
    throw new Error(providerStatusMessage('模型', res.status));
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('模型接口未返回可读取的流式内容');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let lastShape: Record<string, unknown> = {};

  while (true) {
    let next: ReadableStreamReadResult<Uint8Array>;
    try {
      next = await reader.read();
    } catch (error: any) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Error('模型流式响应超时，请稍后重试');
      throw error;
    }
    const { done, value } = next;
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload);
        lastShape = responseShape(parsed);
        const chunk = extractModelContent(parsed);
        if (chunk) {
          fullContent += chunk;
          yield chunk;
        }
        if (parsed.usage) usage = usageFrom(parsed) || usage;
      } catch {
        console.error('[LLM] Unable to parse stream event', { payload: redactProviderBody(payload) });
      }
    }
  }

  if (!fullContent.trim()) {
    const firstChoiceKeys = (lastShape as Record<string, unknown>).firstChoiceKeys;
    const hasChoices = Array.isArray(firstChoiceKeys) && firstChoiceKeys.length > 0;
    console.error('[LLM] Empty streamed model content', { shape: lastShape });
    if (hasChoices) {
      throw new Error('模型未能生成最终回答，请尝试重新提问');
    }
    throw new Error('模型接口返回空内容');
  }
  return { answer: fullContent, usage };
}

export async function chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
  const { model, apiKey, url } = getOptions(options);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: options.messages,
        max_tokens: options.maxTokens || 2048,
        temperature: options.temperature ?? 0.7,
        stream: false,
      }),
      signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS),
    });
  } catch (error: any) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Error('模型响应超时，请稍后重试');
    throw error;
  }

  if (!res.ok) {
    const body = await res.text();
    console.error('[LLM] Provider response error', { status: res.status, body: redactProviderBody(body) });
    throw new Error(providerStatusMessage('模型', res.status));
  }

  const data = await res.json();
  const answer = extractModelContent(data);
  if (!answer.trim()) {
    const shape = responseShape(data);
    const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
    const hasReasoningOnly = choice?.message && typeof choice.message === 'object'
      && 'reasoning_content' in choice.message
      && !(choice.message.content);
    if (hasReasoningOnly) {
      console.error('[LLM] Model returned reasoning-only response — no final content', {
        firstChoiceKeys: shape.firstChoiceKeys,
      });
      throw new Error('模型未能生成最终回答，请尝试重新提问');
    }
    console.error('[LLM] Empty model content', { shape });
    throw new Error('模型接口返回空内容');
  }
  return { answer, usage: usageFrom(data) };
}

export async function testLanguageConnection(apiKey: string, baseUrl: string, model: string): Promise<{ ok: boolean; msg: string }> {
  try {
    const url = buildOpenAiCompatibleEndpoint(baseUrl, '/chat/completions', '模型 API 地址未配置');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5, stream: false }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) return { ok: true, msg: '连接成功 ✓ 模型可用' };
    const body = await res.text();
    console.error('[LLM] Connection test failed', { status: res.status, body: redactProviderBody(body) });
    return { ok: false, msg: providerStatusMessage('模型', res.status) };
  } catch (error: any) {
    if (error.name === 'TimeoutError' || error.message?.includes('timeout')) return { ok: false, msg: '网络请求超时，请检查 Base URL' };
    return { ok: false, msg: error.message || '模型连接失败' };
  }
}
