'use client';
import { useState } from 'react';
import { GraduationCap, BookOpen, CheckCircle, Clock, ChevronRight, Sparkles, Loader2 } from 'lucide-react';
import { useCreditBalance } from '@/hooks/useCreditBalance';

const ROLES = [
  { id: 'sales', label: '销售', icon: '💼' },
  { id: 'support', label: '客服', icon: '🎧' },
  { id: 'operations', label: '运营', icon: '📊' },
  { id: 'editor', label: '剪辑', icon: '🎬' },
  { id: 'livestream', label: '直播', icon: '📺' },
  { id: 'explorer', label: '探店人员', icon: '🔍' },
  { id: 'manager', label: '管理层', icon: '👔' },
];

interface Module { title: string; content: string; }

export default function TrainingPage() {
  const [selectedRole, setSelectedRole] = useState('sales');
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(false);
  const { updateCredits } = useCreditBalance();

  async function handleGenerate() {
    setLoading(true);
    setModules([]);
    const roleName = ROLES.find(r => r.id === selectedRole)?.label || '员工';
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'knowledge',
          featureType: 'training_plan',
          messages: [
            { role: 'system', content: `你是企业培训课程生成助手。基于企业知识库资料，为新员工生成${roleName}岗位的培训课程。请输出5个培训模块，每个模块包含标题和要点说明（每点不超过100字）。用以下格式：\n\n模块一：标题\n内容...\n\n模块二：标题\n内容...` },
            { role: 'user', content: `请生成${roleName}岗位新员工培训课程` },
          ],
        }),
      });
      const data = await res.json();
      if (data.chargedCredits > 0 && typeof data.remainingCredits === 'number') updateCredits(data.remainingCredits);
      const text = data.answer || data.error || '';
      // Parse modules
      const parsed: string[] = text.split(/模块[一二三四五六七八九十]+[：:]/g).filter(Boolean);
      if (parsed.length > 0) {
        const titles = text.match(/模块[一二三四五六七八九十]+[：:]\s*(.+)/g) || [];
        setModules(parsed.map((content, i) => ({
          title: titles[i]?.replace(/模块[一二三四五六七八九十]+[：:]\s*/, '') || `模块 ${i + 1}`,
          content: content.trim(),
        })));
      } else {
        setModules([{ title: '培训课程', content: text }]);
      }
    } catch (e: any) {
      setModules([{ title: '错误', content: e.message }]);
    }
    setLoading(false);
  }

  return (
    <div className="p-8 max-w-5xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary mb-1">员工培训</h1>
        <p className="text-sm text-text-secondary">基于企业知识库，AI 生成各岗位培训课程和学习路径</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-text-muted uppercase mb-3">选择岗位</h3>
          {ROLES.map(r => (
            <button
              key={r.id}
              onClick={() => setSelectedRole(r.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all ${
                selectedRole === r.id
                  ? 'bg-text-primary text-white shadow-light'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-secondary'
              }`}
            >
              <span>{r.icon}</span> {r.label}
            </button>
          ))}
          <div className="pt-4">
            <button onClick={handleGenerate} disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 text-sm">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? '生成中...' : '生成培训课程'}
            </button>
          </div>
        </div>

        <div className="lg:col-span-2">
          {modules.length === 0 && !loading && (
            <div className="text-center py-16 card">
              <GraduationCap className="w-12 h-12 text-text-muted mx-auto mb-4" />
              <p className="text-text-secondary">选择一个岗位，然后点击「生成培训课程」</p>
              <p className="text-xs text-text-muted mt-1">AI 会基于企业知识库自动生成培训内容</p>
            </div>
          )}

          {loading && (
            <div className="card p-12 text-center">
              <Loader2 className="w-8 h-8 text-accent-blue animate-spin mx-auto mb-4" />
              <p className="text-sm text-text-secondary">AI 正在生成培训课程...</p>
            </div>
          )}

          {modules.map((mod, i) => (
            <div key={i} className="card p-5 mb-3 animate-slide-up" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-accent-blue/10 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-accent-blue" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">{mod.title}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Clock className="w-3 h-3 text-text-muted" />
                    <span className="text-[10px] text-text-muted">估算学习时长: 30分钟</span>
                  </div>
                </div>
              </div>
              <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap pl-11">
                {mod.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
