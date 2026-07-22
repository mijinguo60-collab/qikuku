import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function read(relativePath: string) {
  return readFile(path.join(process.cwd(), relativePath), 'utf8');
}

async function main() {
  const [login, register] = await Promise.all([
    read('app/auth/login/LoginPageClient.tsx'),
    read('app/auth/register/page.tsx'),
  ]);

  assert.match(login, /登录企库库/);
  assert.match(login, /type=\{showPassword \? 'text' : 'password'\}/);
  assert.match(login, /30 天内保持登录/);
  assert.match(login, /href="\/auth\/forgot-password"/);
  assert.match(login, /href="\/auth\/register"/);
  assert.match(login, /微信登录暂未开放/);
  assert.doesNotMatch(login, /短信登录|企业名称|自动创建企业|邮箱登录/);

  for (const field of ['中国大陆手机号', '短信验证码', '企业名称', '姓名', '设置密码', '确认密码', '注册并进入工作台']) {
    assert.match(register, new RegExp(field));
  }
  assert.doesNotMatch(register, /const \[step, setStep\]/, 'registration fields must not be hidden behind a second step');
  assert.doesNotMatch(register, /step === 1/, 'registration must render all fields immediately');
  assert.match(register, /disabled=\{sending \|\| countdown > 0 \|\| !mainlandPhone\.test\(phone\)\}/);
  assert.match(register, /disabled=\{submitting\}/);
  assert.match(register, /validateLoginPasswordValue/);
  assert.match(register, /password !== confirmPassword/);

  console.log('auth page regression tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
