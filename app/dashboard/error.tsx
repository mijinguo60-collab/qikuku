'use client';

import { RefreshCw } from 'lucide-react';

/** Segment error boundary: DashboardLayout remains mounted during a retry. */
export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="p-8 max-w-2xl mx-auto">
      <section className="card p-7">
        <h1 className="text-lg font-semibold text-text-primary">页面数据暂时不可用</h1>
        <p className="mt-2 text-sm text-text-secondary">服务正在短暂恢复中，请稍后重新加载。本次问题不会影响你的登录状态。</p>
        <button type="button" onClick={reset} className="btn-primary mt-5 inline-flex items-center gap-2 text-sm">
          <RefreshCw className="h-4 w-4" />重试
        </button>
      </section>
    </div>
  );
}
