'use client';
import { useState } from 'react';
import { Send, Copy, Loader2, Headphones, MessageSquare, AlertCircle, FileText } from 'lucide-react';

const FAQ_ITEMS = [
  { q: '我们的代运营服务包含哪些内容？', cat: '服务内容' },
  { q: '客户投诉拍摄效果不满意怎么处理？', cat: '投诉处理' },
  { q: '合同到期前如何提醒客户续约？', cat: '客户维护' },
  { q: '客户要求退款怎么处理？', cat: '退款处理' },
  { q: '怎么向客户解释拍摄排期延迟？', cat: '排期沟通' },
  { q: '新客户第一次合作需要注意什么？', cat: '新客指引' },
  { q: '客户对数据报告不理解怎么解释？', cat: '数据解释' },
  { q: '突发事件（如天气原因）导致无法拍摄怎么沟通？', cat: '应急处理' },
];

export default function SupportPage() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleAsk(question?: string) {
    const q = question || input.trim();
    if (!q || loading) return;
    setLoading(true); setResult(''); if (!question) setInput('');
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'knowledge',
          featureType: 'support_assistant',
          messages: [
            { role: 'system', content: '你是企业客服AI助手。基于企业知识库中的FAQ、售后政策、服务标准和客户案例，为客服人员提供专业、温暖、解决问题的回复建议。回复格式：1. 标准话术 2. 注意事项 3. 升级建议（如果需要升级处理）。' },
            { role: 'user', content: q },
          ],
        }),
      });
      const data = await res.json();
      setResult(data.answer || data.error || '未返回内容');
    } catch (e: any) { setResult('请求失败: ' + e.message); }
    setLoading(false);
  }

  return (
    <div className="p-8 max-w-5xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary mb-1">客服助手</h1>
        <p className="text-sm text-text-secondary">基于企业知识库和 AI，为客服团队提供标准的 FAQ 应答和专业回复</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="space-y-6">
          <div>
            <h3 className="text-xs font-semibold text-text-muted uppercase mb-3">常见问题</h3>
            <div className="space-y-1">
              {FAQ_ITEMS.map((item, i) => (
                <button key={i} onClick={() => handleAsk(item.q)}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-text-secondary hover:text-text-primary hover:bg-surface-secondary transition-all">
                  <span className="font-medium text-text-primary block">{item.q}</span>
                  <span className="text-[10px] text-text-muted">{item.cat}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="card p-4 bg-warning/5 border border-warning/10 rounded-2xl">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-warning mb-1">AI 客服建议说明</p>
                <p className="text-[11px] text-text-muted leading-relaxed">
                  AI 回答基于企业知识库。涉及法律、合同、赔偿等敏感内容，请以企业正式文件为准，必要时升级至主管处理。
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-text-primary mb-3">
              <Headphones className="w-4 h-4 inline mr-1" /> AI 客服建议
            </h2>
            <div className="flex items-center gap-2 bg-surface-secondary rounded-2xl px-4 py-2 border border-border-light">
              <input type="text" value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAsk()}
                placeholder="输入客户问题或客服场景..." className="flex-1 bg-transparent text-sm outline-none text-text-primary py-1" />
              <button onClick={() => handleAsk()} disabled={loading || !input.trim()}
                className="w-9 h-9 rounded-full bg-text-primary flex items-center justify-center disabled:opacity-40">
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {loading && (
            <div className="card p-8 text-center">
              <Loader2 className="w-6 h-6 text-accent-blue animate-spin mx-auto mb-2" />
              <p className="text-sm text-text-secondary">AI 正在生成客服回复...</p>
            </div>
          )}
          {result && (
            <div className="card p-6 animate-slide-up">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-accent-purple" /> AI 客服建议
                </h3>
                <button onClick={() => navigator.clipboard.writeText(result)}
                  className="p-2 rounded-lg hover:bg-surface-hover text-text-muted"><Copy className="w-4 h-4" /></button>
              </div>
              <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{result}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
