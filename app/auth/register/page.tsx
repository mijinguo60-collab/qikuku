'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, LockKeyhole, Phone } from 'lucide-react';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validateLoginPasswordValue } from '@/lib/auth/password-policy';

const mainlandPhone = /^1[3-9]\d{9}$/;
const placeholderNames = new Set(['企业库用户', '企库库用户']);

function validateText(value: string, label: string) {
  const normalized = value.trim();
  if (normalized.length < 2 || normalized.length > 80 || placeholderNames.has(normalized)) {
    return `请填写真实${label}`;
  }
  return null;
}

export default function RegisterPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [personalName, setPersonalName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!countdown) return;
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  const passwordIssue = useMemo(() => password ? validateLoginPasswordValue(password) : null, [password]);

  async function sendCode() {
    setError('');
    setMessage('');
    if (!mainlandPhone.test(phone)) {
      setError('请输入有效的中国大陆手机号');
      return;
    }

    setSending(true);
    try {
      const response = await fetch('/api/auth/sms/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error || '短信暂时发送失败，请稍后重试');
        return;
      }
      setCountdown(60);
      setMessage('验证码已发送，请查收短信。');
    } catch {
      setError('网络异常，请稍后重试');
    } finally {
      setSending(false);
    }
  }

  function validateForm() {
    if (!mainlandPhone.test(phone)) return '请输入有效的中国大陆手机号';
    if (!/^\d{6}$/.test(code)) return '请输入 6 位短信验证码';
    const companyIssue = validateText(companyName, '企业名称');
    if (companyIssue) return companyIssue;
    const nameIssue = validateText(personalName, '姓名');
    if (nameIssue) return nameIssue;
    if (passwordIssue) return passwordIssue;
    if (password !== confirmPassword) return '两次密码输入不一致';
    if (!agreed) return '请先阅读并同意用户协议与隐私政策';
    return null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const issue = validateForm();
    if (issue) {
      setError(issue);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          code,
          companyName: companyName.trim(),
          personalName: personalName.trim(),
          password,
          confirmPassword,
          agreed,
          rememberMe: true,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error || '注册失败，请稍后重试');
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
        <h1 className="text-2xl font-bold text-text-primary">注册企业</h1>
        <p className="mt-2 text-sm text-text-secondary">完成注册后，使用手机号和密码登录企业工作台。</p>
      </div>
      <form className="space-y-4" onSubmit={submit} noValidate>
        <div>
          <label className="block text-xs font-medium text-text-secondary">中国大陆手机号</label>
          <div className="relative mt-2">
            <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input className="input-primary pl-10 pr-28" inputMode="numeric" autoComplete="tel-national" maxLength={11} placeholder="请输入手机号" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))} />
            <button type="button" onClick={sendCode} disabled={sending || countdown > 0 || !mainlandPhone.test(phone)} className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1.5 text-xs font-medium text-accent-blue disabled:text-text-muted">
              {countdown ? `${countdown}s 后重试` : sending ? '发送中…' : '获取验证码'}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary">短信验证码</label>
          <input className="input-primary mt-2" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="请输入 6 位验证码" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary">企业名称</label>
          <input className="input-primary mt-2" autoComplete="organization" maxLength={80} placeholder="请输入企业名称" value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary">姓名</label>
          <input className="input-primary mt-2" autoComplete="name" maxLength={80} placeholder="请输入真实姓名" value={personalName} onChange={(event) => setPersonalName(event.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary">设置密码</label>
          <div className="relative mt-2">
            <input className="input-primary pr-11" type={showPassword ? 'text' : 'password'} autoComplete="new-password" maxLength={PASSWORD_MAX_LENGTH} placeholder={`至少 ${PASSWORD_MIN_LENGTH} 位，包含两种字符类型`} value={password} onChange={(event) => setPassword(event.target.value)} />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" aria-label={showPassword ? '隐藏密码' : '显示密码'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
          {password && passwordIssue && <p className="mt-1 text-xs text-danger">{passwordIssue}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary">确认密码</label>
          <div className="relative mt-2">
            <input className="input-primary pr-11" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" maxLength={PASSWORD_MAX_LENGTH} placeholder="请再次输入密码" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            <button type="button" onClick={() => setShowConfirmPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" aria-label={showConfirmPassword ? '隐藏密码' : '显示密码'}>{showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
        </div>
        <label className="flex items-start gap-2 text-xs text-text-secondary"><input type="checkbox" className="mt-0.5" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />我已阅读并同意 <Link href="/terms" className="text-accent-blue">用户协议</Link> 与 <Link href="/privacy" className="text-accent-blue">隐私政策</Link></label>
        {message && <p className="text-sm text-success" role="status">{message}</p>}
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <button disabled={submitting} className="btn-primary w-full rounded-xl py-3 disabled:opacity-60">{submitting ? '注册中…' : '注册并进入工作台'}</button>
      </form>
      <p className="mt-6 text-center text-sm text-text-secondary">已有账号？ <Link className="text-accent-blue" href="/auth/login">去登录</Link></p>
    </div>
  );
}
