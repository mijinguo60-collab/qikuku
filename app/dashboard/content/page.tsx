'use client';
import { useState, useRef } from 'react';
import { Send, Copy, Download, Loader2, PenTool, Sparkles } from 'lucide-react';

const CONTENT_TYPES = [
  { id: 'sales-talk', label: '销售话术', icon: '💬', placeholder: '输入产品名称或客户场景，例：客户问抖音代运营效果如何保证？' },
  { id: 'support-reply', label: '客服回复', icon: '🎧', placeholder: '输入客户问题，例：客户投诉拍摄效果不满意怎么办？' },
  { id: 'xiaohongshu', label: '小红书文案', icon: '📕', placeholder: '描述产品/服务，例：诸城最好吃的火锅店探店推荐' },
  { id: 'douyin', label: '抖音脚本', icon: '🎬', placeholder: '描述内容主题，例：15秒探店短视频脚本，突出客流量大' },
  { id: 'livestream', label: '直播话术', icon: '📺', placeholder: '输入直播场景，例：火锅店直播间开场白+逼单话术' },
  { id: 'product-intro', label: '产品介绍', icon: '📋', placeholder: '输入产品名称，例：工厂AI视觉质检系统功能简介' },
  { id: 'recruitment', label: '招聘文案', icon: '👔', placeholder: '输入岗位，例：探店摄影师招聘文案' },
  { id: 'sop', label: 'SOP 流程', icon: '📑', placeholder: '描述业务流程，例：探店拍摄标准操作流程' },
  { id: 'moments', label: '朋友圈文案', icon: '💬', placeholder: '输入主题，例：代运营服务客户案例分享' },
];

export default function ContentPage() {
  const [selectedType, setSelectedType] = useState('sales-talk');
  const [input, setInput] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    if (!input.trim() || loading) return;
    setLoading(true);
    setResult('');

    const typeLabel = CONTENT_TYPES.find(t => t.id === selectedType)?.label || '内容';

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'knowledge',
          featureType: 'content_generation',
          messages: [
            { role: 'system', content: `你是企库库内容生成助手。请基于企业知识库资料，为用户生成${typeLabel}。要求：专业、可执行、贴合企业实际。不要编造不存在的信息。` },
            { role: 'user', content: `请生成${typeLabel}：${input}` },
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

  function handleCopy() { navigator.clipboard.writeText(result); }

  return (
    <div className="p-8 max-w-5xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary mb-1">内容生成</h1>
        <p className="text-sm text-text-secondary">基于企业知识库和 AI，生成各类企业所需文字内容</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Sidebar: content types */}
        <div className="space-y-1">
          {CONTENT_TYPES.map(t => (
            <button
              key={t.id}
              onClick={() => setSelectedType(t.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all ${
                selectedType === t.id
                  ? 'bg-text-primary text-white shadow-light'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-secondary'
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Main: input + result */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-text-primary mb-3">
              {CONTENT_TYPES.find(t => t.id === selectedType)?.icon} {CONTENT_TYPES.find(t => t.id === selectedType)?.label}
            </h2>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={CONTENT_TYPES.find(t => t.id === selectedType)?.placeholder}
              className="input-primary min-h-[100px] resize-none"
              rows={4}
            />
            <div className="flex justify-end mt-3">
              <button
                onClick={handleGenerate}
                disabled={loading || !input.trim()}
                className="btn-primary text-sm flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {loading ? '生成中...' : 'AI 生成'}
              </button>
            </div>
          </div>

          {result && (
            <div className="card p-6 animate-slide-up">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-text-primary">生成结果</h3>
                <div className="flex items-center gap-1">
                  <button onClick={handleCopy} className="p-2 rounded-lg hover:bg-surface-hover text-text-muted">
                    <Copy className="w-4 h-4" />
                  </button>
                  <button className="p-2 rounded-lg hover:bg-surface-hover text-text-muted">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
                {result}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
