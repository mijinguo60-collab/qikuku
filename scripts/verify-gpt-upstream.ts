import 'dotenv/config';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', override: true, quiet: true });

const GPT_MODEL_IDS = [
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.5',
  'gpt-5.6-luna',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
] as const;

type Check = {
  http: number;
  ok: boolean;
  usage?: boolean;
  grounded?: boolean;
  framework?: boolean;
  recognized?: boolean;
  errorCode?: string | null;
};

function getConfig() {
  const rawBaseUrl = (process.env.OPENAI_BASE_URL || '').trim().replace(/\/+$/, '');
  const apiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (!rawBaseUrl || !apiKey) throw new Error('OPENAI_BASE_URL 或 OPENAI_API_KEY 未配置');
  return {
    baseUrl: rawBaseUrl.endsWith('/v1') ? rawBaseUrl : `${rawBaseUrl}/v1`,
    apiKey,
  };
}

async function timedFetch(input: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function completion(model: string, messages: unknown[], expected?: RegExp, skill?: RegExp): Promise<Check> {
  const { baseUrl, apiKey } = getConfig();
  const response = await timedFetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, max_tokens: 80, temperature: 0 }),
  });
  const body = await response.json().catch(() => ({}));
  const content = body?.choices?.[0]?.message?.content;
  const hasText = typeof content === 'string' && content.trim().length > 0;
  return {
    http: response.status,
    ok: response.ok && hasText,
    usage: Boolean(body?.usage),
    grounded: expected ? expected.test(content || '') : undefined,
    framework: skill ? skill.test(content || '') : undefined,
    recognized: expected ? expected.test(content || '') : undefined,
    errorCode: body?.error?.code || body?.error?.type || null,
  };
}

async function stream(model: string): Promise<Check> {
  const { baseUrl, apiKey } = getConfig();
  const response = await timedFetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: '只回复：流式验证成功' }],
      max_tokens: 32,
      temperature: 0,
      stream: true,
      stream_options: { include_usage: true },
    }),
  });
  const reader = response.body?.getReader();
  let chunkCount = 0;
  let hasUsage = false;
  if (reader) {
    const decoder = new TextDecoder();
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = decoder.decode(next.value, { stream: true });
      chunkCount += (chunk.match(/data:/g) || []).length;
      hasUsage ||= chunk.includes('usage');
    }
  }
  return { http: response.status, ok: response.ok && chunkCount > 0, usage: hasUsage };
}

async function verifyModel(model: string) {
  const redSquare = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>').toString('base64')}`;
  const text = await completion(model, [{ role: 'user', content: '只回复：文本验证成功' }]);
  const streaming = await stream(model);
  const rag = await completion(model, [
    { role: 'system', content: '企业知识库依据：审批流程为双人复核。只依据此资料回答；资料不足时说明当前企业知识库中未找到足够依据。' },
    { role: 'user', content: '审批流程是什么？' },
  ], /双人复核/);
  const skillRag = await completion(model, [
    { role: 'system', content: '企业知识库依据：审批流程为双人复核。Skill 方法论：用根因分析框架回答，但企业事实只使用知识库依据。' },
    { role: 'user', content: '用根因分析框架说明审批流程。' },
  ], /双人复核/, /(根因|分析|框架)/);
  const vision = await completion(model, [{
    role: 'user', content: [
      { type: 'text', text: '图片里的方块是什么颜色？只回复颜色。' },
      { type: 'image_url', image_url: { url: redSquare } },
    ],
  }], /(红|red)/i);
  return { text, streaming, rag, skillRag, vision };
}

async function main() {
  const { baseUrl, apiKey } = getConfig();
  const requestedModels = process.argv.slice(2);
  const modelsToVerify = requestedModels.length ? requestedModels : [...GPT_MODEL_IDS];
  if (modelsToVerify.some((model) => !GPT_MODEL_IDS.includes(model as typeof GPT_MODEL_IDS[number]))) {
    throw new Error('只允许验证目录中的六个 GPT 模型');
  }
  const modelsResponse = await timedFetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const modelsBody = await modelsResponse.json().catch(() => ({}));
  const listedIds = new Set<string>((Array.isArray(modelsBody?.data) ? modelsBody.data : []).map((entry: { id?: unknown }) => String(entry?.id || '')));
  const output: Record<string, unknown> = {
    modelsEndpoint: { http: modelsResponse.status, exactSixPresent: GPT_MODEL_IDS.every((id) => listedIds.has(id)) },
  };
  for (const model of modelsToVerify) output[model] = await verifyModel(model);
  console.log(JSON.stringify(output));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: String(error?.message || error) }));
  process.exitCode = 1;
});
