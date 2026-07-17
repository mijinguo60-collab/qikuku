'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Brain, CheckCircle2, Database, Image, Loader2, ShieldCheck, Sparkles } from 'lucide-react';

interface ProviderStatus {
  id: 'language' | 'openai' | 'gemini' | 'image' | 'image-edit' | 'embedding';
  title: string;
  description: string;
  configured: boolean;
}

const providerIcons = { language: Brain, openai: Brain, gemini: Sparkles, image: Image, 'image-edit': Image, embedding: Database };
const providerColors = {
  language: 'bg-accent-blue/10 text-accent-blue',
  openai: 'bg-accent-blue/10 text-accent-blue',
  gemini: 'bg-accent-purple/10 text-accent-purple',
  image: 'bg-accent-cyan/10 text-accent-cyan',
  'image-edit': 'bg-accent-cyan/10 text-accent-cyan',
  embedding: 'bg-accent-purple/10 text-accent-purple',
};

export default function ModelsStatusPage() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/ai/models');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '读取平台模型状态失败');
        setProviders(data.providers || []);
      } catch (requestError: any) {
        setError(requestError.message || '读取平台模型状态失败');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="p-8 max-w-3xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary mb-2">平台模型状态</h1>
        <p className="text-sm text-text-secondary">语言、图片与知识库向量模型均由平台在服务端统一维护，企业成员无需配置或管理 API Key。</p>
      </div>

      <div className="card p-4 mb-6 flex gap-3 bg-surface-secondary">
        <ShieldCheck className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
        <p className="text-sm text-text-secondary leading-relaxed">为保障安全与稳定性，当前页面仅展示模型能力是否可用，不展示具体模型名称、API Key 或完整服务地址。</p>
      </div>

      {loading ? (
        <div className="card p-12 text-center"><Loader2 className="w-5 h-5 animate-spin text-text-muted mx-auto" /></div>
      ) : error ? (
        <div className="card p-6 flex items-center gap-3 text-danger"><AlertCircle className="w-5 h-5" /><span className="text-sm">{error}</span></div>
      ) : (
        <div className="space-y-4">
          {providers.map((provider) => {
            const Icon = providerIcons[provider.id];
            return (
              <div key={provider.id} className="card p-5 flex items-center justify-between gap-5">
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${providerColors[provider.id]}`}><Icon className="w-5 h-5" /></div>
                  <div><h2 className="text-sm font-semibold text-text-primary">{provider.title}</h2><p className="text-xs text-text-muted mt-1">{provider.description}</p></div>
                </div>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${provider.configured ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                  {provider.configured ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                  {provider.configured ? '已由平台统一配置' : '未配置'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
