'use client';
import { useState } from 'react';
import { Brain, Image, Database, Eye, EyeOff, Check, AlertCircle, Loader2 } from 'lucide-react';

export default function ModelsConfigPage() {
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, { ok: boolean; msg: string } | null>>({});

  const toggleKey = (id: string) => setShowKeys(prev => ({ ...prev, [id]: !prev[id] }));

  async function testConnection(provider: string, apiKey: string, baseUrl: string, model: string) {
    setTesting(prev => ({ ...prev, [provider]: true }));
    setResults(prev => ({ ...prev, [provider]: null }));
    try {
      const res = await fetch('/api/ai/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey, baseUrl, model }),
      });
      const data = await res.json();
      setResults(prev => ({ ...prev, [provider]: data }));
    } catch (e: any) {
      setResults(prev => ({ ...prev, [provider]: { ok: false, msg: '请求失败: ' + e.message } }));
    }
    setTesting(prev => ({ ...prev, [provider]: false }));
  }

  const modelConfigs = [
    {
      id: 'language', icon: Brain, title: '语言模型配置', subtitle: 'DeepSeek / OpenAI 兼容格式',
      color: 'bg-accent-blue/10', iconColor: 'text-accent-blue',
      defaultModel: 'deepseek-v4-flash',
      defaultBaseUrl: 'https://api.deepseek.com',
    },
    {
      id: 'image', icon: Image, title: '图片模型配置', subtitle: 'DALL·E / 兼容格式',
      color: 'bg-accent-cyan/10', iconColor: 'text-accent-cyan',
      defaultModel: 'gpt-image-2',
      defaultBaseUrl: 'https://zweb.01yq888.com',
    },
    {
      id: 'embedding', icon: Database, title: 'Embedding 模型配置', subtitle: '向量检索模型',
      color: 'bg-accent-purple/10', iconColor: 'text-accent-purple',
      defaultModel: 'text-embedding-v3',
      defaultBaseUrl: 'https://ws-7cmhjpa3pf9c7n8y.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    },
  ];

  return (
    <div className="p-8 max-w-3xl mx-auto animate-fade-in">
      <h1 className="text-2xl font-bold text-text-primary mb-2">模型配置</h1>
      <p className="text-sm text-text-secondary mb-8">配置 AI 模型的 API 连接信息。密钥服务端加密存储，前端不暴露。</p>

      {modelConfigs.map(m => (
        <div key={m.id} className="card p-6 mb-6">
          <div className="flex items-center gap-3 mb-5">
            <div className={`w-9 h-9 rounded-xl ${m.color} flex items-center justify-center`}>
              <m.icon className={`w-5 h-5 ${m.iconColor}`} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">{m.title}</h2>
              <p className="text-[11px] text-text-muted">{m.subtitle}</p>
            </div>
          </div>
          <ModelForm
            id={m.id}
            defaultBaseUrl={m.defaultBaseUrl}
            defaultModel={m.defaultModel}
            showKey={showKeys[m.id] || false}
            onToggleKey={() => toggleKey(m.id)}
            testing={testing[m.id] || false}
            result={results[m.id] || null}
            onTest={(apiKey, baseUrl, model) => testConnection(m.id, apiKey, baseUrl, model)}
          />
        </div>
      ))}
    </div>
  );
}

function ModelForm({
  id, defaultBaseUrl, defaultModel, showKey, onToggleKey, testing, result, onTest,
}: {
  id: string;
  defaultBaseUrl: string;
  defaultModel: string;
  showKey: boolean;
  onToggleKey: () => void;
  testing: boolean;
  result: { ok: boolean; msg: string } | null;
  onTest: (apiKey: string, baseUrl: string, model: string) => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl);
  const [model, setModel] = useState(defaultModel);

  function handleTest() {
    onTest(apiKey, baseUrl, model);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-medium text-text-muted mb-1">服务商</label>
          <select className="input-primary text-sm">
            <option>{id === 'language' ? 'DeepSeek' : id === 'image' ? 'OpenAI' : '阿里云'}</option>
            <option>自定义</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-text-muted mb-1">模型名称</label>
          <input className="input-primary text-sm" value={model} onChange={e => setModel(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="block text-[11px] font-medium text-text-muted mb-1">API Base URL</label>
        <input className="input-primary text-sm" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
      </div>
      <div>
        <label className="block text-[11px] font-medium text-text-muted mb-1">API Key</label>
        <div className="relative">
          <input type={showKey ? 'text' : 'password'} className="input-primary pr-10 text-sm" value={apiKey} onChange={e => setApiKey(e.target.value)} />
          <button onClick={onToggleKey} className="absolute right-3 top-1/2 -translate-y-1/2">
            {showKey ? <EyeOff className="w-4 h-4 text-text-muted" /> : <Eye className="w-4 h-4 text-text-muted" />}
          </button>
        </div>
        <p className="text-[10px] text-text-muted mt-1">密钥已服务端加密保存 · 保存后前端不展示明文</p>
      </div>
      {id === 'language' && (
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" defaultChecked className="rounded accent-text-primary" />
            <span className="text-xs text-text-secondary">开启流式输出</span>
          </label>
        </div>
      )}
      {id === 'image' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-medium text-text-muted mb-1">默认尺寸</label>
            <select className="input-primary text-sm" defaultValue="1024x1024">
              <option value="1024x1024">正方形 1:1 (1024x1024)</option>
              <option value="1024x1792">竖版海报 9:16 (1024x1792)</option>
              <option value="1792x1024">横版封面 16:9 (1792x1024)</option>
            </select>
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer pt-5">
              <input type="checkbox" defaultChecked className="rounded accent-text-primary" />
              <span className="text-xs text-text-secondary">支持图片编辑</span>
            </label>
          </div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button onClick={handleTest} disabled={testing || !apiKey || !baseUrl || !model}
          className="btn-secondary text-sm flex items-center gap-2 disabled:opacity-50">
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : null} 测试连接
        </button>
        {result && (
          <span className={`text-xs flex items-center gap-1 ${result.ok ? 'text-success' : 'text-danger'}`}>
            {result.ok ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            {result.msg}
          </span>
        )}
      </div>
      <div className="flex justify-end">
        <button className="btn-primary text-sm" disabled={!apiKey && !baseUrl}>
          保存配置
        </button>
      </div>
    </div>
  );
}
