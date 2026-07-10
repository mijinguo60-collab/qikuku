import 'dotenv/config';

const L = !!process.env.DEEPSEEK_API_KEY;
const LU = !!process.env.DEEPSEEK_BASE_URL;
const LM = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const E = !!process.env.EMBEDDING_API_KEY;
const B = !!process.env.BLOB_READ_WRITE_TOKEN;
const isProd = process.env.NODE_ENV === 'production';

console.log('DEEPSEEK_API_KEY exists:', L);
console.log('DEEPSEEK_BASE_URL exists:', LU);
console.log('DEEPSEEK_MODEL:', LM);
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
