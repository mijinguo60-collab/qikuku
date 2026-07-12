import BillingOperations from '@/components/admin/BillingOperations';
import { isPlatformSuperAdmin } from '@/lib/billing/access';
import { getServerSession } from '@/lib/session';

export default async function AdminPage() {
  const user = await getServerSession();
  if (!isPlatformSuperAdmin(user)) return <div className="min-h-screen bg-surface-primary flex items-center justify-center p-8"><div className="card p-7 max-w-md text-center"><h1 className="text-xl font-bold">无平台运营权限</h1><p className="text-sm text-text-secondary mt-3">该入口仅向平台 super_admin 开放。企业内超级管理员不会自动获得平台运营权限。</p></div></div>;
  return <main className="min-h-screen bg-surface-primary"><BillingOperations /></main>;
}
