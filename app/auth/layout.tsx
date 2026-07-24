import Link from 'next/link';
import { Brain } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-canvas flex flex-col">
      <div className="h-12 flex items-center px-6 border-b border-border-light bg-white">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-text-primary flex items-center justify-center">
            <Brain className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-text-primary tracking-tight">企库库</span>
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        {children}
      </div>
    </div>
  );
}
