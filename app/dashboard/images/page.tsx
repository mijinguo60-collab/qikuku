'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Copy, Download, Image as ImageIcon, Loader2, RefreshCw, Send, Upload, X, Zap, ZapOff } from 'lucide-react';
import ConversationHistory, { ConversationSummary } from '@/components/dashboard/ConversationHistory';
import { useCreditBalance } from '@/hooks/useCreditBalance';

const ASPECT_RATIOS = [
  { label: '1:1 正方形', value: '1:1' },
  { label: '16:9 横版', value: '16:9' },
  { label: '9:16 竖版', value: '9:16' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
];
const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;

interface ImageMessage {
  id: string;
  role: 'user' | 'assistant';
  prompt: string;
  aspectRatio?: string;
  referenceImageUrl?: string | null;
  referenceImageName?: string | null;
  imageUrls?: string[];
  assetsSaved?: boolean;
  warning?: string;
  error?: string;
}

function safeMetadata(value: unknown) {
  if (typeof value !== 'string') return {} as Record<string, any>;
  try { return JSON.parse(value); } catch { return {} as Record<string, any>; }
}

export default function ImagesPage() {
  const [messages, setMessages] = useState<ImageMessage[]>([]);
  const [input, setInput] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceImageName, setReferenceImageName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [useRealApi, setUseRealApi] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [creditNotice, setCreditNotice] = useState('');
  const { updateCredits } = useCreditBalance();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function createSession(): Promise<ConversationSummary | null> {
    try {
      const response = await fetch('/api/chat-sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'image' }) });
      const data = await response.json();
      if (!response.ok) return null;
      setSessionId(data.session.id);
      setMessages([]);
      return data.session;
    } catch { return null; }
  }

  async function loadSession(id: string) {
    if (loading) return;
    const response = await fetch(`/api/chat-sessions/${id}`);
    const data = await response.json();
    if (!response.ok) return;
    setSessionId(data.session.id);
    const restored = (data.messages || []).map((message: any): ImageMessage => {
      const metadata = safeMetadata(message.metadata);
      if (metadata.kind === 'image_result') {
        return { id: message.id, role: 'assistant', prompt: metadata.prompt || '', aspectRatio: metadata.aspectRatio, imageUrls: metadata.imageUrls || [], assetsSaved: metadata.assetsSaved !== false };
      }
      if (metadata.kind === 'image_error') {
        return { id: message.id, role: 'assistant', prompt: '', error: metadata.error || message.content };
      }
      return { id: message.id, role: message.role, prompt: message.content, aspectRatio: metadata.aspectRatio, referenceImageUrl: metadata.referenceImageUrl, referenceImageName: metadata.referenceImageName };
    }).filter((message: ImageMessage) => message.role === 'user' || message.role === 'assistant');
    setMessages(restored);
    const latestReference = [...restored].reverse().find((message) => message.referenceImageUrl);
    if (latestReference?.referenceImageUrl) {
      setReferenceImage(latestReference.referenceImageUrl);
      setReferenceImageName(latestReference.referenceImageName || null);
    } else {
      setReferenceImage(null);
      setReferenceImageName(null);
    }
  }

  function handleReferenceUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      window.alert('参考图仅支持 PNG、JPG、JPEG、WebP');
      return;
    }
    if (file.size > MAX_REFERENCE_BYTES) {
      window.alert('参考图不能超过 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setReferenceImage(reader.result);
        setReferenceImageName(file.name);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleGenerate(promptOverride?: string) {
    const prompt = (promptOverride || input).trim();
    if (!prompt || loading) return;
    const userMessage: ImageMessage = { id: `local-${Date.now()}`, role: 'user', prompt, aspectRatio, referenceImageUrl: referenceImage, referenceImageName };
    const assistantId = `local-${Date.now() + 1}`;
    setMessages((current) => [...current, userMessage, { id: assistantId, role: 'assistant', prompt, aspectRatio }]);
    setInput('');
    setLoading(true);

    if (!useRealApi) {
      window.setTimeout(() => {
        setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, imageUrls: ['/placeholder-image.svg'], assetsSaved: false } : message));
        setLoading(false);
      }, 700);
      return;
    }

    try {
      const response = await fetch('/api/ai/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, aspectRatio, referenceImage, referenceImageName, sessionId }),
      });
      const data = await response.json();
      if (data.sessionId) setSessionId(data.sessionId);
      if (!response.ok || data.error) {
        setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, error: data.error || '图片生成失败' } : message));
      } else {
        setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, imageUrls: (data.images || []).map((image: { url: string }) => image.url), assetsSaved: data.assetsSaved, warning: (data.warnings || []).join(' '), aspectRatio: data.aspectRatio } : message));
        if (data.referenceImageUrl) setReferenceImage(data.referenceImageUrl);
        if (typeof data.chargedCredits === 'number' && typeof data.remainingCredits === 'number' && data.chargedCredits > 0) { updateCredits(data.remainingCredits); setCreditNotice(`本次消耗${data.chargedCredits}积分，剩余${data.remainingCredits.toLocaleString()}积分`); }
      }
      setHistoryRevision((value) => value + 1);
    } catch (error: any) {
      setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, error: error.message || '图片生成失败' } : message));
      setHistoryRevision((value) => value + 1);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-0px)] min-h-[560px]">
      <ConversationHistory mode="image" activeSessionId={sessionId} refreshKey={historyRevision} onSelect={loadSession} onCreate={createSession} />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="px-6 py-4 border-b border-border-light flex items-center justify-between gap-3">
          <div className="flex items-center gap-3"><ImageIcon className="w-5 h-5 text-accent-cyan" /><div><h1 className="text-sm font-semibold">AI 做图</h1><p className="text-[11px] text-text-muted">{useRealApi ? '企业图像生成模型 · API 模式' : '演示模式'}</p></div></div>
          <button onClick={() => setUseRealApi((value) => !value)} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all ${useRealApi ? 'bg-success/10 text-success' : 'bg-surface-tertiary text-text-muted'}`}>
            {useRealApi ? <Zap className="w-3.5 h-3.5" /> : <ZapOff className="w-3.5 h-3.5" />}{useRealApi ? 'API 模式' : '演示模式'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 max-w-3xl w-full mx-auto">
          {messages.length === 0 && <div className="text-center py-16"><div className="w-14 h-14 rounded-2xl bg-surface-tertiary flex items-center justify-center mx-auto mb-4"><ImageIcon className="w-7 h-7 text-text-muted" /></div><p className="text-sm text-text-secondary">像和设计助理沟通一样，用自然语言生成企业所需图片。</p></div>}
          {messages.map((message) => (
            <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}>
              {message.role === 'assistant' && <div className="w-7 h-7 rounded-full bg-accent-cyan/10 flex items-center justify-center flex-shrink-0"><ImageIcon className="w-3.5 h-3.5 text-accent-cyan" /></div>}
              <div className={`max-w-[90%] ${message.role === 'user' ? 'bg-text-primary text-white rounded-2xl rounded-tr-md px-4 py-3' : ''}`}>
                {message.role === 'user' ? <><p className="text-sm whitespace-pre-wrap">{message.prompt}</p><span className="inline-block text-[10px] text-white/60 mt-2">比例：{message.aspectRatio || '1:1'}</span>{message.referenceImageUrl && <img src={message.referenceImageUrl} alt={message.referenceImageName || '参考图'} className="mt-3 max-h-40 rounded-xl object-contain bg-white/10" />}</> : message.error ? <div className="bg-danger/5 border border-danger/20 rounded-xl p-4 text-sm text-danger">{message.error}</div> : message.imageUrls?.length ? <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2">{message.imageUrls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="rounded-2xl overflow-hidden bg-surface-secondary border border-border-light"><img src={url} alt="AI 生成图片" className="w-full aspect-square object-cover" /></a>)}</div><div className="flex items-center gap-2 flex-wrap"><span className="text-[11px] text-text-muted">比例：{message.aspectRatio || '1:1'}</span><span className={`text-[11px] ${message.assetsSaved === false ? 'text-warning' : 'text-success'}`}>{message.assetsSaved === false ? '图片已生成，但保存到素材库失败' : '已保存到素材库'}</span><button onClick={() => navigator.clipboard.writeText(message.prompt)} className="text-[11px] text-text-muted hover:text-text-primary inline-flex items-center gap-1"><Copy className="w-3 h-3" />复制提示词</button><button onClick={() => void handleGenerate(message.prompt)} className="text-[11px] text-text-muted hover:text-text-primary inline-flex items-center gap-1"><RefreshCw className="w-3 h-3" />重新生成</button>{message.imageUrls[0] && <a href={message.imageUrls[0]} target="_blank" rel="noreferrer" download className="text-[11px] text-text-muted hover:text-text-primary inline-flex items-center gap-1"><Download className="w-3 h-3" />下载</a>}</div>{message.warning && <p className="text-[11px] text-warning">{message.warning}</p>}</div> : <div className="flex items-center gap-2 text-sm text-text-muted py-2"><Loader2 className="w-4 h-4 animate-spin" />正在生成图片…</div>}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="px-6 py-4 border-t border-border-light">
          <div className="max-w-3xl mx-auto">
            {referenceImage && <div className="flex items-center gap-3 mb-3"><img src={referenceImage} alt={referenceImageName || '参考图'} className="w-12 h-12 rounded-xl object-cover border border-border-light" /><span className="text-xs text-text-secondary truncate flex-1">参考图：{referenceImageName || '已选择'}</span><button onClick={() => { setReferenceImage(null); setReferenceImageName(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="p-1.5 rounded-lg hover:bg-surface-hover text-text-muted" aria-label="删除参考图"><X className="w-4 h-4" /></button></div>}
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleReferenceUpload} className="sr-only" />
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <button onClick={() => fileInputRef.current?.click()} className={`btn-secondary text-xs flex items-center gap-1.5 ${referenceImage ? 'border-accent-cyan/40 text-accent-cyan' : ''}`}>
                <Upload className="w-3.5 h-3.5" /> 上传参考图
              </button>
              <span className={`text-[11px] px-2.5 py-1 rounded-full ${referenceImage ? 'bg-accent-cyan/10 text-accent-cyan' : 'bg-surface-tertiary text-text-muted'}`}>
                {referenceImage ? '参考图生成' : '文生图'}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {ASPECT_RATIOS.map((option) => (
                  <button key={option.value} onClick={() => setAspectRatio(option.value)} className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors ${aspectRatio === option.value ? 'bg-text-primary text-white' : 'bg-surface-secondary text-text-secondary hover:text-text-primary'}`}>
                    {option.value}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 bg-surface-secondary rounded-3xl px-4 py-2 border border-border-light focus-within:border-border-medium"><input type="text" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void handleGenerate()} placeholder={referenceImage ? '描述你想如何参考或改造这张图片...' : '描述你想要生成的图片...'} className="flex-1 bg-transparent text-sm outline-none text-text-primary placeholder:text-text-muted py-1" /><button onClick={() => void handleGenerate()} disabled={loading || !input.trim()} className="w-9 h-9 rounded-full bg-text-primary flex items-center justify-center flex-shrink-0 disabled:opacity-40"><Send className="w-4 h-4 text-white" /></button></div>
            <p className="text-[10px] text-text-muted mt-2 px-1">支持上传 PNG、JPG、JPEG、WebP 参考图（最大 10MB）</p>
            {creditNotice && <p className="text-[11px] text-text-secondary mt-1 px-1">{creditNotice}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
