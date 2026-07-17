import { NextRequest, NextResponse } from 'next/server';
import { getRequestSession } from '@/lib/session';
import { getEnabledModels, getServerModelCatalog, toPublicModel } from '@/lib/ai/model-catalog';

export async function GET(request: NextRequest) {
  if (!await getRequestSession(request)) return NextResponse.json({ error: '未登录' }, { status: 401 });

  // Only expose platform capability state. Keys, Base URLs and concrete model names stay server-side.
  const providers = [
    {
      id: 'language',
      title: '企业 AI 问答模型',
      description: '用于企业知识库问答与管理分析',
      configured: Boolean(process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_BASE_URL),
    },
    {
      id: 'openai',
      title: 'GPT 模型通道',
      description: '仅在真实模型 ID 与能力验证完成后向企业成员开放',
      configured: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_BASE_URL),
    },
    {
      id: 'gemini',
      title: 'Gemini 模型通道',
      description: '仅在真实模型 ID 与能力验证完成后向企业成员开放',
      configured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_BASE_URL),
    },
    {
      id: 'claude',
      title: 'Claude 模型通道',
      description: '仅在真实模型 ID 与能力验证完成后向企业成员开放',
      configured: Boolean(process.env.CLAUDE_API_KEY && process.env.CLAUDE_BASE_URL),
    },
    {
      id: 'image',
      title: '企业图像生成模型',
      description: '用于企业宣传图、海报和内容素材生成',
      configured: Boolean(process.env.IMAGE_API_KEY && process.env.IMAGE_BASE_URL && process.env.IMAGE_MODEL),
    },
    {
      id: 'image-edit',
      title: '图片图生图通道',
      description: '用于参考图生成与图片编辑',
      configured: Boolean(process.env.IMAGE_EDIT_ENABLED === 'true' && process.env.IMAGE_EDIT_API_KEY && process.env.IMAGE_EDIT_BASE_URL && process.env.IMAGE_EDIT_MODEL),
    },
    {
      id: 'embedding',
      title: '知识库向量模型',
      description: '用于企业资料检索与知识库增强',
      configured: Boolean(process.env.EMBEDDING_API_KEY && process.env.EMBEDDING_BASE_URL && process.env.EMBEDDING_MODEL),
    },
  ];

  return NextResponse.json({
    providers,
    // Unified chat only receives enabled entries. The settings page may use the
    // disabled count for diagnostics, without seeing invented provider IDs.
    models: getEnabledModels().map(toPublicModel),
    unavailableModelCount: getServerModelCatalog().filter((model) => !model.enabled).length,
  });
}
