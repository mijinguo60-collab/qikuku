/**
 * 语言模型调用 - 支持 DeepSeek / OpenAI 兼容格式
 * API Key 仅服务端调用，前端不暴露
 */

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

export async function* chatCompletionStream(
  options: ChatCompletionOptions
): AsyncGenerator<string, ChatCompletionResponse, unknown> {
  const {
    model = process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    messages,
    maxTokens = 2048,
    temperature = 0.7,
    apiKey = process.env.DEEPSEEK_API_KEY || '',
    baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  } = options;

  const url = `${baseUrl}/v1/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: true,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API Error ${res.status}: ${errorText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      if (!data) continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;

        if (delta?.content) {
          fullContent += delta.content;
          yield delta.content;
        }

        if (parsed.usage) {
          usage = {
            promptTokens: parsed.usage.prompt_tokens || 0,
            completionTokens: parsed.usage.completion_tokens || 0,
            totalTokens: parsed.usage.total_tokens || 0,
          };
        }
      } catch {
        // Skip malformed JSON lines
      }
    }
  }

  return { answer: fullContent, usage };
}

export async function chatCompletion(
  options: ChatCompletionOptions
): Promise<ChatCompletionResponse> {
  const {
    model = process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    messages,
    maxTokens = 2048,
    temperature = 0.7,
    apiKey = process.env.DEEPSEEK_API_KEY || '',
    baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  } = options;

  const url = `${baseUrl}/v1/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API Error ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  const answer = data.choices?.[0]?.message?.content || '';

  return {
    answer,
    usage: data.usage ? {
      promptTokens: data.usage.prompt_tokens || 0,
      completionTokens: data.usage.completion_tokens || 0,
      totalTokens: data.usage.total_tokens || 0,
    } : undefined,
  };
}

/**
 * 测试语言模型连接
 */
export async function testLanguageConnection(
  apiKey: string,
  baseUrl: string,
  model: string
): Promise<{ ok: boolean; msg: string }> {
  try {
    const url = `${baseUrl}/v1/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
        stream: false,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      return { ok: true, msg: '连接成功 ✓ 模型可用' };
    }

    const errorData = await res.json().catch(() => ({}));
    const errMsg = (errorData as any)?.error?.message || res.statusText;

    if (res.status === 401 || errMsg.includes('apikey') || errMsg.includes('API key')) {
      return { ok: false, msg: 'API Key 错误' };
    }
    if (res.status === 404 || errMsg.includes('model') || errMsg.includes('not found')) {
      return { ok: false, msg: '模型名称错误' };
    }
    return { ok: false, msg: `API 错误 (${res.status}): ${errMsg}` };
  } catch (e: any) {
    if (e.name === 'TimeoutError' || e.message?.includes('timeout')) {
      return { ok: false, msg: '网络请求超时，请检查 Base URL' };
    }
    if (e.message?.includes('fetch') || e.message?.includes('ENOTFOUND')) {
      return { ok: false, msg: '网络请求失败，Base URL 可能错误' };
    }
    return { ok: false, msg: `连接失败: ${e.message}` };
  }
}
