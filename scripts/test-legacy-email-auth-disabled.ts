import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { POST as legacyLoginPost } from '../app/api/auth/login/route';
import { POST as legacyRegisterPost } from '../app/api/auth/register/route';

const root = new URL('..', import.meta.url);

async function exists(relativePath: string) {
  try {
    await access(new URL(relativePath, root));
    return true;
  } catch {
    return false;
  }
}

async function sourceFiles(relativeDirectory: string): Promise<string[]> {
  const directory = new URL(relativeDirectory, root);
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(relative));
    else if (/\.(?:ts|tsx|js|mjs|md)$/.test(entry.name)) files.push(relative);
  }
  return files;
}

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

  const forbiddenLoginRuntime = ['request' + '.json', 'auth' + 'enticateUser', 'create' + 'ServerSession', 'set' + 'SessionCookie', 'last' + 'LoginAt', 'write' + 'AuditLog'];
  const forbiddenRegisterRuntime = ['request' + '.json', 'create' + 'User', 'create' + 'ServerSession', 'set' + 'SessionCookie', 'get' + 'Db'];
  for (const dependency of forbiddenLoginRuntime) assert.equal(loginRoute.includes(dependency), false, `旧登录接口不得包含 ${dependency}`);
  for (const dependency of forbiddenRegisterRuntime) assert.equal(registerRoute.includes(dependency), false, `旧注册接口不得包含 ${dependency}`);
  for (const removedLoginUi of ['accountSubmit', 'type="email"', 'type="password"', '邮箱登录', '密码登录', 'showPassword']) {
    assert.equal(loginClient.includes(removedLoginUi), false, `登录页不得保留 ${removedLoginUi}`);
  }
  assert.equal(loginClient.includes('手机号登录'), true);
  assert.equal(loginClient.includes('未注册手机号验证后将自动创建账号和企业。'), true);
  assert.equal(registerPage.includes("redirect('/auth/login')"), true);

  const removedFiles = [
    'lib/' + 'auth.ts', 'lib/' + 'seed.ts', 'scripts/' + 'seed-production.ts',
    'scripts/' + 'verify-users.ts', 'scripts/' + 'e2e-onboarding-fixture.ts',
    'scripts/' + 'e2e-onboarding-cleanup.ts', 'scripts/' + 'debug-dashboard-pages.mjs',
    'scripts/' + 'check-permissions.mjs',
  ];
  for (const relativePath of removedFiles) assert.equal(await exists(relativePath), false, `${relativePath} 必须被删除`);

  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const removedScript of ['db:seed', 'verify:users', 'onboarding:e2e-cleanup', 'debug:dashboard-pages', 'check:permissions']) {
    assert.equal(Boolean(packageJson.scripts?.[removedScript]), false, `${removedScript} 必须从 package.json 删除`);
  }
  assert.equal(packageJson.prisma?.seed, undefined, 'package.json 不得保留 prisma.seed');

  const forbiddenDemoValues = [
    'ENABLE_' + 'DEMO_' + 'FALLBACK', 'DEMO_' + 'FALLBACK', 'admin' + '@zhucheng.com',
    'employee' + '@zhucheng.com', 'demo-user-' + 'admin', 'demo-company-' + 'zhucheng',
    'seed-admin-' + 'zhucheng', 'seed-employee-' + 'zhucheng', 'seed-company-' + 'zhucheng',
    '张' + '老板', '李' + '员工', '诸城' + '吃喝玩乐',
  ];
  const files = [
    ...await sourceFiles('app'),
    ...await sourceFiles('lib'),
    ...await sourceFiles('scripts'),
    ...await sourceFiles('docs'),
    'package.json',
    '.env.example',
    'DEPLOY.md',
  ].filter((relativePath) => relativePath !== 'scripts/cleanup-test-demo-data.ts');
  for (const relativePath of files) {
    const content = await readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
    for (const value of forbiddenDemoValues) assert.equal(content.includes(value), false, `${relativePath} 不得包含已删除 Demo 标识`);
  }

  console.log('legacy email/password authentication is permanently disabled');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
