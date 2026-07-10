/**
 * 图片模型调用 - 文生图 / 图片编辑
 * API Key 仅服务端调用，前端不暴露
 */

const DEFAULT_SIZES = ['1024x1024', '1024x1792', '1792x1024'] as const;

export interface ImageGenerationOptions {
  prompt: string;
  model?: string;
  size?: string;
  n?: number;
  sourceImage?: string; // Base64 or URL for image editing
  apiKey?: string;
  baseUrl?: string;
}

export interface ImageGenerationResponse {
  imageUrls: string[];
  revisedPrompt?: string;
}

export async function generateImage(
  options: ImageGenerationOptions
): Promise<ImageGenerationResponse> {
  const {
    prompt,
    model = process.env.IMAGE_MODEL || 'dall-e-3',
    size = process.env.IMAGE_DEFAULT_SIZE || '1024x1024',
    n = 1,
    sourceImage,
    apiKey = process.env.IMAGE_API_KEY || '',
    baseUrl = process.env.IMAGE_BASE_URL || '',
  } = options;

  const url = `${baseUrl}/v1/images/generations`;

  const body: any = {
    model,
    prompt,
    n,
    size,
    response_format: 'url',
  };

  if (sourceImage) {
    body.image = sourceImage;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const errMsg = (errorData as any)?.error?.message || res.statusText;

    if (errMsg.includes('size') || errMsg.includes('dimension')) {
      throw new Error(`尺寸不支持: ${errMsg}。请更换尺寸后重试。`);
    }
    throw new Error(`图片生成失败 (${res.status}): ${errMsg}`);
  }

  const data = await res.json();

  const imageUrls: string[] = [];
  if (data.data && Array.isArray(data.data)) {
    for (const item of data.data) {
      if (item.url) imageUrls.push(item.url);
      else if (item.b64_json) imageUrls.push(`data:image/png;base64,${item.b64_json}`);
    }
  }

  return {
    imageUrls,
    revisedPrompt: data.data?.[0]?.revised_prompt,
  };
}

export async function editImage(
  options: ImageGenerationOptions
): Promise<ImageGenerationResponse> {
  if (!options.sourceImage) {
    throw new Error('图片编辑需要提供 sourceImage');
  }

  const {
    prompt,
    model = process.env.IMAGE_MODEL || 'dall-e-3',
    size = process.env.IMAGE_DEFAULT_SIZE || '1024x1024',
    n = 1,
    sourceImage,
    apiKey = process.env.IMAGE_API_KEY || '',
    baseUrl = process.env.IMAGE_BASE_URL || '',
  } = options;

  const url = `${baseUrl}/v1/images/edits`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      n,
      size,
      image: sourceImage,
      response_format: 'url',
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const errMsg = (errorData as any)?.error?.message || res.statusText;

    if (errMsg.includes('size') || errMsg.includes('dimension')) {
      throw new Error(`尺寸不支持: ${errMsg}。请更换尺寸后重试。`);
    }
    throw new Error(`图片编辑失败 (${res.status}): ${errMsg}`);
  }

  const data = await res.json();

  const imageUrls: string[] = [];
  if (data.data && Array.isArray(data.data)) {
    for (const item of data.data) {
      if (item.url) imageUrls.push(item.url);
      else if (item.b64_json) imageUrls.push(`data:image/png;base64,${item.b64_json}`);
    }
  }

  return {
    imageUrls,
    revisedPrompt: data.data?.[0]?.revised_prompt,
  };
}

/**
 * 测试图片模型连接
 */
export async function testImageConnection(
  apiKey: string,
  baseUrl: string,
  model: string
): Promise<{ ok: boolean; msg: string }> {
  try {
    const url = `${baseUrl}/v1/images/generations`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt: 'test',
        n: 1,
        size: '1024x1024',
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (res.ok) {
      return { ok: true, msg: '连接成功 ✓ 模型可用' };
    }

    const errorData = await res.json().catch(() => ({}));
    const errMsg = (errorData as any)?.error?.message || res.statusText;

    if (res.status === 401 || errMsg.includes('apikey') || errMsg.includes('API key') || errMsg.includes('token')) {
      return { ok: false, msg: 'API Key 错误' };
    }
    if (res.status === 404 || errMsg.includes('model') || errMsg.includes('not found')) {
      return { ok: false, msg: '模型名称错误' };
    }
    if (errMsg.includes('渠道') || errMsg.includes('channel') || errMsg.includes('distributor')) {
      return { ok: false, msg: '模型渠道未配置或无可用渠道' };
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

export { DEFAULT_SIZES };
