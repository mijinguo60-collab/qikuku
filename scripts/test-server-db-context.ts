import assert from 'node:assert/strict';
import { getDb, withServerTestDb } from '../lib/db';

const originalNodeEnv = process.env.NODE_ENV;
const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  const dbA = { name: 'a' };
  const dbB = { name: 'b' };
  await Promise.all([
    withServerTestDb(dbA, async () => {
      assert.equal(getDb(), dbA);
      await delay(30);
      assert.equal(getDb(), dbA);
      await withServerTestDb(dbB, async () => {
        assert.equal(getDb(), dbB);
        await delay(10);
        assert.equal(getDb(), dbB);
      });
      assert.equal(getDb(), dbA);
    }),
    withServerTestDb(dbB, async () => {
      assert.equal(getDb(), dbB);
      await delay(15);
      assert.equal(getDb(), dbB);
    }),
  ]);
  (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
  await assert.rejects(() => withServerTestDb(dbA, async () => undefined), /仅测试环境/);
  (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
  console.log('server DB AsyncLocalStorage isolation tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
