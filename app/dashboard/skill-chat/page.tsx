'use client';

import { useEffect, useRef, useState } from 'react';
import { Brain, Copy, Loader2, Send, Sparkles, Zap, ZapOff } from 'lucide-react';
import ConversationHistory, { ConversationSummary } from '@/components/dashboard/ConversationHistory';
import { useCreditBalance } from '@/hooks/useCreditBalance';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  skillName?: string;
}

interface SkillOption { id: string; name: string; }

const welcomeMessage: Message = {
  id: 'welcome', role: 'assistant',
  content: '你好！我是管理 Skill 增强问答助手。我会结合企业资料和管理框架，给出结构化诊断与行动建议。',
};

const recommendedQuestions = [
  '销售团队执行力差，应该怎么解决？',
  '公司业务很多但利润不高，应该怎么调整？',
  '我们公司适合先做哪个增长方向？',
];

export default function SkillChatPage() {
  const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
  const [input, setInput] = useState('');
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState('');
  const [loading, setLoading] = useState(false);
  const [useRealApi, setUseRealApi] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [creditNotice, setCreditNotice] = useState('');
  const { updateCredits } = useCreditBalance();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/ai/skill-chat');
      const data = await response.json().catch(() => ({}));
      if (response.ok) setSkills(data.skills || []);
    })();
  }, []);

  async function createSession(): Promise<ConversationSummary | null> {
    try {
      const response = await fetch('/api/chat-sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'skill', skillId: selectedSkillId || null }) });
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
    if (data.session.skillId) setSelectedSkillId(data.session.skillId);
    const restored = (data.messages || []).filter((message: Message) => message.role === 'user' || message.role === 'assistant');
    setMessages(restored.length ? restored : [welcomeMessage]);
  }

  async function handleSend(questionOverride?: string) {
    const question = (questionOverride || input).trim();
    if (!question || loading) return;
    const userMsg: Message = { id: `local-${Date.now()}`, role: 'user', content: question };
    const assistantId = `local-${Date.now() + 1}`;
    const conversation = [
      ...messages.filter((message) => message.id !== 'welcome' && message.content && !message.content.startsWith('❌')).map((message) => ({ role: message.role, content: message.content })),
      { role: 'user' as const, content: question },
    ];
    setMessages((current) => [...current, userMsg, { id: assistantId, role: 'assistant', content: '' }]);
    if (!questionOverride) setInput('');
    setLoading(true);

    if (!useRealApi) {
      window.setTimeout(() => {
        setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: '演示模式：建议先明确目标、关键过程指标与复盘节奏，再补充相关企业资料以获得更准确的管理诊断。' } : message));
        setLoading(false);
      }, 700);
      return;
    }

    try {
      const response = await fetch('/api/ai/skill-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ sessionId, skillId: selectedSkillId || undefined, messages: conversation }),
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
            if (event.skillName) setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, skillName: event.skillName } : message));
            if (event.content) {
              fullContent += event.content;
              setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: fullContent } : message));
            }
            if (typeof event.chargedCredits === 'number' && typeof event.remainingCredits === 'number' && event.chargedCredits > 0) { updateCredits(event.remainingCredits); setCreditNotice(`本次消耗${event.chargedCredits}积分，剩余${event.remainingCredits.toLocaleString()}积分`); }
            if (event.error) backendError = event.error;
          } catch {
            backendError = '模型返回格式无法解析';
          }
        }
      }

      if (backendError) setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: `❌ ${backendError}` } : message));
      else if (!fullContent.trim()) setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: '❌ 模型接口返回空内容' } : message));
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
      <ConversationHistory mode="skill" activeSessionId={sessionId} refreshKey={historyRevision} onSelect={loadSession} onCreate={createSession} />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="px-6 py-4 border-b border-border-light flex items-center gap-3 justify-between">
          <div className="flex items-center gap-3"><Sparkles className="w-5 h-5 text-accent-purple" /><div><h2 className="text-sm font-semibold">管理 Skill 增强问答</h2><p className="text-[11px] text-text-muted">{useRealApi ? '企业 AI 模型 · 管理框架增强' : '演示模式'}</p></div></div>
          <button onClick={() => setUseRealApi((value) => !value)} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all ${useRealApi ? 'bg-success/10 text-success' : 'bg-surface-tertiary text-text-muted'}`}>
            {useRealApi ? <Zap className="w-3.5 h-3.5" /> : <ZapOff className="w-3.5 h-3.5" />}{useRealApi ? 'API 模式' : '演示模式'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 max-w-3xl w-full mx-auto">
          {messages.map((message) => (
            <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}>
              {message.role === 'assistant' && <div className="w-7 h-7 rounded-full bg-accent-purple/10 flex items-center justify-center flex-shrink-0"><Brain className="w-3.5 h-3.5 text-accent-purple" /></div>}
              <div className={`max-w-[90%] ${message.role === 'user' ? 'bg-text-primary text-white rounded-2xl rounded-tr-md px-4 py-2.5' : ''}`}>
                {message.id === 'welcome' ? <><p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap mb-4">{message.content}</p><div className="space-y-2">{recommendedQuestions.map((question) => <button key={question} onClick={() => void handleSend(question)} className="w-full text-left px-3 py-2.5 rounded-xl bg-surface-secondary hover:bg-surface-hover transition-all text-sm text-text-secondary">{question}</button>)}</div></> : <><div className={`text-sm leading-relaxed whitespace-pre-wrap ${message.role === 'assistant' ? 'text-text-primary' : ''}`}>{message.content}</div>{message.role === 'assistant' && message.content && !message.content.startsWith('❌') && <div className="flex items-center gap-2 mt-2"><button onClick={() => navigator.clipboard.writeText(message.content)} className="p-1.5 rounded-lg hover:bg-surface-hover text-text-muted"><Copy className="w-3.5 h-3.5" /></button>{message.skillName ? <span className="text-[10px] text-text-muted">{message.skillName}</span> : null}</div>}</>}
              </div>
            </div>
          ))}
          {loading && <div className="flex gap-3"><div className="w-7 h-7 rounded-full bg-accent-purple/10 flex items-center justify-center"><Loader2 className="w-4 h-4 text-accent-purple animate-spin" /></div><span className="text-sm text-text-muted py-1">正在生成诊断…</span></div>}
          <div ref={messagesEndRef} />
        </div>

        <div className="px-6 py-4 border-t border-border-light">
          <div className="max-w-3xl mx-auto flex items-center gap-2 mb-3"><span className="text-[11px] text-text-muted">管理 Skill：</span><select value={selectedSkillId} onChange={(event) => setSelectedSkillId(event.target.value)} className="text-[11px] bg-surface-secondary border border-border-light rounded-lg px-2.5 py-1.5 text-text-primary outline-none"><option value="">自动推荐</option>{skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></div>
          <div className="max-w-3xl mx-auto flex items-center gap-2 bg-surface-secondary rounded-3xl px-4 py-2 border border-border-light focus-within:border-border-medium"><input type="text" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void handleSend()} placeholder="描述你的管理问题..." className="flex-1 bg-transparent text-sm outline-none text-text-primary py-1" /><button onClick={() => void handleSend()} disabled={loading || !input.trim()} className="w-9 h-9 rounded-full bg-accent-purple flex items-center justify-center disabled:opacity-40"><Send className="w-4 h-4 text-white" /></button></div>
          {creditNotice && <p className="text-[11px] text-text-secondary text-center mt-2">{creditNotice}</p>}
        </div>
      </div>
    </div>
  );
}
