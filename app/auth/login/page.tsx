'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, Phone } from 'lucide-react';

const mainlandPhone = /^1[3-9]\d{9}$/;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'account' | 'phone'>('account');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [sending, setSending] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!countdown) return;
    const timer = window.setInterval(() => setCountdown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  function switchMode(nextMode: 'account' | 'phone') {
    setMode(nextMode);
    setError('');
  }

  async function sendCode() {
    setError('');
    if (!mainlandPhone.test(phone)) return setError('请输入有效的中国大陆手机号');
    if (!agreed) return setError('请先阅读并同意用户协议与隐私政策');
    setSending(true);
    try {
      const response = await fetch('/api/auth/sms/send-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, purpose: 'LOGIN' }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) return setError(data?.error || '短信暂时发送失败');
      setCountdown(60);
    } catch { setError('网络异常，请稍后重试'); }
    finally { setSending(false); }
  }

  async function phoneSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!agreed) return setError('请先阅读并同意用户协议与隐私政策');
    if (!mainlandPhone.test(phone) || !/^\d{6}$/.test(code)) return setError('请输入手机号和6位验证码');
    setLoggingIn(true);
    try {
      const response = await fetch('/api/auth/sms/verify-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, code, purpose: 'LOGIN' }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) return setError(data?.error || '登录失败');
      router.replace(data?.redirect || '/dashboard');
      router.refresh();
    } catch { setError('网络异常，请稍后重试'); }
    finally { setLoggingIn(false); }
  }

  async function accountSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoggingIn(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) return setError(data?.error || '登录失败');
      router.replace('/dashboard');
      router.refresh();
    } catch { setError('网络异常，请稍后重试'); }
    finally { setLoggingIn(false); }
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-blue/10 text-accent-blue"><LockKeyhole className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-text-primary">欢迎使用企库库</h1>
        <p className="mt-2 text-sm text-text-secondary">登录你的企业 AI 工作空间</p>
      </div>

      <div className="mb-6 grid grid-cols-2 border-b border-border-light" role="tablist" aria-label="登录方式">
        <button type="button" role="tab" aria-selected={mode === 'account'} onClick={() => switchMode('account')} className={`border-b-2 px-3 py-3 text-sm font-medium ${mode === 'account' ? 'border-accent-blue text-accent-blue' : 'border-transparent text-text-muted'}`}>账号登录</button>
        <button type="button" role="tab" aria-selected={mode === 'phone'} onClick={() => switchMode('phone')} className={`border-b-2 px-3 py-3 text-sm font-medium ${mode === 'phone' ? 'border-accent-blue text-accent-blue' : 'border-transparent text-text-muted'}`}>手机号登录</button>
      </div>

      {mode === 'phone' ? (
        <form onSubmit={phoneSubmit} className="space-y-4">
          <label className="block text-xs font-medium text-text-secondary">手机号</label>
          <div className="relative -mt-2"><Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" /><span className="absolute left-10 top-1/2 -translate-y-1/2 border-r border-border-light pr-2 text-sm text-text-secondary">+86</span><input className="input-primary pl-20" inputMode="numeric" autoComplete="tel-national" maxLength={11} placeholder="请输入中国大陆手机号" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))} /></div>
          <label className="block text-xs font-medium text-text-secondary">短信验证码</label>
          <div className="relative -mt-2"><input className="input-primary pr-28" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="请输入6位验证码" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} /><button type="button" onClick={sendCode} disabled={sending || countdown > 0 || !mainlandPhone.test(phone)} className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1.5 text-xs font-medium text-accent-blue disabled:text-text-muted">{countdown ? `${countdown}s 后重试` : sending ? '发送中' : '获取验证码'}</button></div>
          <label className="flex items-start gap-2 text-xs text-text-secondary"><input type="checkbox" className="mt-0.5" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /><span>我已阅读并同意 <Link href="/terms" className="text-accent-blue">用户协议</Link> 与 <Link href="/privacy" className="text-accent-blue">隐私政策</Link></span></label>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <button type="submit" disabled={loggingIn} className="btn-primary flex w-full items-center justify-center gap-2 rounded-xl py-3 disabled:opacity-60">{loggingIn ? '验证中' : <>登录 <ArrowRight className="h-4 w-4" /></>}</button>
        </form>
      ) : (
        <form onSubmit={accountSubmit} className="space-y-4">
          <label className="block text-xs font-medium text-text-secondary">邮箱</label>
          <div className="relative -mt-2"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" /><input className="input-primary pl-10" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
          <label className="block text-xs font-medium text-text-secondary">密码</label>
          <div className="relative -mt-2"><input className="input-primary pr-10" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" aria-label={showPassword ? '隐藏密码' : '显示密码'} className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff className="h-4 w-4 text-text-muted" /> : <Eye className="h-4 w-4 text-text-muted" />}</button></div>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <button type="submit" disabled={loggingIn} className="btn-primary flex w-full items-center justify-center gap-2 rounded-xl py-3 disabled:opacity-60">{loggingIn ? '登录中' : <>账号登录 <ArrowRight className="h-4 w-4" /></>}</button>
        </form>
      )}
    </div>
  );
}
