import Sidebar from '@/components/Sidebar';
import { CreditBalanceProvider } from '@/components/billing/CreditBalanceProvider';
import { getServerSession } from '@/lib/session';
import { getActiveMembershipForUser } from '@/lib/membership';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect('/auth/login');
  const membership = await getActiveMembershipForUser(session.id, session.activeCompanyId);
  if (!membership) redirect('/auth/login');
  const userRole = membership.role || '';

  return (
    <CreditBalanceProvider><div className="flex min-h-screen bg-surface-primary">
      <Sidebar userRole={userRole} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div></CreditBalanceProvider>
  );
}
