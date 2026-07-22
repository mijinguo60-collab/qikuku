'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';

/** A database outage must not be mistaken for a logout or show a blank 500. */
export default function DashboardUnavailable() {
  const router = useRouter();
  return (
    <main className="min-h-screen bg-surface-primary flex items-center justify-center p-6">
      <section className="card max-w-md p-7 text-center">
        <h1 className="text-lg font-semibold text-text-primary">工作台暂时不可用</h1>
        <p className="mt-2 text-sm text-text-secondary">服务正在短暂恢复中。你的登录状态未被更改，请稍后重试。</p>
        <button type="button" onClick={() => router.refresh()} className="btn-primary mt-5 inline-flex items-center gap-2 text-sm">
          <RefreshCw className="h-4 w-4" />重新加载
        </button>
      </section>
    </main>
  );
}
