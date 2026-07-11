import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getLlmConfig, llmChatCompletion, llmChatCompletionStream } from '@/lib/ai/llm-provider';
import { searchKnowledge } from '@/lib/ai/rag-pipeline';
import { logAiCall } from '@/lib/ai/ai-logger';
import { appendChatMessage, ensureChatSession, SessionOwner } from '@/lib/chat-sessions';

function currentOwner(request: NextRequest): SessionOwner | null {
  const cookie = request.cookies.get('qikuku_user');
  if (!cookie) return null;
  try {
    const user = JSON.parse(cookie.value);
    return user?.id && user?.companyId ? { id: user.id, companyId: user.companyId } : null;
  } catch {
    return null;
  }
}

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: NextRequest) {
  const owner = currentOwner(request);
  if (!owner) return NextResponse.json({ error: '未登录' }, { status: 401 });
  try {
    const skills = await getDb().prepare(
      `SELECT id, name FROM "Skill" WHERE enabled = true AND ("companyId" = ? OR "isBuiltIn" = true) ORDER BY "createdAt"`
    ).all(owner.companyId);
    return NextResponse.json({ skills });
  } catch (error: any) {
    console.error('[SKILL_CHAT] List skills failed', error.message);
    return NextResponse.json({ error: '读取管理 Skill 失败，请稍后重试' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const owner = currentOwner(request);
    if (!owner) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const body = await request.json();
    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) return NextResponse.json({ error: '缺少 messages' }, { status: 400 });
    const userMsg = [...messages].reverse().find((message: any) => message.role === 'user' && typeof message.content === 'string');
    const query = userMsg?.content?.trim() || '';
    if (!query) return NextResponse.json({ error: '请输入管理问题' }, { status: 400 });

    const db = getDb();
    let skill: any;
    if (typeof body.skillId === 'string' && body.skillId) {
      skill = await db.prepare(
        `SELECT * FROM "Skill" WHERE id = ? AND enabled = true AND ("companyId" = ? OR "isBuiltIn" = true)`
      ).get(body.skillId, owner.companyId);
      if (!skill) return NextResponse.json({ error: '所选管理 Skill 不存在或未启用' }, { status: 404 });
    } else {
      skill = await db.prepare(
        `SELECT * FROM "Skill" WHERE enabled = true AND ("companyId" = ? OR "isBuiltIn" = true) ORDER BY "createdAt" LIMIT 1`
      ).get(owner.companyId);
      if (!skill) return NextResponse.json({ error: '当前企业没有可用的管理 Skill' }, { status: 404 });
    }

    const session = await ensureChatSession(owner, typeof body.sessionId === 'string' ? body.sessionId : undefined, 'skill', skill.id);
    await appendChatMessage(session, 'user', query);

    const sources = await searchKnowledge(query, owner.companyId, 5).catch(() => []);
    const sourceOutput = sources.map((source) => ({ filename: source.source, excerpt: source.content.slice(0, 200), score: source.score, documentId: source.documentId }));
    const ragContext = sources.length
      ? sources.map((source, index) => `--- 企业资料${index + 1}（${source.source}）\n${source.content}`).join('\n')
      : '未检索到相关企业资料。仍应基于管理框架提供通用、可执行的分析，同时明确建议补充哪些资料。';
    const prompt = `你是企业管理诊断助手。\n\n【企业资料】\n${ragContext}\n\n【管理 Skill：${skill.name}】\n${skill.systemPrompt || ''}\n框架：${skill.framework || '请按结构化管理框架分析'}\n输出格式：${skill.outputSchema || '结论、依据、根因、优先级、行动计划'}\n\n【回答要求】先给结论，再给事实依据、根因、优先级与30天行动计划。资料不足时，不要停止回答，要说明资料缺口并给出适用于当前问题的框架建议。`;
    const allMessages = [{ role: 'system' as const, content: prompt }, ...messages.filter((message: any) => ['user', 'assistant'].includes(message.role) && typeof message.content === 'string').map((message: any) => ({ role: message.role, content: message.content }))];

    const acceptStream = request.headers.get('accept')?.includes('text/event-stream');
    if (acceptStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          let answer = '';
          try {
            controller.enqueue(encoder.encode(sse({ sessionId: session.id, skillName: skill.name })));
            for await (const chunk of llmChatCompletionStream({ messages: allMessages, temperature: 0.3 })) {
              answer += chunk;
              controller.enqueue(encoder.encode(sse({ content: chunk })));
            }
            await appendChatMessage(session, 'assistant', answer, { sources: sourceOutput, metadata: { modelStatus: 'live', skillId: skill.id, skillName: skill.name } });
            await logAiCall({ companyId: owner.companyId, userId: owner.id, mode: 'skill', model: getLlmConfig().model, modelStatus: 'live', questionPreview: query, latencyMs: Date.now() - start, success: true, sourcesCount: sources.length });
            if (sourceOutput.length) controller.enqueue(encoder.encode(sse({ sources: sourceOutput })));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          } catch (error: any) {
            const message = error.message || '管理 Skill 问答失败';
            await logAiCall({ companyId: owner.companyId, userId: owner.id, mode: 'skill', model: getLlmConfig().model, modelStatus: 'error', questionPreview: query, latencyMs: Date.now() - start, success: false, errorMessage: message, sourcesCount: sources.length });
            controller.enqueue(encoder.encode(sse({ error: message, sessionId: session.id })));
          } finally {
            controller.close();
          }
        },
      });
      return new NextResponse(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } });
    }

    const result = await llmChatCompletion({ messages: allMessages, temperature: 0.3 });
    if (result.answer) await appendChatMessage(session, 'assistant', result.answer, { sources: sourceOutput, metadata: { modelStatus: result.modelStatus, skillId: skill.id, skillName: skill.name } });
    await logAiCall({ companyId: owner.companyId, userId: owner.id, mode: 'skill', model: result.model, modelStatus: result.modelStatus, questionPreview: query, promptTokens: result.usage?.promptTokens, completionTokens: result.usage?.completionTokens, totalTokens: result.usage?.totalTokens, latencyMs: result.latencyMs, success: result.modelStatus === 'live', errorMessage: result.error, sourcesCount: sources.length });
    return NextResponse.json({ answer: result.answer, error: result.error, sources: sourceOutput, sessionId: session.id, skillName: skill.name, skillId: skill.id, modelStatus: result.modelStatus, latencyMs: Date.now() - start });
  } catch (error: any) {
    console.error('[SKILL_CHAT]', error.message);
    return NextResponse.json({ error: error.message || '管理 Skill 问答失败' }, { status: 500 });
  }
}
