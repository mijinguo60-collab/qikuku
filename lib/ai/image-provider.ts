/** 图片模型调用 - 支持 OpenAI 兼容的文生图与图片编辑。 */
import { buildOpenAiCompatibleEndpoint, extractProviderErrorMessage, providerStatusMessage, redactProviderBody, responseShape } from './provider-utils';

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

export function getImageCapabilities() {
  return {
    textToImage: true,
    imageToImage: getImageEditConfig().isReady,
  };
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

export function getImageEditConfig() {
  const enabled = process.env.IMAGE_EDIT_ENABLED === 'true';
  const apiKey = process.env.IMAGE_EDIT_API_KEY || '';
  const baseUrl = process.env.IMAGE_EDIT_BASE_URL || '';
  const model = process.env.IMAGE_EDIT_MODEL || '';
  const isReady = enabled && !!apiKey && !!baseUrl && !!model;
  return { enabled, apiKeyExists: !!apiKey, baseUrlExists: !!baseUrl, modelExists: !!model, model, isReady, error: isReady ? '' : '图生图通道未配置，请联系管理员', apiKey, baseUrl };
}

function collectImages(data: any): string[] {
  if (!Array.isArray(data?.data)) return [];
  return data.data.flatMap((item: any) => {
    if (typeof item?.url === 'string' && item.url) return [item.url];
    if (typeof item?.b64_json === 'string' && item.b64_json) return [`data:image/png;base64,${item.b64_json}`];
    return [];
  });
}

function dataUrlToBlob(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('参考图格式无效');
  const bytes = Buffer.from(match[2], 'base64');
  return new Blob([bytes], { type: match[1] });
}

async function requestImage(options: ImageGenerationOptions, kind: 'generations' | 'edits'): Promise<ImageGenerationResponse> {
  const editConfig = kind === 'edits' ? getImageEditConfig() : null;
  const textConfig = kind === 'generations' ? getImageConfig() : null;
  if (editConfig && !editConfig.isReady) throw new Error(editConfig.error);
  const apiKey = options.apiKey || (editConfig ? editConfig.apiKey : textConfig?.apiKey) || '';
  const baseUrl = options.baseUrl || (editConfig ? editConfig.baseUrl : textConfig?.baseUrl) || '';
  const model = options.model || (editConfig ? editConfig.model : textConfig?.model) || '';
  if (!apiKey || !baseUrl || !model) throw new Error(kind === 'edits' ? '图生图通道未配置，请联系管理员' : '图片 API 配置不完整，请联系管理员');
  const url = buildImageEndpoint(baseUrl, kind);

  let requestBody: BodyInit;
  let headers: HeadersInit = { Authorization: `Bearer ${apiKey}` };
  if (kind === 'edits') {
    if (!options.sourceImage) throw new Error('参考图不能为空');
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', options.prompt);
    form.append('image', dataUrlToBlob(options.sourceImage), 'reference-image.png');
    if (options.n) form.append('n', String(options.n));
    if (options.size) form.append('size', options.size);
    form.append('response_format', 'url');
    requestBody = form;
  } else {
    headers = { ...headers, 'Content-Type': 'application/json' };
    requestBody = JSON.stringify({ model, prompt: options.prompt, n: options.n || 1, size: options.size || process.env.IMAGE_DEFAULT_SIZE || '1024x1024', response_format: 'url' });
  }

  const res = await fetch(url, { method: 'POST', headers, body: requestBody });

  if (!res.ok) {
    const bodyText = await res.text();
    const providerMessage = extractProviderErrorMessage(bodyText);
    console.error('[IMAGE] Provider response error', {
      status: res.status,
      requestUrl: url,
      model,
      responseBody: redactProviderBody(bodyText, 1000),
      providerMessage: providerMessage ? redactProviderBody(providerMessage, 300) : null,
    });
    const providerLabel = kind === 'edits' ? '图生图' : '图片';
    if (res.status === 429) {
      throw new Error(`${providerLabel}接口被上游拒绝：429。可能原因：额度不足 / 模型无权限 / 频率限制 / 模型名不支持。请查看 Vercel Logs 或上游平台调用记录。`);
    }
    throw new Error(providerStatusMessage(providerLabel, res.status));
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
  if (options.sourceImage) {
    return requestImage(options, 'edits');
  }
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
    console.error('[IMAGE] Connection test failed', { status: res.status, requestUrl: url, model, responseBody: redactProviderBody(body, 1000) });
    return { ok: false, msg: providerStatusMessage('图片', res.status) };
  } catch (error: any) {
    if (error.name === 'TimeoutError' || error.message?.includes('timeout')) return { ok: false, msg: '网络请求超时，请检查 Base URL' };
    return { ok: false, msg: error.message || '图片模型连接失败' };
  }
}

export { DEFAULT_SIZES };
