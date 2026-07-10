import { cookies } from 'next/headers';
import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const store = cookies();
  const userCookie = store.get('qikuku_user');
  let userRole = '';
  if (userCookie) { try { userRole = JSON.parse(userCookie.value).role || ''; } catch {} }

  return (
    <div className="flex min-h-screen bg-surface-primary">
      <Sidebar userRole={userRole} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
