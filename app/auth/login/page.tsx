'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [showPw, setShowPw] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '登录失败'); return; }
      router.push('/dashboard');
    } catch { setError('网络错误'); }
    finally { setLoading(false); }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-text-primary mb-2">欢迎回来</h1>
        <p className="text-sm text-text-secondary">登录你的企库库企业空间</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">邮箱</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            className="input-primary" placeholder="admin@zhucheng.com" required />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">密码</label>
          <div className="relative">
            <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
              className="input-primary pr-10" placeholder="输入密码" required />
            <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2">
              {showPw ? <EyeOff className="w-4 h-4 text-text-muted" /> : <Eye className="w-4 h-4 text-text-muted" />}
            </button>
          </div>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <button type="submit" disabled={loading}
          className="btn-primary w-full py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60">
          {loading ? '登录中...' : <>登录 <ArrowRight className="w-4 h-4" /></>}
        </button>
      </form>
      <p className="mt-6 text-center text-xs text-text-muted">
        还没有企业空间？<Link href="/auth/register" className="text-accent-blue hover:underline">创建企业空间</Link>
      </p>
      <div className="mt-8 p-4 rounded-2xl bg-surface-tertiary">
        <p className="text-[11px] text-text-muted mb-2">演示账号</p>
        <p className="text-xs text-text-secondary">admin@zhucheng.com / 123456</p>
      </div>
    </div>
  );
}
