import { NextRequest, NextResponse } from 'next/server';

function hasSession(request: NextRequest) {
  const userCookie = request.cookies.get('qikuku_user');
  if (!userCookie) return false;
  try {
    const user = JSON.parse(userCookie.value);
    return Boolean(user?.id && user?.companyId);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!hasSession(request)) return NextResponse.json({ error: '未登录' }, { status: 401 });

  // Only expose platform capability state. Keys, Base URLs and concrete model names stay server-side.
  const providers = [
    {
      id: 'language',
      title: '企业 AI 问答模型',
      description: '用于企业知识库问答与管理分析',
      configured: Boolean(process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_BASE_URL && process.env.DEEPSEEK_MODEL),
    },
    {
      id: 'image',
      title: '企业图像生成模型',
      description: '用于企业宣传图、海报和内容素材生成',
      configured: Boolean(process.env.IMAGE_API_KEY && process.env.IMAGE_BASE_URL && process.env.IMAGE_MODEL),
    },
    {
      id: 'embedding',
      title: '知识库向量模型',
      description: '用于企业资料检索与知识库增强',
      configured: Boolean(process.env.EMBEDDING_API_KEY && process.env.EMBEDDING_BASE_URL && process.env.EMBEDDING_MODEL),
    },
  ];

  return NextResponse.json({ providers });
}
