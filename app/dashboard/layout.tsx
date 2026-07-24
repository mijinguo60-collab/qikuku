import Sidebar from '@/components/Sidebar';
import { CreditBalanceProvider } from '@/components/billing/CreditBalanceProvider';
import { getServerSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import DashboardUnavailable from '@/components/dashboard/DashboardUnavailable';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await getServerSession();
  } catch {
    // A transient database failure is not proof that this user's session is
    // invalid. Keep the cookie untouched and offer a safe retry instead.
    return <DashboardUnavailable />;
  }
  if (!session) redirect('/auth/login');

  return (
   <CreditBalanceProvider><div className="flex min-h-screen bg-surface-canvas">
      <Sidebar userRole={session.role || ''} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div></CreditBalanceProvider>
  );
}
