import { Loader2 } from 'lucide-react';

// App Router keeps DashboardLayout (sidebar, header and credit provider)
// mounted while this segment-level fallback is visible.
export default function DashboardLoading() {
  return (
    <div className="p-8 max-w-7xl mx-auto animate-pulse" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-2 text-sm text-text-muted"><Loader2 className="h-4 w-4 animate-spin" />正在加载页面…</div>
      <div className="mt-6 h-8 w-48 rounded bg-surface-tertiary" />
      <div className="mt-5 grid gap-4 md:grid-cols-3"><div className="h-32 rounded-2xl bg-surface-tertiary" /><div className="h-32 rounded-2xl bg-surface-tertiary" /><div className="h-32 rounded-2xl bg-surface-tertiary" /></div>
    </div>
  );
}
