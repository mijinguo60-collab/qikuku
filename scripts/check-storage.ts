import 'dotenv/config';
import { getStorageConfig } from '@/lib/storage';

function main() {
  const c = getStorageConfig();
  console.log('NODE_ENV:', c.nodeEnv);
  console.log('storage provider:', c.provider);
  console.log('BLOB_READ_WRITE_TOKEN exists:', c.hasBlobToken);
  console.log('production ready:', c.productionReady);
}
main();
