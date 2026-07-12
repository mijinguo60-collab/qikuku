import { NextRequest, NextResponse } from 'next/server';
import { getLlmConfig, llmChatCompletion, llmChatCompletionStream } from '@/lib/ai/llm-provider';
import { searchKnowledge } from '@/lib/ai/rag-pipeline';
import { logAiCall } from '@/lib/ai/ai-logger';
import { appendChatMessage, ensureChatSession, SessionOwner } from '@/lib/chat-sessions';
import { checkCreditBalance, consumeCredits } from '@/lib/billing/credits';
import { ensureCompanySubscription } from '@/lib/billing/plans';
import { FEATURE_CREDITS } from '@/lib/billing/pricing';
import { v4 as uuid } from 'uuid';
import { getRequestSession } from '@/lib/session';

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const owner = await getRequestSession(request);
    if (!owner) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const body = await request.json();
    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) return NextResponse.json({ error: '缺少 messages' }, { status: 400 });
    const userMsg = [...messages].reverse().find((message: any) => message.role === 'user' && typeof message.content === 'string');
    const query = userMsg?.content?.trim() || '';
    if (!query) return NextResponse.json({ error: '请输入问题' }, { status: 400 });
    const featureType = ['content_generation', 'sales_assistant', 'support_assistant', 'training_plan', 'business_diagnosis'].includes(body.featureType) ? body.featureType : 'knowledge_chat';
    const requiredCredits = FEATURE_CREDITS[featureType as keyof typeof FEATURE_CREDITS];
    await ensureCompanySubscription(owner.companyId, owner.id);
    const preflight = await checkCreditBalance(owner.companyId, requiredCredits);
    if (!preflight.ok) return NextResponse.json({ error: 'AI算力积分不足，请充值或升级套餐', requiredCredits, balance: preflight.balance, billingUrl: '/dashboard/billing' }, { status: 402 });
    const requestId = uuid();

    const session = await ensureChatSession(owner, typeof body.sessionId === 'string' ? body.sessionId : undefined, 'knowledge');
    await appendChatMessage(session, 'user', query);

    const sources = await searchKnowledge(query, owner.companyId, 5).catch(() => []);
    const sourceOutput = sources.map((source) => ({ filename: source.source, excerpt: source.content.slice(0, 200), score: source.score, documentId: source.documentId }));
    const ragContext = sources.length > 0
      ? `\n\n【企业知识库参考资料】\n${sources.map((source, index) => `--- 资料${index + 1}（来源：${source.source}）\n${source.content}`).join('\n')}`
      : '\n\n当前没有检索到相关企业资料。请明确说明资料不足，并给出应补充的资料建议，不要编造事实。';
    const allMessages = [
      { role: 'system' as const, content: `你是企库库企业知识库助手。回答应清晰、可执行，并优先引用企业资料。涉及报价、合同或法律事项时提醒以正式文件为准。${ragContext}` },
      ...messages.filter((message: any) => ['user', 'assistant'].includes(message.role) && typeof message.content === 'string').map((message: any) => ({ role: message.role, content: message.content })),
    ];

    const acceptStream = request.headers.get('accept')?.includes('text/event-stream');
    if (acceptStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          let answer = '';
          try {
            controller.enqueue(encoder.encode(sse({ sessionId: session.id })));
            for await (const chunk of llmChatCompletionStream({ messages: allMessages, temperature: 0.3 })) {
              answer += chunk;
              controller.enqueue(encoder.encode(sse({ content: chunk })));
            }
            await appendChatMessage(session, 'assistant', answer, { sources: sourceOutput, metadata: { modelStatus: 'live' } });
            await logAiCall({ companyId: owner.companyId, userId: owner.id, mode: 'knowledge', model: getLlmConfig().model, modelStatus: 'live', questionPreview: query, latencyMs: Date.now() - start, success: true, sourcesCount: sources.length });
            const billing = answer.trim() ? await consumeCredits({ companyId: owner.companyId, userId: owner.id, amount: requiredCredits, featureType, requestId, idempotencyKey: `knowledge:${requestId}`, description: 'AI 问答', model: getLlmConfig().model }) : null;
            if (billing) controller.enqueue(encoder.encode(sse({ chargedCredits: billing.chargedCredits, remainingCredits: billing.balance })));
            if (sourceOutput.length) controller.enqueue(encoder.encode(sse({ sources: sourceOutput })));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          } catch (error: any) {
            const message = error.message || '模型接口调用失败';
            await logAiCall({ companyId: owner.companyId, userId: owner.id, mode: 'knowledge', model: getLlmConfig().model, modelStatus: 'error', questionPreview: query, latencyMs: Date.now() - start, success: false, errorMessage: message, sourcesCount: sources.length });
            controller.enqueue(encoder.encode(sse({ error: message, sessionId: session.id })));
          } finally {
            controller.close();
          }
        },
      });
      return new NextResponse(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } });
    }

    const result = await llmChatCompletion({ messages: allMessages, temperature: 0.3 });
    if (result.answer) await appendChatMessage(session, 'assistant', result.answer, { sources: sourceOutput, metadata: { modelStatus: result.modelStatus } });
    await logAiCall({ companyId: owner.companyId, userId: owner.id, mode: 'knowledge', model: result.model, modelStatus: result.modelStatus, questionPreview: query, promptTokens: result.usage?.promptTokens, completionTokens: result.usage?.completionTokens, totalTokens: result.usage?.totalTokens, latencyMs: result.latencyMs, success: result.modelStatus === 'live', errorMessage: result.error, sourcesCount: sources.length });
    const billing = result.answer?.trim() && result.modelStatus === 'live'
      ? await consumeCredits({ companyId: owner.companyId, userId: owner.id, amount: requiredCredits, featureType, requestId, idempotencyKey: `knowledge:${requestId}`, description: 'AI 问答', model: result.model, outputTokens: result.usage?.completionTokens })
      : null;
    return NextResponse.json({ answer: result.answer, error: result.error, sources: sourceOutput, sessionId: session.id, modelStatus: result.modelStatus, latencyMs: Date.now() - start, chargedCredits: billing?.chargedCredits || 0, remainingCredits: billing?.balance });
  } catch (error: any) {
    console.error('[CHAT]', error.message);
    return NextResponse.json({ error: error.message || '企业知识库问答失败' }, { status: 500 });
  }
}
