'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bot, Brain, Check, ChevronDown, Copy, FileUp, Globe2, ImagePlus, Info, Lightbulb, Loader2, Search, Send, Sparkles, WandSparkles, X, Zap } from 'lucide-react';
import ConversationHistory, { ConversationSummary } from '@/components/dashboard/ConversationHistory';
import { useCreditBalance } from '@/hooks/useCreditBalance';

type Model = {
  id: string; displayName: string; provider: string; description: string; iconKey: string; recommended: boolean; tier: string;
  estimatedCredits: number; supportsVision: boolean; supportsNativeFileInput: boolean; supportsParsedDocument: boolean; supportsWebSearch: boolean; supportsFileSearch: boolean; supportsToolCalling: boolean; supportsStreaming: boolean;
  contextWindow: number | null; maxOutputTokens: number | null;
  details: { reasoning: string; speed: string; chinese: string; longContext: string; vision: string; files: string; webSearch: string; tools: string; bestFor: string; limitations: string };
};
type Skill = { id: string; name: string; description: string | null };
type KnowledgeSpace = { id: string; name: string; description: string | null };
type Source = { filename: string; excerpt?: string; score?: number; documentId?: string; knowledgeSpaceId?: string };
type Message = { id: string; role: 'user' | 'assistant'; content: string; sources?: Source[]; model?: string; skillName?: string | null; creditsUsed?: number };

