'use client';
import { useState, useRef, useEffect } from 'react';
import { Send, Copy, Download, ThumbsUp, ThumbsDown, FileText, Bot, Loader2, Zap, ZapOff } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: { filename: string; space: string }[];
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '你好！我是企库库 AI 助手。我基于企业知识库回答你的问题。\n\n试试这些问题：\n• 客户嫌代运营服务太贵怎么回复？\n• 探店拍摄的标准流程是什么？\n• 新员工培训需要多久？',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [useRealApi, setUseRealApi] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  function handleCopy(text: string) { navigator.clipboard.writeText(text); }

  async function handleSend() {
    if (!input.trim() || loading) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    if (!useRealApi) {
      // Mock fallback
      setTimeout(() => {
        setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: mockReply(input) }]);
        setLoading(false);
      }, 1200);
      return;
    }

    // Real API call
    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    try {
      abortRef.current = new AbortController();
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({
          mode: 'knowledge',
          messages: [
            ...messages.filter(m => m.id !== 'welcome').map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
            { role: 'user', content: userMsg.content },
          ],
        }),
        signal: abortRef.current.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              fullContent += parsed.content;
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullContent } : m));
            }
            if (parsed.error) {
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `❌ 错误: ${parsed.error}` } : m));
            }
          } catch {}
        }
      }
      if (!fullContent) {
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: '⚠️ AI 没有返回内容，请重试' } : m));
      }
    } catch (e: any) {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `❌ 请求失败: ${e.message || '网络错误'}` } : m));
    }
    setLoading(false);
  }

  function mockReply(text: string) {
    if (text.includes('嫌') || text.includes('贵')) return '**建议回复：** "我理解您的顾虑。我们合作过的商家平均 ROI 是 1:5，服务费只占不到 5%。"';
    if (text.includes('拍摄') || text.includes('探店')) return '**标准流程：** 1. 提前沟通需求 2. 准备设备 3. 到店拍摄 4. 剪辑发布。详见《探店拍摄 SOP.pdf》';
    return '基于企业知识库，我暂时无法给出确定答案。建议补充相关资料。';
  }

  return (
    <div className="flex h-[calc(100vh-0px)]">
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
        <div className="px-6 py-4 border-b border-border-light flex items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <Bot className="w-5 h-5 text-accent-blue" />
            <div>
              <h2 className="text-sm font-semibold">企业知识库问答</h2>
              <p className="text-[11px] text-text-muted">
                {useRealApi ? 'DeepSeek V4 Flash · 流式输出' : 'Mock 演示模式'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setUseRealApi(!useRealApi)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all ${
              useRealApi ? 'bg-success/10 text-success' : 'bg-surface-tertiary text-text-muted'
            }`}
            title={useRealApi ? '切换至 Mock 模式' : '切换至真实 API'}
          >
            {useRealApi ? <Zap className="w-3.5 h-3.5" /> : <ZapOff className="w-3.5 h-3.5" />}
            {useRealApi ? 'API 模式' : 'Mock 模式'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-accent-purple/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-accent-purple">AI</span>
                </div>
              )}
              <div className={`max-w-[85%] ${msg.role === 'user' ? 'bg-text-primary text-white rounded-2xl rounded-tr-md px-4 py-2.5' : ''}`}>
                {msg.role === 'assistant' ? (
                  <div className="space-y-3">
                    <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                    {msg.id !== 'welcome' && msg.content && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleCopy(msg.content)} className="p-1.5 rounded-lg hover:bg-surface-hover text-text-muted"><Copy className="w-3.5 h-3.5" /></button>
                        <button className="p-1.5 rounded-lg hover:bg-surface-hover text-text-muted"><ThumbsUp className="w-3.5 h-3.5" /></button>
                        <button className="p-1.5 rounded-lg hover:bg-surface-hover text-text-muted"><ThumbsDown className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-accent-purple/10 flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-accent-purple animate-spin" />
              </div>
              <div className="text-sm text-text-muted py-2">思考中...</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="px-6 py-4 border-t border-border-light">
          <div className="flex items-center gap-2 bg-surface-secondary rounded-3xl px-4 py-2 border border-border-light focus-within:border-border-medium transition-all">
            <input
              type="text" value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="输入问题，基于企业知识库回答..."
              className="flex-1 bg-transparent text-sm outline-none text-text-primary placeholder:text-text-muted py-1"
            />
            <button onClick={handleSend} disabled={loading || !input.trim()}
              className="w-9 h-9 rounded-full bg-text-primary flex items-center justify-center flex-shrink-0 disabled:opacity-40 hover:bg-text-primary/90 transition-colors">
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
          <p className="text-[10px] text-text-muted text-center mt-2">
            回答基于企业知识库，AI 不会编造信息。涉及报价、合同等内容请以正式文件为准。
          </p>
        </div>
      </div>
    </div>
  );
}
