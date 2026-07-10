import { NextRequest, NextResponse } from 'next/server';
import { llmChatCompletion } from '@/lib/ai/llm-provider';
import { searchKnowledge } from '@/lib/ai/rag-pipeline';
import { getDb } from '@/lib/db';
import { logAiCall } from '@/lib/ai/ai-logger';

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const body = await request.json();
    const { messages, skillId } = body;
    if (!messages || !Array.isArray(messages)) return NextResponse.json({ error: '缺少 messages' }, { status: 400 });

    const userCookie = request.cookies.get('qikuku_user');
    if (!userCookie) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const user = JSON.parse(userCookie.value);

    // Load Skill
    const db = getDb();
    let skill: any = {};
    if (skillId) {
      skill = await db.prepare(`SELECT * FROM "Skill" WHERE id = ? AND enabled = true`).get(skillId);
    }
    if (!skill?.id) {
      skill = await db.prepare(`SELECT * FROM "Skill" WHERE enabled = true AND ("companyId" = ? OR "isBuiltIn" = true) ORDER BY "createdAt" LIMIT 1`).get(user.companyId);
    }
    const skillName = skill?.name || '目标与贡献管理';
    const skillPrompt = skill?.systemPrompt || '';
    const skillFramework = skill?.framework || '';
    const skillOutput = skill?.outputSchema || '';

    // Retrieve knowledge
    const userMsg = [...messages].reverse().find((m: any) => m.role === 'user');
    const query = userMsg?.content || '';
    const sources = await searchKnowledge(query, user.companyId, 5).catch(() => []);
    const ragContext = sources.length > 0
      ? sources.map((s, i) => `--- 资料${i + 1} (${s.source})\n${s.content}`).join('\n')
      : '';

    // Build prompt
    const prompt = `【企业资料】\n${ragContext || '无相关资料'}\n\n【管理 Skill: ${skillName}】\n${skillPrompt}\n框架: ${skillFramework}\n输出格式: ${skillOutput}\n\n【回答要求】结论先行、企业资料事实、诊断、根因、优先级、30天行动计划、补充资料、引用来源。${ragContext ? '' : '\n⚠️ 资料不足，请先提示缺口。'}`;

    const allMsgs = [{ role: 'system' as const, content: prompt }, ...messages];

    const result = await llmChatCompletion({ messages: allMsgs, temperature: 0.3 });

    const srcOut = sources.map(s => ({ filename: s.source, excerpt: s.content.slice(0, 200), score: s.score, documentId: s.documentId }));

    await logAiCall({
      companyId: user.companyId, userId: user.id, mode: 'skill',
      model: result.model, modelStatus: result.modelStatus,
      questionPreview: query, promptTokens: result.usage?.promptTokens,
      completionTokens: result.usage?.completionTokens, totalTokens: result.usage?.totalTokens,
      latencyMs: result.latencyMs, success: result.modelStatus !== 'error',
      errorMessage: result.error, sourcesCount: sources.length,
    });

    return NextResponse.json({
      answer: result.answer || result.error || '未生成回答',
      sources: srcOut, skillName, skillId: skill?.id || null,
      retrievedChunksCount: sources.length, model: result.model,
      modelStatus: result.modelStatus, mode: 'skill', latencyMs: Date.now() - start,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