const welcome: Message = { id: 'welcome', role: 'assistant', content: '你好，我是企库库 AI 对话助手。我会优先依据当前企业知识库回答；选择 Skill 后，我会在同一资料范围内使用对应的分析框架。' };
const prompts = ['请总结当前知识空间里的核心流程和待补资料。', '根据企业资料，列出本周最值得优先处理的事项。', '当前知识库中有哪些信息缺口会影响决策？'];

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function OpenAiProviderMark({ className = '' }: { className?: string }) {
  // Locally drawn, monochrome six-loop mark. It is not copied from a third-
  // party asset and keeps the provider indicator legible on any theme.
  return <svg viewBox="0 0 24 24" aria-label="OpenAI" role="img" className={`fill-none stroke-current ${className}`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3.2c1.4-1.1 3.6-.1 3.6 1.7v2.1l1.8-1c1.6-.9 3.5.6 3 2.4l-.6 2 1.8 1c1.6.9 1.5 3.3-.2 4l-1.9.8 1 1.8c.8 1.6-.8 3.4-2.6 2.8l-2-.7v2.1c0 1.8-2.1 2.8-3.5 1.7L10.8 21l-1.8 1c-1.6.9-3.5-.6-3-2.4l.6-2-1.8-1c-1.6-.9-1.5-3.3.2-4l1.9-.8-1-1.8c-.8-1.6.8-3.4 2.6-2.8l2 .7V5c0-1 .6-1.5 1.5-1.8Z" />
    <path d="m10.5 7.9 5 8.2M7 10l10 4M8.6 17.3l6.8-10" />
  </svg>;
}

function DeepSeekProviderMark({ className = '' }: { className?: string }) {
  // Locally drawn whale mark for the DeepSeek provider.  It avoids generic
  // initials and third-party assets while remaining crisp at picker sizes.
  return <svg viewBox="0 0 24 24" aria-label="DeepSeek" role="img" className={`fill-current ${className}`}>
    <path d="M4.25 13.1c0-4.45 3.56-7.73 8.35-7.73 2.18 0 4.08.66 5.44 1.9.77.7 1.28 1.5 1.6 2.3l1.72-.88.1 2.74-2.36 1.1c-.55 3.94-3.8 6.3-7.94 6.3-2.35 0-4.28-.67-5.69-1.98-1-.93-1.22-2.44-1.22-3.75Zm5.15-1.9a1.05 1.05 0 1 0 0-2.1 1.05 1.05 0 0 0 0 2.1Zm4.12 4.43c-1.62.76-3.68.49-4.92-.58-.27-.23-.3-.64-.06-.91.23-.27.64-.3.91-.06.83.71 2.3.9 3.5.34.33-.15.71-.01.86.32.15.32.01.71-.29.86Z" />
    <path d="M7.92 6.5c-.18-1.56.58-2.86 1.86-3.47.23-.11.51.06.51.31 0 .83.29 1.43.89 1.86-.9.27-1.68.71-2.3 1.3-.4.02-.75.01-.96 0Z" opacity=".8" />
  </svg>;
}

function ProviderIcon({ provider, className = '' }: { provider: string; className?: string }) {
  const props = { className: `w-4 h-4 ${className}` };
  if (provider === 'deepseek') return <DeepSeekProviderMark className={props.className} />;
  if (provider === 'openai') return <OpenAiProviderMark className={props.className} />;
  if (provider === 'anthropic') return <WandSparkles {...props} />;
  if (provider === 'google') return <Sparkles {...props} />;
  if (provider === 'minimax' || provider === 'kimi' || provider === 'glm' || provider === 'alibaba') return <Zap {...props} />;
  return <Bot {...props} />;
}

function capabilityLabels(model: Model) {
  const labels = ['企业知识库'];
  if (model.supportsStreaming) labels.push('流式');
  if (model.supportsParsedDocument) labels.push('解析文档');
  if (model.supportsVision) labels.push('视觉');
  if (model.supportsNativeFileInput) labels.push('原生文件');
  if (model.supportsWebSearch) labels.push('联网');
  if (model.supportsFileSearch) labels.push('文件检索');
  if (model.supportsToolCalling) labels.push('工具调用');
  return labels;
}

function providerLabel(provider: string) {
  const labels: Record<string, string> = { openai: 'OpenAI', deepseek: 'DeepSeek', minimax: 'MiniMax', kimi: 'Kimi', glm: 'GLM', anthropic: 'Anthropic', google: 'Google', alibaba: 'Alibaba' };
  return labels[provider] || provider;
}

function tierLabel(tier: string) {
  if (tier === 'recommended') return '推荐';
  if (tier === 'advanced') return '高级';
  if (tier === 'fast') return '快速';
  return '待验证';
}

export default function ChatPage() {
  const searchParams = useSearchParams();
  const [models, setModels] = useState<Model[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [modelId, setModelId] = useState('');
  const [skillId, setSkillId] = useState('');
  const [knowledgeSpaceIds, setKnowledgeSpaceIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState('');
  const [historyRevision, setHistoryRevision] = useState(0);
  const [creditNotice, setCreditNotice] = useState('');
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [detailModel, setDetailModel] = useState<Model | null>(null);
  const { updateCredits } = useCreditBalance();
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selectedModel = models.find((model) => model.id === modelId) || models[0] || null;
  const selectedSkill = skills.find((skill) => skill.id === skillId) || null;
  const currentScope = knowledgeSpaceIds.length ? `${knowledgeSpaceIds.length} 个知识空间` : '全部可访问知识空间';
  const visibleModels = useMemo(() => models.filter((model) => `${model.displayName} ${model.provider} ${model.description}`.toLowerCase().includes(modelSearch.trim().toLowerCase())), [models, modelSearch]);
  const modelGroups = useMemo(() => visibleModels.reduce<Record<string, Model[]>>((groups, model) => {
    (groups[model.provider] ||= []).push(model); return groups;
  }, {}), [visibleModels]);
  const fileAttachmentReady = false;
  const webSearchReady = false;

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/ai/chat');
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || '读取对话配置失败');
        const nextModels = data.models || [];
        setModels(nextModels); setSkills(data.skills || []); setSpaces(data.knowledgeSpaces || []);
        const requestedSkill = searchParams.get('skill');
        if (requestedSkill && (data.skills || []).some((skill: Skill) => skill.id === requestedSkill)) setSkillId(requestedSkill);
        // Do not overwrite a user's in-page model selection when the route
        // search params are re-read by React. The catalog's first model is
        // only a startup fallback.
        if (nextModels[0]) setModelId((current) => current || nextModels[0].id);
        const question = searchParams.get('q');
        if (question) setInput(question.slice(0, 12_000));
      } catch (requestError: any) { setError(requestError.message || '读取对话配置失败'); }
      finally { setBootLoading(false); }
    })();
  }, [searchParams]);

  async function createSession(): Promise<ConversationSummary | null> {
    try {
      const response = await fetch('/api/chat-sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'knowledge', skillId: skillId || null }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '创建对话失败');
      setSessionId(data.session.id); setMessages([welcome]); setError('');
      return data.session;
    } catch (requestError: any) { setError(requestError.message || '创建对话失败'); return null; }
  }

  async function loadSession(id: string) {
    if (loading) return;
    try {
      const response = await fetch(`/api/chat-sessions/${encodeURIComponent(id)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '读取对话失败');
      setSessionId(data.session.id);
      if (data.session.skillId) setSkillId(data.session.skillId);
      const restored = (data.messages || []).filter((message: any) => message.role === 'user' || message.role === 'assistant').map((message: any) => ({
        id: message.id, role: message.role, content: message.content,
        sources: parseJson<Source[]>(message.sources, []), model: message.modelId || null,
        skillName: parseJson<{ skillName?: string }>(message.metadata, {}).skillName || null,
        creditsUsed: typeof message.creditsUsed === 'number' ? message.creditsUsed : 0,
      }));
      setMessages(restored.length ? restored : [welcome]);
    } catch (requestError: any) { setError(requestError.message || '读取对话失败'); }
  }

  function toggleSpace(id: string) {
    setKnowledgeSpaceIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function send(questionOverride?: string) {
    const question = (questionOverride || input).trim();
    if (!question || loading || !selectedModel) return;
    const userId = `local-user-${Date.now()}`;
    const assistantId = `local-assistant-${Date.now()}`;
    const conversation = [...messages.filter((message) => message.id !== 'welcome' && message.content && !message.content.startsWith('❌')).map((message) => ({ role: message.role, content: message.content })), { role: 'user', content: question }];
    setMessages((current) => [...current, { id: userId, role: 'user', content: question }, { id: assistantId, role: 'assistant', content: '', model: selectedModel.displayName, skillName: selectedSkill?.name || null }]);
    if (!questionOverride) setInput('');
    setLoading(true); setError('');
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const response = await fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, signal: controller.signal, body: JSON.stringify({ sessionId, modelId: selectedModel.id, skillId: skillId || null, knowledgeSpaceIds, webSearchEnabled: false, messages: conversation }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || `请求失败（${response.status}）`); }
      const reader = response.body?.getReader(); if (!reader) throw new Error('服务未返回可读取内容');
      const decoder = new TextDecoder(); let buffer = ''; let answer = ''; let serviceError = '';
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue; const payload = line.slice(5).trim(); if (!payload || payload === '[DONE]') continue;
          try {
            const event = JSON.parse(payload);
            if (event.sessionId) setSessionId(event.sessionId);
            if (event.content) { answer += event.content; setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: answer } : message)); }
            if (event.sources) setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, sources: event.sources } : message));
            if (typeof event.chargedCredits === 'number') setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, creditsUsed: event.chargedCredits } : message));
            if (typeof event.remainingCredits === 'number') { updateCredits(event.remainingCredits); setCreditNotice(`本次消耗 ${event.chargedCredits || 0} 积分，剩余 ${event.remainingCredits.toLocaleString()} 积分`); }
            if (event.error) serviceError = event.error;
          } catch { serviceError = '模型返回格式无法解析'; }
        }
      }
      if (serviceError || !answer.trim()) setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: `❌ ${serviceError || '模型接口返回空内容'}` } : message));
      setHistoryRevision((value) => value + 1);
    } catch (requestError: any) {
      if (requestError.name !== 'AbortError') setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: `❌ ${requestError.message || '请求失败，请稍后重试'}` } : message));
    } finally { if (abortRef.current === controller) abortRef.current = null; setLoading(false); }
  }

  if (bootLoading) return <div className="p-10 text-sm text-text-muted"><Loader2 className="inline w-4 h-4 animate-spin mr-2" />正在加载统一 AI 对话…</div>;
  if (error && !models.length) return <div className="p-10 text-sm text-danger">{error}</div>;

  return <div className="flex h-[calc(100vh-0px)] min-h-[600px] bg-surface-primary">
    <ConversationHistory mode="unified" activeSessionId={sessionId} refreshKey={historyRevision} onSelect={loadSession} onCreate={createSession} />
    <section className="min-w-0 flex-1 flex flex-col">
      <header className="relative border-b border-border-light bg-white/70 px-4 md:px-6 py-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <button type="button" aria-expanded={modelOpen} onClick={() => setModelOpen((value) => !value)} className="inline-flex items-center gap-2 rounded-xl border border-border-light bg-white px-3 py-2 text-xs font-medium shadow-sm transition hover:bg-surface-secondary focus:outline-none focus:ring-2 focus:ring-accent-blue/30">
            {selectedModel ? <span className="flex h-5 w-5 items-center justify-center rounded-md bg-accent-blue/10 text-accent-blue"><ProviderIcon provider={selectedModel.iconKey} /></span> : <Bot className="w-4 h-4 text-accent-blue" />}
            {selectedModel?.displayName || '暂无可用模型'}<ChevronDown className={`w-3.5 h-3.5 transition-transform ${modelOpen ? 'rotate-180' : ''}`} />
          </button>
          {modelOpen && <div className="fixed inset-x-0 bottom-0 z-30 max-h-[86vh] overflow-hidden rounded-t-[24px] border border-border-light bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:left-0 sm:mt-3 sm:max-h-[min(74vh,660px)] sm:w-[min(94vw,680px)] sm:rounded-[24px]">
            <div className="border-b border-border-light px-4 py-3 sm:px-5"><div className="mb-2 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-text-primary">选择对话模型</p><p className="mt-0.5 text-[11px] text-text-muted">所有模型均会优先检索当前企业知识库。</p></div><button type="button" aria-label="关闭模型选择器" onClick={() => setModelOpen(false)} className="rounded-lg p-1.5 text-text-muted transition hover:bg-surface-secondary"><X className="h-4 w-4" /></button></div><label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" /><input autoFocus value={modelSearch} onChange={(event) => setModelSearch(event.target.value)} placeholder="搜索模型或厂商" className="w-full rounded-xl border border-border-light bg-surface-secondary/70 py-2.5 pl-9 pr-3 text-xs outline-none transition focus:border-accent-blue/40 focus:bg-white" /></label></div>
            <div className="max-h-[calc(86vh-112px)] space-y-4 overflow-y-auto p-3 sm:max-h-[calc(min(74vh,660px)-112px)] sm:p-4">{Object.entries(modelGroups).map(([provider, group]) => <div key={provider}><p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">{providerLabel(provider)}</p>{group.map((model) => <div key={model.id} className={`group mb-1 grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-2xl border p-3 transition ${model.id === modelId ? 'border-accent-blue/35 bg-accent-blue/[0.045] shadow-sm' : 'border-transparent hover:border-border-light hover:bg-surface-secondary/75'}`}>
              <button type="button" aria-label={`选择 ${model.displayName}`} onClick={() => { setModelId(model.id); setModelOpen(false); }} className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-blue/10 text-accent-blue transition group-hover:scale-[1.03]"><ProviderIcon provider={model.iconKey} className="h-5 w-5" /></button>
              <button type="button" onClick={() => { setModelId(model.id); setModelOpen(false); }} className="min-w-0 text-left"><span className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-text-primary">{model.displayName}{model.recommended && <span className="rounded-md bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">推荐</span>}<span className="rounded-md bg-surface-tertiary px-1.5 py-0.5 text-[10px] font-medium text-text-muted">{tierLabel(model.tier)}</span></span><span className="mt-0.5 block text-[10px] text-text-muted">{providerLabel(model.provider)}</span><span className="mt-1.5 block text-[11px] leading-4 text-text-secondary">{model.description}</span><span className="mt-2 flex flex-wrap gap-1">{capabilityLabels(model).map((label) => <span key={label} className="rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] text-text-muted ring-1 ring-border-light/70">{label}</span>)}</span></button>
              <span className="flex min-w-[64px] flex-col items-end gap-2 text-[10px] text-text-muted whitespace-nowrap"><button type="button" onClick={() => setDetailModel(model)} aria-label={`查看 ${model.displayName} 能力详情`} className="rounded-lg p-1.5 transition hover:bg-white hover:text-accent-blue"><Lightbulb className="h-4 w-4" /></button><span>{model.estimatedCredits} 积分/次</span>{model.id === modelId && <Check className="h-4 w-4 text-accent-blue" />}</span>
            </div>)}</div>)}{!visibleModels.length && <p className="p-5 text-center text-xs text-text-muted">没有找到可用模型</p>}</div>
          </div>}
        </div>
        <select value={skillId} onChange={(event) => setSkillId(event.target.value)} className="rounded-xl border border-border-light bg-white px-3 py-2 text-xs outline-none"><option value="">仅企业知识库</option>{skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select>
        <details className="relative"><summary className="list-none cursor-pointer rounded-xl border border-border-light bg-white px-3 py-2 text-xs">{currentScope}</summary><div className="absolute z-20 mt-2 w-64 rounded-xl border border-border-light bg-white shadow-xl p-3 space-y-2"><button onClick={() => setKnowledgeSpaceIds([])} className="text-xs text-accent-blue">使用全部可访问空间</button>{spaces.map((space) => <label key={space.id} className="flex gap-2 text-xs text-text-secondary"><input type="checkbox" checked={knowledgeSpaceIds.includes(space.id)} onChange={() => toggleSpace(space.id)} />{space.name}</label>)}</div></details>
        {selectedSkill && <span className="text-[11px] text-accent-purple inline-flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" />{selectedSkill.name}</span>}
      </header>

      {detailModel && <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/25 p-3 sm:items-center sm:p-6" role="presentation" onMouseDown={() => setDetailModel(null)}>
        <section role="dialog" aria-modal="true" aria-label={`${detailModel.displayName} 模型能力详情`} onMouseDown={(event) => event.stopPropagation()} className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-[26px] border border-border-light bg-white p-5 shadow-2xl sm:p-6">
          <div className="flex items-start justify-between gap-4"><div className="flex min-w-0 gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-blue/10 text-accent-blue"><ProviderIcon provider={detailModel.iconKey} className="h-5 w-5" /></div><div><p className="text-base font-semibold text-text-primary">{detailModel.displayName}</p><p className="mt-0.5 text-xs text-text-muted">{providerLabel(detailModel.provider)} · {detailModel.estimatedCredits} 积分/次（预计）</p><p className="mt-2 text-sm leading-6 text-text-secondary">{detailModel.description}</p></div></div><button type="button" aria-label="关闭模型详情" onClick={() => setDetailModel(null)} className="rounded-xl p-2 text-text-muted transition hover:bg-surface-secondary"><X className="h-4 w-4" /></button></div>
          <div className="mt-5 rounded-xl border border-border-light bg-surface-secondary/70 px-3 py-2.5 text-xs leading-5 text-text-secondary"><Info className="mr-1.5 inline h-3.5 w-3.5 text-accent-blue" />能力标记以当前企库库接入通道的真实验证为准，不以厂商宣传能力替代实际可用性。</div>
          <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">{[
            ['推理与响应', `${detailModel.details.reasoning} ${detailModel.details.speed}`],
            ['中文与长文本', `${detailModel.details.chinese} ${detailModel.details.longContext}`],
            ['图片与文件', `${detailModel.details.vision} ${detailModel.details.files}`],
            ['联网与工具', `${detailModel.details.webSearch} ${detailModel.details.tools}`],
            ['适合场景', detailModel.details.bestFor],
            ['已知限制', detailModel.details.limitations],
          ].map(([term, description]) => <div key={term}><dt className="text-xs font-medium text-text-primary">{term}</dt><dd className="mt-1 text-xs leading-5 text-text-secondary">{description}</dd></div>)}</dl>
          <div className="mt-5 flex flex-wrap gap-1.5 border-t border-border-light pt-4">{capabilityLabels(detailModel).map((label) => <span key={label} className="rounded-md bg-surface-secondary px-2 py-1 text-[11px] text-text-secondary">{label}</span>)}{detailModel.contextWindow && <span className="rounded-md bg-surface-secondary px-2 py-1 text-[11px] text-text-secondary">上下文 {detailModel.contextWindow.toLocaleString()}</span>}{detailModel.maxOutputTokens && <span className="rounded-md bg-surface-secondary px-2 py-1 text-[11px] text-text-secondary">最长输出 {detailModel.maxOutputTokens.toLocaleString()}</span>}</div>
        </section>
      </div>}

      <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6"><div className="mx-auto max-w-4xl space-y-5">
        {messages.map((message) => <article key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}>
          {message.role === 'assistant' && <div className="mt-1 w-8 h-8 rounded-xl bg-accent-blue/10 flex items-center justify-center shrink-0"><Brain className="w-4 h-4 text-accent-blue" /></div>}
          <div className={`max-w-[90%] ${message.role === 'user' ? 'rounded-2xl rounded-tr-md bg-text-primary text-white px-4 py-3' : ''}`}>
            <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>
            {message.role === 'assistant' && message.id === 'welcome' && <div className="grid gap-2 mt-4 md:grid-cols-3">{prompts.map((prompt) => <button key={prompt} onClick={() => void send(prompt)} className="rounded-xl bg-surface-secondary p-3 text-left text-xs text-text-secondary hover:bg-surface-hover">{prompt}</button>)}</div>}
            {message.role === 'assistant' && message.id !== 'welcome' && message.content && !message.content.startsWith('❌') && <div className="mt-3 flex flex-wrap gap-2 items-center text-[10px] text-text-muted"><button onClick={() => void navigator.clipboard.writeText(message.content)} className="rounded-lg p-1.5 hover:bg-surface-secondary"><Copy className="w-3.5 h-3.5" /></button>{message.model && <span>模型：{message.model}</span>}{message.skillName && <span>Skill：{message.skillName}</span>}{typeof message.creditsUsed === 'number' && message.creditsUsed > 0 && <span>消耗：{message.creditsUsed} 积分</span>}</div>}
            {message.sources?.length ? <div className="mt-3 rounded-xl border border-border-light bg-surface-secondary p-3"><p className="text-[10px] font-medium text-text-muted mb-1.5">企业资料依据</p>{message.sources.map((source, index) => <p key={`${source.documentId || source.filename}-${index}`} className="text-[11px] text-text-secondary py-0.5">{source.filename}{source.excerpt ? ` · ${source.excerpt}` : ''}</p>)}</div> : null}
          </div>
        </article>)}
        {loading && <div className="flex gap-3 text-sm text-text-muted"><Loader2 className="w-4 h-4 animate-spin" />正在基于企业知识库生成回答…</div>}
        <div ref={endRef} />
      </div></main>

      <footer className="border-t border-border-light bg-white/70 p-4 md:p-6"><div className="mx-auto max-w-4xl rounded-2xl border border-border-light bg-white p-3">
        <div className="flex gap-2 mb-2 text-[11px] text-text-muted"><span>{selectedModel?.estimatedCredits || 0} 积分/次（预计）</span><span>·</span><span>{currentScope}</span></div>
        <div className="flex items-end gap-2"><div className="flex gap-1"><button disabled={!fileAttachmentReady || !selectedModel?.supportsParsedDocument} title={!selectedModel?.supportsParsedDocument ? '当前模型不支持解析文档上下文' : '会话附件存储尚未配置；请先通过文件中心入库'} className="p-2 text-text-muted disabled:opacity-35"><FileUp className="w-4 h-4" /></button><button disabled={!selectedModel?.supportsVision || !fileAttachmentReady} title={!selectedModel?.supportsVision ? '当前模型不支持图片识别' : '会话图片附件存储尚未配置'} className="p-2 text-text-muted disabled:opacity-35"><ImagePlus className="w-4 h-4" /></button><button disabled={!selectedModel?.supportsWebSearch || !webSearchReady} title={!selectedModel?.supportsWebSearch ? '当前模型不支持联网搜索' : '平台尚未配置真实联网搜索服务'} className="p-2 text-text-muted disabled:opacity-35"><Globe2 className="w-4 h-4" /></button></div>
          <textarea value={input} onChange={(event) => setInput(event.target.value.slice(0, 12_000))} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="输入问题，企业知识库将优先作为回答依据…" rows={2} className="min-h-[44px] flex-1 resize-none bg-transparent text-sm outline-none" />
          <button onClick={() => void send()} disabled={loading || !input.trim() || !selectedModel} className="w-10 h-10 rounded-xl bg-text-primary text-white flex items-center justify-center disabled:opacity-40"><Send className="w-4 h-4" /></button>
        </div><p className="mt-2 text-[10px] text-text-muted">企业资料优先；资料不足时会明确提示。联网搜索当前未配置。</p>{creditNotice && <p className="mt-1 text-[11px] text-text-secondary">{creditNotice}</p>}{error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
      </div></footer>
    </section>
  </div>;
}
