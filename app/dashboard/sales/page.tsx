'use client';
import { useState, useRef } from 'react';
import { Send, Copy, Loader2, TrendingUp, MessageSquare, Zap } from 'lucide-react';

const QUICK_QUESTIONS = [
  { q: '客户嫌贵怎么回复？', category: '异议处理' },
  { q: '客户说考虑一下，怎么跟进？', category: '跟进话术' },
  { q: '怎么介绍我们的核心优势？', category: '价值介绍' },
  { q: '怎么把客户引导到成交？', category: '成交技巧' },
  { q: '怎么发微信跟进客户？', category: '微信跟进' },
  { q: '客户说别人家更便宜怎么应对？', category: '竞品应对' },
  { q: '怎么向客户解释我们的报价？', category: '报价解释' },
  { q: '怎么快速建立与客户的信任？', category: '信任建设' },
];

export default function SalesPage() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleAsk(question?: string) {
    const q = question || input.trim();
    if (!q || loading) return;
    setLoading(true);
    setResult('');
    if (!question) setInput('');
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'knowledge',
          messages: [
            { role: 'system', content: '你是企业销售AI助手。基于企业知识库中的产品资料、销售话术、报价体系和客户案例，为销售人员提供专业、可执行的回复建议。回复需包含：具体话术模板、关键要点、注意事项。' },
            { role: 'user', content: q },
          ],
        }),
      });
      const data = await res.json();
      setResult(data.answer || data.error || '未返回内容');
    } catch (e: any) {
      setResult('请求失败: ' + e.message);
    }
    setLoading(false);
  }

  return (
    <div className="p-8 max-w-5xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary mb-1">销售助手</h1>
        <p className="text-sm text-text-secondary">基于企业知识库和 AI，为销售人员提供实时的客户沟通建议</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="space-y-6">
          <div>
            <h3 className="text-xs font-semibold text-text-muted uppercase mb-3">快捷问题</h3>
            <div className="space-y-1">
              {QUICK_QUESTIONS.map((item, i) => (
                <button
                  key={i}
                  onClick={() => handleAsk(item.q)}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-text-secondary hover:text-text-primary hover:bg-surface-secondary transition-all"
                >
                  <span className="font-medium text-text-primary block">{item.q}</span>
                  <span className="text-[10px] text-text-muted">{item.category}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-text-primary mb-3">
              <MessageSquare className="w-4 h-4 inline mr-1" /> AI 销售建议
            </h2>
            <div className="flex items-center gap-2 bg-surface-secondary rounded-2xl px-4 py-2 border border-border-light">
              <input
                type="text" value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAsk()}
                placeholder="输入客户问题或销售场景..."
                className="flex-1 bg-transparent text-sm outline-none text-text-primary py-1"
              />
              <button onClick={() => handleAsk()} disabled={loading || !input.trim()}
                className="w-9 h-9 rounded-full bg-text-primary flex items-center justify-center disabled:opacity-40">
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {loading && (
            <div className="card p-8 text-center">
              <Loader2 className="w-6 h-6 text-accent-blue animate-spin mx-auto mb-2" />
              <p className="text-sm text-text-secondary">AI 正在分析客户问题...</p>
            </div>
          )}

          {result && (
            <div className="card p-6 animate-slide-up">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                  <Zap className="w-4 h-4 text-accent-blue" /> AI 销售建议
                </h3>
                <button onClick={() => navigator.clipboard.writeText(result)}
                  className="p-2 rounded-lg hover:bg-surface-hover text-text-muted">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{result}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
