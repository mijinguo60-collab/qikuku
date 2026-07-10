import { NextRequest, NextResponse } from 'next/server';
import { llmChatCompletion, chatCompletionStream } from '@/lib/ai/llm-provider';
import { searchKnowledge } from '@/lib/ai/rag-pipeline';
import { logAiCall } from '@/lib/ai/ai-logger';

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const body = await request.json();
    const { mode, messages } = body;
    if (!messages || !Array.isArray(messages)) return NextResponse.json({ error: '缺少 messages' }, { status: 400 });

    const userCookie = request.cookies.get('qikuku_user');
    const user = userCookie ? JSON.parse(userCookie.value) : null;
    const companyId = user?.companyId || 'demo-company-zhucheng';

    // RAG retrieval
    const userMsg = [...messages].reverse().find((m: any) => m.role === 'user');
    const query = userMsg?.content || '';
    const sources = companyId !== 'demo-company-zhucheng'
      ? await searchKnowledge(query, companyId, 5).catch(() => [])
      : [];
    const ragContext = sources.length > 0
      ? '\n\n【企业知识库参考资料】\n' + sources.map((s, i) => `--- 资料${i + 1} (来源: ${s.source})\n${s.content}`).join('\n')
      : '';

    const systemPrompt = mode === 'skill'
      ? `你是企业管理诊断AI助手。先检索企业资料→叠加管理框架→输出诊断、根因、优先级、行动计划。${ragContext || '\n⚠️ 未检索到企业数据，请指出资料缺口。'}`
      : `你是企库库AI助手。严格基于企业知识库回答。不知道就说不知道。涉及报价/合同/法律请以正式文件为准。${ragContext || '\n⚠️ 当前企业知识库无足够依据，建议补充相关资料。'}`;

    const allMsgs = [{ role: 'system' as const, content: systemPrompt }, ...messages];

    // Streaming path
    const acceptStream = request.headers.get('accept')?.includes('text/event-stream');
    if (acceptStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const gen = chatCompletionStream({ messages: allMsgs });
            for await (const chunk of gen) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
            if (sources.length > 0) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ sources: sources.map(s => ({ filename: s.source, excerpt: s.content.slice(0, 200), score: s.score })) })}\n\n`));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (e: any) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: e.message })}\n\n`));
            controller.close();
          }
        },
      });
      return new NextResponse(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
    }

    const result = await llmChatCompletion({ messages: allMsgs, temperature: 0.3 });
    const srcOut = sources.map(s => ({ filename: s.source, excerpt: s.content.slice(0, 200), score: s.score }));

    if (user) {
      await logAiCall({
        companyId, userId: user.id, mode: mode === 'skill' ? 'skill' : 'knowledge',
        model: result.model, modelStatus: result.modelStatus,
        questionPreview: query, promptTokens: result.usage?.promptTokens,
        completionTokens: result.usage?.completionTokens, totalTokens: result.usage?.totalTokens,
        latencyMs: result.latencyMs, success: result.modelStatus !== 'error',
        errorMessage: result.error, sourcesCount: sources.length,
      });
    }

    return NextResponse.json({
      answer: result.answer || result.error || '未生成回答',
      sources: srcOut, retrievedChunksCount: sources.length,
      model: result.model, modelStatus: result.modelStatus,
      mode: mode === 'skill' ? 'skill' : 'knowledge',
      latencyMs: Date.now() - start,
      usage: result.usage,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
