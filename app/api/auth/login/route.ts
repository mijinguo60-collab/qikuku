import { NextResponse } from 'next/server';

/**
 * 保留旧路径以兼容尚未升级的客户端；公开邮箱密码登录已永久关闭。
 * 此处理器不读取请求体，也不会查询或修改任何用户、企业或 Session 数据。
 */
export async function POST() {
  return NextResponse.json(
    { error: '邮箱密码登录已关闭，请使用手机号验证码登录' },
    { status: 410 },
  );
}
