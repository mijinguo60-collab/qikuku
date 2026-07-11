export function buildOpenAiCompatibleEndpoint(baseUrl: string, path: string, missingMessage: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!normalized) throw new Error(missingMessage);

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('模型 API 地址格式无效，请使用 http:// 或 https:// 地址');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('模型 API 地址格式无效，请使用 http:// 或 https:// 地址');
  }

  const hasV1Suffix = parsed.pathname.replace(/\/+$/, '').endsWith('/v1');
  return `${normalized}${hasV1Suffix ? '' : '/v1'}${path}`;
}

export function redactProviderBody(body: string): string {
  return body
    .slice(0, 500)
    .replace(/(authorization|api[_-]?key|token|password)\s*([:=]|\")\s*[^\s,}\"]+/gi, '$1$2***')
    .replace(/\b(sk|pk)-[a-zA-Z0-9_-]{8,}\b/g, '$1-***');
}

export function responseShape(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return { type: typeof value };
  const data = value as Record<string, unknown>;
  const firstChoice = Array.isArray(data.choices) ? data.choices[0] : undefined;
  return {
    topLevelKeys: Object.keys(data).slice(0, 20),
    firstChoiceKeys: firstChoice && typeof firstChoice === 'object' ? Object.keys(firstChoice as Record<string, unknown>).slice(0, 20) : [],
  };
}

export function providerStatusMessage(label: string, status: number): string {
  if (status === 401) return `${label}接口返回 401，请检查 API Key`;
  if (status === 403) return `${label}接口返回 403，请检查账号权限或模型权限`;
  if (status === 404) return `${label}接口返回 404，请检查 API 地址或模型名称`;
  if (status === 429) return `${label}接口返回 429，请稍后重试`;
  if (status >= 500) return `${label}接口返回 ${status}，服务暂时不可用`;
  return `${label}接口返回 ${status}`;
}
