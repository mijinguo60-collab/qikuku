import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { createInFlightRequest } from '@/lib/client/inflight-request';
import { getRequestSession, SESSION_COOKIE } from '@/lib/session';

async function testRequestSessionDeduplication() {
  process.env.SESSION_SECRET = 'performance-test-session-secret-that-is-long-enough';
  const payload = Buffer.from(JSON.stringify({ sid: 'perf-test', role: 'owner', platformRole: 'member' })).toString('base64url');
  const token = `${payload}.${createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url')}`;
  let queries = 0;
  const db = {
    prepare: () => ({
      get: async () => {
        queries += 1;
        return { id: 'user-perf', name: '性能测试', email: '', membershipId: 'membership-perf', role: 'owner', platformRole: 'member', status: 'active', companyId: 'company-perf', companyName: '性能企业', activeCompanyId: 'company-perf' };
      },
    }),
  };
  const request = new NextRequest('http://localhost/api/performance', { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
  const [first, second] = await Promise.all([getRequestSession(request, db), getRequestSession(request, db)]);
  assert.equal(first?.id, 'user-perf');
  assert.equal(second?.membershipId, 'membership-perf');
  assert.equal(queries, 1, 'one NextRequest must resolve its session only once');
}

async function testInFlightCreditDeduplication() {
  const deduper = createInFlightRequest<number>();
  let calls = 0;
  let release: (() => void) | undefined;
  const blocker = new Promise<void>((resolve) => { release = resolve; });
  const load = async () => { calls += 1; await blocker; return 3000; };
  const requests = [deduper.run(load), deduper.run(load), deduper.run(load)];
  assert.equal(calls, 1, 'concurrent balance refreshes must share one request');
  release?.();
  const [one, two, three] = await Promise.all(requests);
  assert.deepEqual([one, two, three], [3000, 3000, 3000]);
}

async function testDashboardPerformanceBoundaries() {
  const root = process.cwd();
  const [provider, sidebar, history, loginRoute, sessionSource] = await Promise.all([
    readFile(path.join(root, 'components/billing/CreditBalanceProvider.tsx'), 'utf8'),
    readFile(path.join(root, 'components/Sidebar.tsx'), 'utf8'),
    readFile(path.join(root, 'components/dashboard/ConversationHistory.tsx'), 'utf8'),
    readFile(path.join(root, 'app/api/auth/login/route.ts'), 'utf8'),
    readFile(path.join(root, 'lib/session.ts'), 'utf8'),
  ]);
  assert.match(provider, /createInFlightRequest/);
  assert.doesNotMatch(provider, /setInterval\(/, 'credits must not poll on an interval');
  assert.doesNotMatch(provider, /addEventListener\('focus'/, 'credits must not refresh on every focus');
  assert.match(sidebar, /<Link key=\{item\.href\} href=\{item\.href\} prefetch/);
  assert.doesNotMatch(sidebar, /window\.location|location\.assign/);
  assert.doesNotMatch(history, /await createConversation\(\)/, 'opening chat history must not create an empty session');
  assert.match(loginRoute, /createSession: true/);
  assert.doesNotMatch(loginRoute, /billing|knowledge-spaces|chat-sessions/i, 'login must not load dashboard business data');
  assert.doesNotMatch(sessionSource, /import \{ cache \} from 'react'/, 'React 18 runtime must not import React.cache');
  assert.match(sessionSource, /const serverSessionCache = new WeakMap/, 'RSC session reads must use request-store memoization');
  assert.match(sessionSource, /serverSessionCache\.get\(storeKey\)/, 'layout and page reads must share the request cookie store cache');
}

async function main() {
  await testRequestSessionDeduplication();
  await testInFlightCreditDeduplication();
  await testDashboardPerformanceBoundaries();
  console.log('performance request-deduplication tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
