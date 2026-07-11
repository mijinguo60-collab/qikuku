/** 图片模型调用 - 支持 OpenAI 兼容的文生图与图片编辑。 */
import { buildOpenAiCompatibleEndpoint, providerStatusMessage, redactProviderBody, responseShape } from './provider-utils';

const DEFAULT_SIZES = ['1024x1024', '1024x1792', '1792x1024'] as const;

export interface ImageGenerationOptions {
  prompt: string;
  model?: string;
  size?: string;
  n?: number;
  sourceImage?: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface ImageGenerationResponse {
  imageUrls: string[];
  revisedPrompt?: string;
}

export function buildImageEndpoint(baseUrl: string, kind: 'generations' | 'edits' = 'generations') {
  try {
    return buildOpenAiCompatibleEndpoint(baseUrl, `/images/${kind}`, '图片 API 地址未配置，请设置 IMAGE_BASE_URL');
  } catch (error: any) {
    if (error.message?.includes('地址格式无效')) throw new Error('图片 API 地址格式无效，请使用 http:// 或 https:// 地址');
    throw error;
  }
}

export function getImageConfig() {
  const apiKey = process.env.IMAGE_API_KEY || '';
  const baseUrl = process.env.IMAGE_BASE_URL || '';
  const model = process.env.IMAGE_MODEL || 'dall-e-3';
  const error = !baseUrl
    ? '图片 API 地址未配置，请设置 IMAGE_BASE_URL'
    : !apiKey
      ? '图片 API Key 未配置，请设置 IMAGE_API_KEY'
      : '';
  return { apiKeyExists: !!apiKey, baseUrlExists: !!baseUrl, model, isReady: !error, error, apiKey, baseUrl };
}

function collectImages(data: any): string[] {
  if (!Array.isArray(data?.data)) return [];
  return data.data.flatMap((item: any) => {
    if (typeof item?.url === 'string' && item.url) return [item.url];
    if (typeof item?.b64_json === 'string' && item.b64_json) return [`data:image/png;base64,${item.b64_json}`];
    return [];
  });
}

async function requestImage(options: ImageGenerationOptions, kind: 'generations' | 'edits'): Promise<ImageGenerationResponse> {
  const config = getImageConfig();
  const apiKey = options.apiKey || config.apiKey;
  const baseUrl = options.baseUrl || config.baseUrl;
  const model = options.model || config.model;
  if (!apiKey) throw new Error('图片 API Key 未配置，请设置 IMAGE_API_KEY');
  const url = buildImageEndpoint(baseUrl, kind);

  const body: Record<string, unknown> = {
    model,
    prompt: options.prompt,
    n: options.n || 1,
    size: options.size || process.env.IMAGE_DEFAULT_SIZE || '1024x1024',
    response_format: 'url',
  };
  if (kind === 'edits' && options.sourceImage) body.image = options.sourceImage;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const bodyText = await res.text();
    console.error('[IMAGE] Provider response error', { status: res.status, body: redactProviderBody(bodyText) });
    throw new Error(providerStatusMessage('图片', res.status));
  }

  const data = await res.json();
  const imageUrls = collectImages(data);
  if (imageUrls.length === 0) {
    console.error('[IMAGE] Empty provider image response', responseShape(data));
    throw new Error('图片接口返回空内容');
  }
  return { imageUrls, revisedPrompt: data.data?.[0]?.revised_prompt };
}

export async function generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResponse> {
  return requestImage(options, 'generations');
}

export async function editImage(options: ImageGenerationOptions): Promise<ImageGenerationResponse> {
  if (!options.sourceImage) throw new Error('图片编辑需要提供 sourceImage');
  return requestImage(options, 'edits');
}

export async function testImageConnection(apiKey: string, baseUrl: string, model: string): Promise<{ ok: boolean; msg: string }> {
  try {
    const url = buildImageEndpoint(baseUrl);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, prompt: 'test', n: 1, size: '1024x1024' }),
      signal: AbortSignal.timeout(30000),
    });
    if (res.ok) return { ok: true, msg: '连接成功 ✓ 模型可用' };
    const body = await res.text();
    console.error('[IMAGE] Connection test failed', { status: res.status, body: redactProviderBody(body) });
    return { ok: false, msg: providerStatusMessage('图片', res.status) };
  } catch (error: any) {
    if (error.name === 'TimeoutError' || error.message?.includes('timeout')) return { ok: false, msg: '网络请求超时，请检查 Base URL' };
    return { ok: false, msg: error.message || '图片模型连接失败' };
  }
}

export { DEFAULT_SIZES };
