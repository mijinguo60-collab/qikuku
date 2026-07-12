import Sidebar from '@/components/Sidebar';
import { CreditBalanceProvider } from '@/components/billing/CreditBalanceProvider';
import { getServerSession } from '@/lib/session';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  const userRole = session?.role || '';

  return (
    <CreditBalanceProvider><div className="flex min-h-screen bg-surface-primary">
      <Sidebar userRole={userRole} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div></CreditBalanceProvider>
  );
}
