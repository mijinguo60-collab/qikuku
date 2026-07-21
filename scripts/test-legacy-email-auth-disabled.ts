import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { POST as legacyLoginPost } from '../app/api/auth/login/route';
import { POST as legacyRegisterPost } from '../app/api/auth/register/route';

async function main() {
  const loginResponse = await legacyLoginPost();
  assert.equal(loginResponse.status, 410);
  assert.deepEqual(await loginResponse.json(), {
    error: '邮箱密码登录已关闭，请使用手机号验证码登录',
  });
  assert.equal(loginResponse.headers.get('set-cookie'), null);

  const registerResponse = await legacyRegisterPost();
  assert.equal(registerResponse.status, 410);
  assert.deepEqual(await registerResponse.json(), {
    error: '邮箱注册已关闭，请使用手机号验证码注册',
  });
  assert.equal(registerResponse.headers.get('set-cookie'), null);

  const [loginRoute, registerRoute, loginClient, registerPage] = await Promise.all([
    readFile(new URL('../app/api/auth/login/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/auth/register/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/auth/login/LoginPageClient.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/auth/register/page.tsx', import.meta.url), 'utf8'),
  ]);

  for (const forbiddenDependency of ['authenticateUser', 'createServerSession', 'setSessionCookie', 'lastLoginAt', 'writeAuditLog']) {
    assert.equal(loginRoute.includes(forbiddenDependency), false, `旧登录接口不得包含 ${forbiddenDependency}`);
  }
  for (const forbiddenDependency of ['createUser', 'createServerSession', 'setSessionCookie']) {
    assert.equal(registerRoute.includes(forbiddenDependency), false, `旧注册接口不得包含 ${forbiddenDependency}`);
  }
  for (const removedLoginUi of ['accountSubmit', 'type="email"', 'type="password"', '邮箱登录', '密码登录', 'showPassword']) {
    assert.equal(loginClient.includes(removedLoginUi), false, `登录页不得保留 ${removedLoginUi}`);
  }
  assert.equal(loginClient.includes('手机号登录'), true);
  assert.equal(loginClient.includes('未注册手机号验证后将自动创建账号和企业。'), true);
  assert.equal(registerPage.includes("redirect('/auth/login')"), true);

  console.log('legacy email authentication closure tests passed');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
