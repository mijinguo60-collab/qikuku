'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bot, Copy, Loader2, Send, Zap, ZapOff } from 'lucide-react';
import ConversationHistory, { ConversationSummary } from '@/components/dashboard/ConversationHistory';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: { filename: string; excerpt?: string; score?: number }[];
}

const welcomeMessage: Message = {
  id: 'welcome',
  role: 'assistant',
  content: '你好！我是企库库 AI 助手。我会结合企业知识库帮助你快速找到可复用的答案。',
};

export default function ChatPage() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [useRealApi, setUseRealApi] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => {
    const question = searchParams.get('q');
    if (question) setInput(question);
  }, [searchParams]);

  async function createSession(): Promise<ConversationSummary | null> {
    try {
      const response = await fetch('/api/chat-sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'knowledge' }) });
      const data = await response.json();
      if (!response.ok) return null;
      setSessionId(data.session.id);
      setMessages([welcomeMessage]);
      return data.session;
    } catch {
      return null;
    }
  }

  async function loadSession(id: string) {
    if (loading) return;
    const response = await fetch(`/api/chat-sessions/${id}`);
    const data = await response.json();
    if (!response.ok) return;
    setSessionId(data.session.id);
    const restored = (data.messages || []).filter((message: Message) => message.role === 'user' || message.role === 'assistant');
    setMessages(restored.length ? restored : [welcomeMessage]);
  }

  async function handleSend() {
    const question = input.trim();
    if (!question || loading) return;
    const userMsg: Message = { id: `local-${Date.now()}`, role: 'user', content: question };
    const assistantId = `local-${Date.now() + 1}`;
    const conversation = [
      ...messages.filter((message) => message.id !== 'welcome' && message.content && !message.content.startsWith('❌')).map((message) => ({ role: message.role, content: message.content })),
      { role: 'user' as const, content: question },
    ];
    setMessages((current) => [...current, userMsg, { id: assistantId, role: 'assistant', content: '' }]);
    setInput('');
    setLoading(true);

    if (!useRealApi) {
      window.setTimeout(() => {
        setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: '这是演示模式回复。接入企业模型后，回答会结合当前企业知识库中的资料生成。' } : message));
        setLoading(false);
      }, 700);
      return;
    }

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ mode: 'knowledge', sessionId, messages: conversation }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `请求失败（${response.status}）`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('服务未返回可读取内容');
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let backendError = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const rawLine of lines) {
          if (!rawLine.startsWith('data:')) continue;
          const payload = rawLine.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const event = JSON.parse(payload);
            if (event.sessionId) setSessionId(event.sessionId);
            if (event.content) {
              fullContent += event.content;
              setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: fullContent } : message));
            }
            if (event.sources) setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, sources: event.sources } : message));
            if (event.error) backendError = event.error;
          } catch {
            backendError = '模型返回格式无法解析';
          }
        }
      }

      if (backendError) {
        setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: `❌ ${backendError}` } : message));
      } else if (!fullContent.trim()) {
        setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: '❌ 模型接口返回空内容' } : message));
      }
      setHistoryRevision((value) => value + 1);
    } catch (error: any) {
      setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: `❌ ${error.message || '请求失败，请稍后重试'}` } : message));
      setHistoryRevision((value) => value + 1);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-0px)] min-h-[560px]">
      <ConversationHistory mode="knowledge" activeSessionId={sessionId} refreshKey={historyRevision} onSelect={loadSession} onCreate={createSession} />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="px-6 py-4 border-b border-border-light flex items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <Bot className="w-5 h-5 text-accent-blue" />
            <div><h2 className="text-sm font-semibold">企业知识库问答</h2><p className="text-[11px] text-text-muted">{useRealApi ? '企业 AI 模型 · 知识库增强' : '演示模式'}</p></div>
          </div>
          <button onClick={() => setUseRealApi((value) => !value)} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all ${useRealApi ? 'bg-success/10 text-success' : 'bg-surface-tertiary text-text-muted'}`}>
            {useRealApi ? <Zap className="w-3.5 h-3.5" /> : <ZapOff className="w-3.5 h-3.5" />}{useRealApi ? 'API 模式' : '演示模式'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 max-w-3xl w-full mx-auto">
          {messages.map((message) => (
            <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}>
              {message.role === 'assistant' && <div className="w-7 h-7 rounded-full bg-accent-purple/10 flex items-center justify-center flex-shrink-0"><span className="text-[10px] font-bold text-accent-purple">AI</span></div>}
              <div className={`max-w-[85%] ${message.role === 'user' ? 'bg-text-primary text-white rounded-2xl rounded-tr-md px-4 py-2.5' : ''}`}>
                <div className={`text-sm leading-relaxed whitespace-pre-wrap ${message.role === 'assistant' ? 'text-text-primary' : ''}`}>{message.content}</div>
                {message.role === 'assistant' && message.id !== 'welcome' && message.content && !message.content.startsWith('❌') && <div className="flex items-center gap-2 mt-2"><button onClick={() => navigator.clipboard.writeText(message.content)} className="p-1.5 rounded-lg hover:bg-surface-hover text-text-muted"><Copy className="w-3.5 h-3.5" /></button>{message.sources?.length ? <span className="text-[10px] text-text-muted">引用 {message.sources.length} 条企业资料</span> : null}</div>}
              </div>
            </div>
          ))}
          {loading && <div className="flex gap-3"><div className="w-7 h-7 rounded-full bg-accent-purple/10 flex items-center justify-center"><Loader2 className="w-4 h-4 text-accent-purple animate-spin" /></div><span className="text-sm text-text-muted py-1">正在生成回答…</span></div>}
          <div ref={messagesEndRef} />
        </div>

        <div className="px-6 py-4 border-t border-border-light">
          <div className="max-w-3xl mx-auto flex items-center gap-2 bg-surface-secondary rounded-3xl px-4 py-2 border border-border-light focus-within:border-border-medium transition-all">
            <input type="text" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && !event.shiftKey && void handleSend()} placeholder="输入问题，基于企业知识库回答..." className="flex-1 bg-transparent text-sm outline-none text-text-primary placeholder:text-text-muted py-1" />
            <button onClick={() => void handleSend()} disabled={loading || !input.trim()} className="w-9 h-9 rounded-full bg-text-primary flex items-center justify-center flex-shrink-0 disabled:opacity-40"><Send className="w-4 h-4 text-white" /></button>
          </div>
          <p className="text-[10px] text-text-muted text-center mt-2">回答基于企业知识库。涉及报价、合同等内容请以正式文件为准。</p>
        </div>
      </div>
    </div>
  );
}
