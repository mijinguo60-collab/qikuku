import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/session';

export default async function ForbiddenPage() {
  const session = await getServerSession();
  if (!session) redirect('/auth/login');

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-primary px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-border-primary bg-surface-secondary p-7 text-center shadow-sm sm:p-10">
        <p className="text-sm font-semibold text-brand-primary">403</p>
        <h1 className="mt-3 text-2xl font-semibold text-text-primary">无访问权限</h1>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          你当前的企业角色没有访问该页面的权限。
        </p>
        {session.companyName ? (
          <p className="mt-2 text-sm text-text-tertiary">当前企业：{session.companyName}</p>
        ) : null}
        <Link
          href="/dashboard"
          className="mt-7 inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-primary/90"
        >
          返回工作台
        </Link>
      </section>
    </main>
  );
}
