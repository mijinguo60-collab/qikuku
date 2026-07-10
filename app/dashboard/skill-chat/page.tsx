'use client';
import { useState, useRef, useEffect } from 'react';
import { Send, Copy, Sparkles, Brain, Loader2, Zap, ZapOff } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  skillName?: string;
}

const recommendedQuestions = [
  { q: '销售团队执行力差，应该怎么解决？', skill: '目标与贡献管理 Skill' },
  { q: '公司业务很多但利润不高，应该怎么调整？', skill: '经营利润与责任单元 Skill' },
  { q: '我们公司适合先做哪个增长方向？', skill: '差异化战略与从 0 到 1 Skill' },
];

export default function SkillChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant', content: '你好！我是管理 Skill 增强问答助手。\n\n我会先检索企业资料，再结合管理 Skill 框架，输出结构化诊断和行动计划。' },
  ]);
  const [input, setInput] = useState('');
  const [selectedSkill, setSelectedSkill] = useState('');
  const [loading, setLoading] = useState(false);
  const [useRealApi, setUseRealApi] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function handleSend(q?: string) {
    const text = q || input.trim();
    if (!text || loading) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    if (!q) setInput('');
    setLoading(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', skillName: selectedSkill || '管理 Skill' }]);

    if (!useRealApi) {
      setTimeout(() => {
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: mockSkillReply(text) } : m));
        setLoading(false);
      }, 2000);
      return;
    }

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({
          mode: 'skill',
          skillId: selectedSkill,
          messages: [
            ...messages.filter(m => m.id !== 'welcome').map(m => ({ role: (m.role as string) as 'user' | 'assistant', content: m.content })),
            { role: 'user', content: userMsg.content },
          ],
        }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');
      const decoder = new TextDecoder();
      let fullContent = '', buffer = '';
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
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: '⚠️ AI 没有返回内容' } : m));
      }
    } catch (e: any) {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `❌ 请求失败: ${e.message}` } : m));
    }
    setLoading(false);
  }

  function mockSkillReply(text: string) {
    return `**结论先行**\n基于企业管理 Skill 分析，核心问题在于目标不清晰和过程无跟踪。\n\n**根因分析**\n1. 管理方式是结果导向而非过程管理\n2. 缺少每日复盘机制\n\n**30天行动计划**\n第一周：明确周目标\n第二周：建立日报制度\n第三周：跟踪转化率\n第四周：复盘调整`;
  }

  return (
    <div className="flex h-[calc(100vh-0px)]">
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
        <div className="px-6 py-4 border-b border-border-light flex items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-accent-purple" />
            <div>
              <h2 className="text-sm font-semibold">管理 Skill 增强问答</h2>
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
                  <Brain className="w-3.5 h-3.5 text-accent-purple" />
                </div>
              )}
              <div className={`max-w-[90%] ${msg.role === 'user' ? 'bg-text-primary text-white rounded-2xl rounded-tr-md px-4 py-2.5' : ''}`}>
                {msg.role === 'assistant' ? (
                  <div className="space-y-3">
                    {msg.id === 'welcome' ? (
                      <>
                        <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap mb-4">{msg.content}</p>
                        <div className="space-y-2">
                          {recommendedQuestions.map((rq, i) => (
                            <button key={i} onClick={() => { setSelectedSkill(rq.skill); handleSend(rq.q); }}
                              className="w-full text-left px-3 py-2.5 rounded-xl bg-surface-secondary hover:bg-surface-hover transition-all text-sm text-text-secondary">
                              <span className="font-medium text-text-primary">{rq.q}</span>
                              <span className="block text-xs text-text-muted mt-0.5">推荐 Skill: {rq.skill}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                    )}
                    {msg.id !== 'welcome' && msg.content && (
                      <button onClick={() => navigator.clipboard.writeText(msg.content)}
                        className="p-1.5 rounded-lg hover:bg-surface-hover text-text-muted"><Copy className="w-3.5 h-3.5" /></button>
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
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] text-text-muted">Skill:</span>
            <select value={selectedSkill} onChange={e => setSelectedSkill(e.target.value)}
              className="text-[11px] bg-surface-secondary border border-border-light rounded-lg px-2.5 py-1.5 text-text-primary outline-none">
              <option value="">自动推荐</option>
              <option>目标与贡献管理 Skill</option>
              <option>差异化战略与从 0 到 1 Skill</option>
              <option>竞争战略与行业结构 Skill</option>
              <option>经营利润与责任单元 Skill</option>
              <option>精益验证与持续改进 Skill</option>
            </select>
          </div>
          <div className="flex items-center gap-2 bg-surface-secondary rounded-3xl px-4 py-2 border border-border-light">
            <input type="text" value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="描述你的管理问题..." className="flex-1 bg-transparent text-sm outline-none text-text-primary py-1" />
            <button onClick={() => handleSend()} disabled={loading || !input.trim()}
              className="w-9 h-9 rounded-full bg-accent-purple flex items-center justify-center disabled:opacity-40">
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
