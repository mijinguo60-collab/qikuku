import { NextRequest, NextResponse } from 'next/server';
import { chatCompletion, chatCompletionStream } from '@/lib/ai/language-provider';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mode, messages, skillId, knowledgeSpaceIds } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: '缺少 messages' }, { status: 400 });
    }

    const systemPrompt = buildSystemPrompt(mode, skillId);

    const allMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages,
    ];

    // Check if streaming is requested
    const acceptStream = request.headers.get('accept')?.includes('text/event-stream');

    if (acceptStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const gen = chatCompletionStream({ messages: allMessages });
            for await (const chunk of gen) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (e: any) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: e.message })}\n\n`));
            controller.close();
          }
        },
      });

      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Non-streaming response
    const result = await chatCompletion({ messages: allMessages });
    return NextResponse.json(result);
  } catch (e: any) {
    console.error('Chat API error:', e);
    return NextResponse.json({ error: e.message || '服务器错误' }, { status: 500 });
  }
}

function buildSystemPrompt(mode: string, skillId?: string): string {
  if (mode === 'knowledge') {
    return `你是企库库企业知识库AI助手。
你必须严格基于企业知识库资料回答问题。
规则：
- 只基于检索到的企业知识回答。
- 如果知识库没有相关内容，必须提示"当前知识库资料不足，建议补充相关资料"，不得胡编。
- 涉及报价、合同、医疗、法律等敏感内容时，必须提示以企业正式文件为准。
- 每个回答必须显示引用来源。
- 回答要具体、可执行、适合企业员工阅读。
- 不得编造企业没有提供的信息。`;
  }

  if (mode === 'skill') {
    return `你是企业管理诊断AI助手。
你必须基于企业知识库资料，叠加管理方法论进行诊断。
规则：
- 先检索企业资料，再结合管理框架分析。
- 输出必须包含：结论先行、基于资料的事实、问题诊断、根因分析、优先级排序、30天行动计划、需补充的资料、引用来源。
- 如果企业资料不足，指出需要补充哪些资料。
- 诊断要落地、可执行，帮助老板和管理层做决策。
- 不得只说空洞的管理理论。`;
  }

  return `你是企库库AI助手。请基于企业知识库资料回答用户问题。`;
}
