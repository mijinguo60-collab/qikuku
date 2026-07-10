'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, company, email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '注册失败'); return; }
      router.push('/dashboard');
    } catch { setError('网络错误'); }
    finally { setLoading(false); }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-text-primary mb-2">创建企业空间</h1>
        <p className="text-sm text-text-secondary">开始搭建你的企业 AI 大脑</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div><label className="block text-xs font-medium text-text-secondary mb-1.5">姓名</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-primary" placeholder="你的姓名" required /></div>
        <div><label className="block text-xs font-medium text-text-secondary mb-1.5">企业名称</label>
          <input type="text" value={company} onChange={e => setCompany(e.target.value)} className="input-primary" placeholder="你的企业名称" required /></div>
        <div><label className="block text-xs font-medium text-text-secondary mb-1.5">邮箱</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-primary" placeholder="用于登录" required /></div>
        <div><label className="block text-xs font-medium text-text-secondary mb-1.5">密码</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input-primary" placeholder="至少6位" minLength={6} required /></div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60">
          {loading ? '创建中...' : <>创建企业空间 <ArrowRight className="w-4 h-4" /></>}
        </button>
      </form>
      <p className="mt-6 text-center text-xs text-text-muted">
        已有企业空间？<Link href="/auth/login" className="text-accent-blue hover:underline">登录</Link>
      </p>
    </div>
  );
}
