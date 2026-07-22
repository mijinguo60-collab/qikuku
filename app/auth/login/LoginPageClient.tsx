'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Phone } from 'lucide-react';

const mainlandPhone = /^1[3-9]\d{9}$/;

export default function LoginPageClient() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!mainlandPhone.test(phone) || !password) return setError('请输入手机号和密码');
    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password, rememberMe }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (data?.code === 'PASSWORD_NOT_SET') router.push('/auth/forgot-password');
        else setError(data?.error || '登录失败，请稍后重试');
        return;
      }
      router.replace(data?.redirect || '/dashboard');
      router.refresh();
    } catch {
      setError('网络异常，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-blue/10 text-accent-blue"><LockKeyhole className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-text-primary">登录企库库</h1>
        <p className="mt-2 text-sm text-text-secondary">使用已注册的手机号和密码登录企业工作台</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-xs font-medium text-text-secondary">手机号</label>
        <div className="relative -mt-2"><Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" /><span className="absolute left-10 top-1/2 -translate-y-1/2 border-r border-border-light pr-2 text-sm text-text-secondary">+86</span><input className="input-primary pl-20" inputMode="numeric" autoComplete="tel-national" maxLength={11} placeholder="请输入中国大陆手机号" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))} /></div>
        <label className="block text-xs font-medium text-text-secondary">密码</label>
        <div className="relative -mt-2">
          <input className="input-primary pr-11" type={showPassword ? 'text' : 'password'} autoComplete="current-password" maxLength={128} placeholder="请输入登录密码" value={password} onChange={(event) => setPassword(event.target.value)} />
          <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" aria-label={showPassword ? '隐藏密码' : '显示密码'}>
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex items-center justify-between text-xs"><label className="flex items-center gap-2 text-text-secondary"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />30 天内保持登录</label><Link className="text-accent-blue" href="/auth/forgot-password">忘记密码</Link></div>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <button type="submit" disabled={submitting} className="btn-primary flex w-full items-center justify-center gap-2 rounded-xl py-3 disabled:opacity-60">{submitting ? '登录中…' : <>登录 <ArrowRight className="h-4 w-4" /></>}</button>
      </form>
      <p className="mt-6 text-center text-sm text-text-secondary">还没有企业账号？ <Link className="font-medium text-accent-blue" href="/auth/register">立即注册</Link></p>
      <p className="mt-4 text-center text-xs text-text-muted">微信登录暂未开放</p>
    </div>
  );
}
