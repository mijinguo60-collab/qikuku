import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';

process.env.SESSION_SECRET = 'session-edge-middleware-test-secret-at-least-32-bytes';

function createToken(role: string) {
  const payload = Buffer.from(JSON.stringify({ sid: 'test-session-id', role, platformRole: 'member' })).toString('base64url');
  const signature = createHmac('sha256', process.env.SESSION_SECRET!).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function createRequest(pathname: string, token?: string) {
  const headers = token ? { cookie: `qikuku_user=${token}` } : undefined;
  return new NextRequest(`https://qikuku.test${pathname}`, { headers });
}

function isCookieCleared(response: Response) {
  const cookie = response.headers.get('set-cookie') || '';
  return cookie.includes('qikuku_user=;') && cookie.includes('Max-Age=0');
}

const invalidToken = { tokenValid: false, authorizedByRoleClaim: false, role: null };
const ownerToken = createToken('owner');
const memberToken = createToken('member');
const [ownerPayload] = ownerToken.split('.');

async function main() {
  const { verifySessionRouteAccess } = await import('../lib/session-edge');
  const { config, middleware } = await import('../middleware');

  assert.deepEqual(await verifySessionRouteAccess(undefined, '/dashboard/team'), invalidToken);
  assert.deepEqual(await verifySessionRouteAccess(`${ownerPayload}.invalid`, '/dashboard/team'), invalidToken);
  assert.deepEqual(await verifySessionRouteAccess(`${ownerToken}.extra`, '/dashboard/team'), invalidToken);
  assert.deepEqual(await verifySessionRouteAccess(ownerToken, '/dashboard/team'), {
    tokenValid: true,
    authorizedByRoleClaim: true,
    role: 'owner',
  });
  assert.deepEqual(await verifySessionRouteAccess(memberToken, '/dashboard/team'), {
    tokenValid: true,
    authorizedByRoleClaim: false,
    role: 'member',
  });
  assert.deepEqual(await verifySessionRouteAccess(memberToken, '/dashboard'), {
    tokenValid: true,
    authorizedByRoleClaim: true,
    role: 'member',
  });

  assert.equal(config.matcher.includes('/auth/:path*'), false);
  const authResponse = await middleware(createRequest('/auth/login', memberToken));
  assert.equal(authResponse.headers.get('location'), null);
  assert.equal(isCookieCleared(authResponse), false);

  const memberPageResponse = await middleware(createRequest('/dashboard/team', memberToken));
  assert.equal(memberPageResponse.headers.get('location'), 'https://qikuku.test/forbidden?from=%2Fdashboard%2Fteam');
  assert.equal(isCookieCleared(memberPageResponse), false);

  const unauthenticatedPageResponse = await middleware(createRequest('/dashboard/team'));
  assert.equal(unauthenticatedPageResponse.headers.get('location'), 'https://qikuku.test/auth/login?redirect=%2Fdashboard%2Fteam');
  assert.equal(isCookieCleared(unauthenticatedPageResponse), true);

  const memberApiResponse = await middleware(createRequest('/api/admin/leads', memberToken));
  assert.equal(memberApiResponse.status, 403);
  assert.deepEqual(await memberApiResponse.json(), { error: '无权限' });
  assert.equal(isCookieCleared(memberApiResponse), false);

  const unauthenticatedApiResponse = await middleware(createRequest('/api/admin/leads'));
  assert.equal(unauthenticatedApiResponse.status, 401);
  assert.deepEqual(await unauthenticatedApiResponse.json(), { error: '未登录' });
  assert.equal(isCookieCleared(unauthenticatedApiResponse), true);

  const forbiddenResponse = await middleware(createRequest('/forbidden', memberToken));
  assert.equal(forbiddenResponse.headers.get('location'), null);

  console.log('session edge and middleware access tests passed');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
