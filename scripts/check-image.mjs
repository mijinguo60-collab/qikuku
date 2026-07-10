import 'dotenv/config';

const K = !!process.env.IMAGE_API_KEY;
const U = !!process.env.IMAGE_BASE_URL;
const M = process.env.IMAGE_MODEL || 'gpt-image-2';
const B = !!process.env.BLOB_READ_WRITE_TOKEN;
const isProd = process.env.NODE_ENV === 'production';

console.log('IMAGE_API_KEY exists:', K);
console.log('IMAGE_BASE_URL exists:', U);
console.log('IMAGE_MODEL:', M);
console.log('BLOB_READ_WRITE_TOKEN exists:', B);
console.log('image provider ready:', K && U);
console.log('storage adapter ready:', !isProd || B);
console.log('image persistence ready:', K && U && (!isProd || B));
console.log('production blockers:', isProd ? [
  !(K && U) && 'Image API',
  !B && 'Blob Storage (图片持久化需要)',
].filter(Boolean).join(', ') || 'none' : 'none (development mode)');
