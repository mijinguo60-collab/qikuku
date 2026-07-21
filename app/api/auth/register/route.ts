import { NextResponse } from 'next/server';

/**
 * 保留旧路径以兼容尚未升级的客户端；公开邮箱注册已永久关闭。
 * 新用户必须经手机号验证码登录流程完成账号和企业初始化。
 */
export async function POST() {
  return NextResponse.json(
    { error: '邮箱注册已关闭，请使用手机号验证码注册' },
    { status: 410 },
  );
}
