'use client';
import { useState, useRef, useEffect } from 'react';
import { Send, Image, Download, Copy, Trash2, Upload, RefreshCw, Maximize2, Zap, ZapOff, Loader2 } from 'lucide-react';

const SIZE_OPTIONS = [
  { label: '正方形 1:1', value: '1024x1024' },
  { label: '横版封面 16:9', value: '1792x1024' },
  { label: '竖版海报 9:16', value: '1024x1792' },
];

interface ImageMsg {
  id: string; role: 'user' | 'assistant'; prompt: string; imageUrl?: string; error?: string;
}

export default function ImagesPage() {
  const [messages, setMessages] = useState<ImageMsg[]>([]);
  const [input, setInput] = useState('');
  const [selectedSize, setSelectedSize] = useState('1024x1024');
  const [loading, setLoading] = useState(false);
  const [useRealApi, setUseRealApi] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function handleGenerate() {
    if (!input.trim() || loading) return;
    const userMsg: ImageMsg = { id: Date.now().toString(), role: 'user', prompt: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', prompt: input.trim() }]);

    if (!useRealApi) {
      setTimeout(() => {
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, imageUrl: '/placeholder-image.svg' } : m));
        setLoading(false);
      }, 2000);
      return;
    }

    try {
      const res = await fetch('/api/ai/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: input.trim(), size: selectedSize }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, error: data.error } : m));
      } else if (data.imageUrls?.length > 0) {
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, imageUrl: data.imageUrls[0] } : m));
      } else {
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, error: '未返回图片' } : m));
      }
    } catch (e: any) {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, error: e.message } : m));
    }
    setLoading(false);
  }

  function handleCopy(text: string) { navigator.clipboard.writeText(text); }

  if (messages.length === 0) {
    return (
      <div className="flex h-[calc(100vh-0px)] items-center justify-center">
        <div className="text-center max-w-lg p-8">
          <div className="w-16 h-16 rounded-2xl bg-surface-tertiary flex items-center justify-center mx-auto mb-6">
            <Image className="w-8 h-8 text-text-muted" />
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-3">企业版 AI 做图</h2>
          <p className="text-sm text-text-secondary mb-8 leading-relaxed">
            像使用 ChatGPT Image 一样，用自然语言描述你想要的设计。支持文生图和多轮修改。
          </p>
          <button
            onClick={() => { setInput('做一张企库库官网宣传图，纯白背景，Apple 风格，高级极简，中心是企业 AI 大脑抽象视觉，蓝紫色轻微点缀，16:9'); handleGenerate(); }}
            className="text-left w-full px-4 py-3 rounded-xl bg-surface-secondary hover:bg-surface-hover transition-all text-sm text-text-secondary mb-6">
            "做一张企库库官网宣传图，纯白背景，Apple 风格..."
          </button>
          <div className="flex items-center gap-2 bg-surface-secondary rounded-3xl px-4 py-2 border border-border-light">
            <button className="w-8 h-8 rounded-full bg-white border border-border-light flex items-center justify-center flex-shrink-0"><Upload className="w-3.5 h-3.5 text-text-muted" /></button>
            <input type="text" value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
              placeholder="描述你想要生成的图片..."
              className="flex-1 bg-transparent text-sm outline-none text-text-primary placeholder:text-text-muted py-1" />
            <button onClick={handleGenerate} disabled={!input.trim()}
              className="w-9 h-9 rounded-full bg-text-primary flex items-center justify-center disabled:opacity-40">
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-0px)]">
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
        <div className="px-6 py-4 border-b border-border-light flex items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <Image className="w-5 h-5 text-accent-cyan" />
            <div>
              <h2 className="text-sm font-semibold">AI 做图</h2>
              <p className="text-[11px] text-text-muted">
                {useRealApi ? 'gpt-image-2 API' : '演示模式'}
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
            {useRealApi ? 'API 模式' : 'Demo 模式'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-accent-cyan/10 flex items-center justify-center flex-shrink-0">
                  <Image className="w-3.5 h-3.5 text-accent-cyan" />
                </div>
              )}
              <div className={`max-w-[85%] ${msg.role === 'user' ? 'bg-text-primary text-white rounded-2xl rounded-tr-md px-4 py-2.5' : ''}`}>
                {msg.role === 'user' ? (
                  <p className="text-sm">{msg.prompt}</p>
                ) : (
                  <div>
                    {msg.error ? (
                      <div className="bg-danger/5 border border-danger/20 rounded-xl p-4">
                        <p className="text-sm text-danger">{msg.error}</p>
                      </div>
                    ) : msg.imageUrl ? (
                      <div className="space-y-2">
                        <div className="rounded-2xl overflow-hidden bg-surface-secondary border border-border-light">
                          <img src={msg.imageUrl} alt={msg.prompt.slice(0, 50)} className="w-full" style={{ maxHeight: '400px', objectFit: 'contain' }} />
                        </div>
                        <div className="flex items-center gap-1 flex-wrap">
                          {[
                            { icon: Download, label: '下载' }, { icon: Copy, label: '复制提示词' },
                            { icon: RefreshCw, label: '继续编辑' }, { icon: Maximize2, label: '放大' },
                            { icon: Trash2, label: '删除' },
                          ].map(a => (
                            <button key={a.label}
                              onClick={() => a.label === '复制提示词' ? handleCopy(msg.prompt) : undefined}
                              className="flex items-center gap-1 px-2 py-1 text-[10px] text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors">
                              <a.icon className="w-3 h-3" /> {a.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-text-muted py-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> 正在生成...
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-accent-cyan/10 flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-accent-cyan animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="px-6 py-4 border-t border-border-light">
          <div className="flex items-center gap-2 bg-surface-secondary rounded-3xl px-4 py-2 border border-border-light">
            <button className="w-8 h-8 rounded-full bg-white border border-border-light flex items-center justify-center flex-shrink-0 hover:bg-surface-hover">
              <Upload className="w-3.5 h-3.5 text-text-muted" />
            </button>
            <input type="text" value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
              placeholder="描述你想要生成或修改的内容..."
              className="flex-1 bg-transparent text-sm outline-none text-text-primary placeholder:text-text-muted py-1" />
            <button onClick={handleGenerate} disabled={loading || !input.trim()}
              className="w-9 h-9 rounded-full bg-text-primary flex items-center justify-center flex-shrink-0 disabled:opacity-40">
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
          <div className="flex items-center gap-3 mt-2 px-1">
            <select value={selectedSize} onChange={e => setSelectedSize(e.target.value)}
              className="text-[10px] bg-transparent text-text-muted outline-none">
              {SIZE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <span className="text-[10px] text-text-muted">gpt-image-2</span>
          </div>
        </div>
      </div>
    </div>
  );
}
