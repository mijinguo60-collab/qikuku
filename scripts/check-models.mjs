import 'dotenv/config';

function validHttpUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function buildEndpoint(baseUrl, path) {
  const normalized = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!validHttpUrl(normalized)) return null;
  const url = new URL(normalized);
  return `${normalized}${url.pathname.replace(/\/+$/, '').endsWith('/v1') ? '' : '/v1'}${path}`;
}

const checks = [
  ['DEEPSEEK_API_KEY exists', Boolean(process.env.DEEPSEEK_API_KEY)],
  ['DEEPSEEK_BASE_URL exists', Boolean(process.env.DEEPSEEK_BASE_URL)],
  ['DEEPSEEK_BASE_URL valid', validHttpUrl(process.env.DEEPSEEK_BASE_URL)],
  ['DEEPSEEK_MODEL exists', Boolean(process.env.DEEPSEEK_MODEL)],
  ['EMBEDDING_API_KEY exists', Boolean(process.env.EMBEDDING_API_KEY)],
  ['EMBEDDING_BASE_URL exists', Boolean(process.env.EMBEDDING_BASE_URL)],
  ['EMBEDDING_BASE_URL valid', validHttpUrl(process.env.EMBEDDING_BASE_URL)],
  ['EMBEDDING_MODEL exists', Boolean(process.env.EMBEDDING_MODEL)],
  ['IMAGE_API_KEY exists', Boolean(process.env.IMAGE_API_KEY)],
  ['IMAGE_BASE_URL exists', Boolean(process.env.IMAGE_BASE_URL)],
  ['IMAGE_BASE_URL valid', validHttpUrl(process.env.IMAGE_BASE_URL)],
  ['IMAGE_MODEL exists', Boolean(process.env.IMAGE_MODEL)],
  ['chat endpoint valid', Boolean(buildEndpoint(process.env.DEEPSEEK_BASE_URL, '/chat/completions'))],
  ['embedding endpoint valid', Boolean(buildEndpoint(process.env.EMBEDDING_BASE_URL, '/embeddings'))],
  ['image endpoint valid', Boolean(buildEndpoint(process.env.IMAGE_BASE_URL, '/images/generations'))],
];

let failed = false;
for (const [name, passed] of checks) {
  console.log(`${passed ? '✓' : '✗'} ${name}`);
  if (!passed) failed = true;
}

const hasBlobToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
if (hasBlobToken) {
  console.log('✓ BLOB_READ_WRITE_TOKEN exists');
} else {
  console.log('! BLOB_READ_WRITE_TOKEN missing — 开发环境可使用本地存储；生产环境图片持久化需要配置。');
}

if (failed) {
  console.log('\ncheck:models: FAIL — 请补齐或修正上方模型配置。');
  process.exitCode = 1;
} else {
  console.log('\ncheck:models: PASS');
}
