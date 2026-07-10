'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Menu, X, Brain } from 'lucide-react';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const links = ['产品', '知识库', '管理 Skill', 'AI 做图', '安全', '价格'];

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-border-light">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-text-primary flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-base font-bold text-text-primary">企库库</span>
            <span className="text-[10px] text-text-muted tracking-wide uppercase">QiKuKu AI Brain</span>
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {links.map(l => (
            <button key={l} className="btn-ghost text-[13px]">{l}</button>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/auth/login" className="btn-ghost text-[13px]">登录</Link>
          <Link href="/auth/register" className="btn-primary text-[13px]">开始使用</Link>
        </div>

        <button className="md:hidden p-2" onClick={() => setOpen(!open)}>
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-border-light bg-white p-4 flex flex-col gap-2 animate-fade-in">
          {links.map(l => (
            <button key={l} className="btn-ghost text-left text-sm">{l}</button>
          ))}
          <hr className="my-2 border-border-light" />
          <Link href="/auth/login" className="btn-secondary text-center text-sm">登录</Link>
          <Link href="/auth/register" className="btn-primary text-center text-sm">开始使用</Link>
        </div>
      )}
    </nav>
  );
}
