import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';
const hasToken = !!process.env.BLOB_READ_WRITE_TOKEN;

console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('storage provider:', hasToken ? 'vercel-blob' : 'local');
console.log('BLOB_READ_WRITE_TOKEN exists:', hasToken);
console.log('production ready:', isProd ? hasToken : true);
