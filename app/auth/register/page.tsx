'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const mainlandPhone = /^1[3-9]\d{9}$/;

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [personalName, setPersonalName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { if (!countdown) return; const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer); }, [countdown]);

  async function sendCode() {
    setError(''); setMessage('');
    if (!mainlandPhone.test(phone)) return setError('请输入有效的中国大陆手机号');
    setSending(true);
    try {
      const response = await fetch('/api/auth/sms/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) return setError(data?.error || '短信暂时发送失败');
      setCountdown(60); setMessage('验证码已发送，请查收短信。');
    } catch { setError('网络异常，请稍后重试'); } finally { setSending(false); }
  }
  function next() {
    setError('');
    if (!mainlandPhone.test(phone) || !/^\d{6}$/.test(code)) return setError('请输入手机号和 6 位验证码');
    setStep(2);
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!agreed) return setError('请先阅读并同意用户协议与隐私政策');
    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, code, companyName, personalName, password, confirmPassword, agreed, rememberMe: true }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) return setError(data?.error || '注册失败，请稍后重试');
      router.replace('/dashboard'); router.refresh();
    } catch { setError('网络异常，请稍后重试'); } finally { setSubmitting(false); }
  }
  return <div className="w-full max-w-md"><div className="mb-8 text-center"><h1 className="text-2xl font-bold text-text-primary">注册企业</h1><p className="mt-2 text-sm text-text-secondary">短信仅用于本次注册验证，完成后使用手机号和密码登录。</p></div>{step === 1 ? <div className="space-y-4"><label className="block text-xs font-medium text-text-secondary">中国大陆手机号</label><div className="relative -mt-2"><input className="input-primary pr-28" inputMode="numeric" maxLength={11} placeholder="请输入手机号" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))} /><button type="button" onClick={sendCode} disabled={sending || countdown > 0 || !mainlandPhone.test(phone)} className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1.5 text-xs font-medium text-accent-blue disabled:text-text-muted">{countdown ? `${countdown}s 后重试` : sending ? '发送中' : '获取验证码'}</button></div><label className="block text-xs font-medium text-text-secondary">短信验证码</label><input className="input-primary -mt-2" inputMode="numeric" maxLength={6} placeholder="请输入 6 位验证码" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} />{message && <p className="text-sm text-success">{message}</p>}{error && <p className="text-sm text-danger">{error}</p>}<button className="btn-primary w-full rounded-xl py-3" type="button" onClick={next}>下一步</button></div> : <form className="space-y-4" onSubmit={submit}><label className="block text-xs font-medium text-text-secondary">企业名称</label><input className="input-primary -mt-2" maxLength={80} value={companyName} onChange={(event) => setCompanyName(event.target.value)} /><label className="block text-xs font-medium text-text-secondary">个人姓名</label><input className="input-primary -mt-2" maxLength={80} value={personalName} onChange={(event) => setPersonalName(event.target.value)} /><label className="block text-xs font-medium text-text-secondary">设置登录密码</label><input className="input-primary -mt-2" type="password" autoComplete="new-password" maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /><label className="block text-xs font-medium text-text-secondary">确认密码</label><input className="input-primary -mt-2" type="password" autoComplete="new-password" maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /><label className="flex items-start gap-2 text-xs text-text-secondary"><input type="checkbox" className="mt-0.5" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />我已阅读并同意 <Link href="/terms" className="text-accent-blue">用户协议</Link> 与 <Link href="/privacy" className="text-accent-blue">隐私政策</Link></label>{error && <p className="text-sm text-danger">{error}</p>}<button disabled={submitting} className="btn-primary w-full rounded-xl py-3 disabled:opacity-60">{submitting ? '创建中…' : '创建企业并进入工作台'}</button></form>}<p className="mt-6 text-center text-sm text-text-secondary">已有账号？ <Link className="text-accent-blue" href="/auth/login">登录</Link></p></div>;
}
