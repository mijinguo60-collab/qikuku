import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const L = !!process.env.DEEPSEEK_API_KEY;
const LU = !!process.env.DEEPSEEK_BASE_URL;
const G = !!process.env.GEMINI_API_KEY;
const GU = !!process.env.GEMINI_BASE_URL;
const C = !!process.env.CLAUDE_API_KEY;
const CU = !!process.env.CLAUDE_BASE_URL;
const Z = !!process.env.GLM_API_KEY;
const ZU = !!process.env.GLM_BASE_URL;
const E = !!process.env.EMBEDDING_API_KEY;
const B = !!process.env.BLOB_READ_WRITE_TOKEN;
const isProd = process.env.NODE_ENV === 'production';

console.log('DEEPSEEK_API_KEY exists:', L);
console.log('DEEPSEEK_BASE_URL exists:', LU);
console.log('DeepSeek model selection: server-owned catalog');
console.log('GEMINI_API_KEY exists:', G);
console.log('GEMINI_BASE_URL exists:', GU);
console.log('Gemini model selection: server-owned catalog with verified model IDs');
console.log('CLAUDE_API_KEY exists:', C);
console.log('CLAUDE_BASE_URL exists:', CU);
console.log('Claude model selection: server-owned catalog with verified model IDs');
console.log('GLM_API_KEY exists:', Z);
console.log('GLM_BASE_URL exists:', ZU);
console.log('GLM model selection: server-owned catalog with verified model ID');
console.log('EMBEDDING_API_KEY exists:', E);
console.log('BLOB_READ_WRITE_TOKEN exists:', B);
console.log('llm ready:', L && LU);
console.log('embedding ready:', E);
console.log('storage ready:', !isProd || B);
console.log('production blockers:', isProd ? [
  !(L && LU) && 'LLM API',
  !E && 'Embedding',
  !B && 'Blob Storage',
].filter(Boolean).join(', ') || 'none' : 'none (development mode)');
