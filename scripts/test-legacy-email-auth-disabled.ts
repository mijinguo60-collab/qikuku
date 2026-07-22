import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NextRequest } from 'next/server';
import { POST as loginPost } from '../app/api/auth/login/route';
import { POST as registerPost } from '../app/api/auth/register/route';

function jsonRequest(url: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function main() {
  const loginResponse = await loginPost(jsonRequest('http://localhost/api/auth/login', { email: 'former@example.invalid', password: 'not-a-real-password' }));
  assert.equal(loginResponse.status, 410);
  assert.deepEqual(await loginResponse.json(), { error: '邮箱密码登录已关闭，请使用手机号密码登录' });
  assert.equal(loginResponse.headers.get('set-cookie'), null);

  const registerResponse = await registerPost(jsonRequest('http://localhost/api/auth/register', { email: 'former@example.invalid', password: 'not-a-real-password' }));
  assert.equal(registerResponse.status, 410);
  assert.deepEqual(await registerResponse.json(), { error: '邮箱注册已关闭，请使用手机号注册企业' });
  assert.equal(registerResponse.headers.get('set-cookie'), null);

  const [loginRoute, registerRoute] = await Promise.all([
    readFile(new URL('../app/api/auth/login/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/auth/register/route.ts', import.meta.url), 'utf8'),
  ]);
  for (const source of [loginRoute, registerRoute]) {
    for (const legacySymbol of ['authenticateUser', 'createUser', 'verifyPassword', 'hashPassword']) {
      assert.equal(source.includes(legacySymbol), false, `公开认证路由不得依赖旧邮箱认证：${legacySymbol}`);
    }
  }
  assert.equal(loginRoute.includes('argon2'), false, '路由只调用密码服务，不能直接保存或校验密码哈希');
  console.log('legacy email/password authentication is permanently disabled');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
