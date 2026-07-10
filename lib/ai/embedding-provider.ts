/**
 * Embedding 模型调用 - 向量检索
 * API Key 仅服务端调用，前端不暴露
 */

export interface EmbeddingOptions {
  input: string | string[];
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface EmbeddingResponse {
  embeddings: number[][];
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
}

export async function createEmbedding(
  options: EmbeddingOptions
): Promise<EmbeddingResponse> {
  const {
    input,
    model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    apiKey = process.env.EMBEDDING_API_KEY || '',
    baseUrl = process.env.EMBEDDING_BASE_URL || '',
  } = options;

  const url = `${baseUrl}/embeddings`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Embedding API Error ${res.status}: ${errorText}`);
  }

  const data = await res.json();

  return {
    embeddings: data.data?.map((item: any) => item.embedding) || [],
    usage: data.usage ? {
      promptTokens: data.usage.prompt_tokens || 0,
      totalTokens: data.usage.total_tokens || 0,
    } : undefined,
  };
}

/**
 * 测试 Embedding 模型连接
 */
export async function testEmbeddingConnection(
  apiKey: string,
  baseUrl: string,
  model: string
): Promise<{ ok: boolean; msg: string }> {
  try {
    const url = `${baseUrl}/embeddings`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: 'test',
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
