import Link from 'next/link';
import { resolveInvitation } from '@/lib/invitations/company-invitations';
import InvitePageClient from './InvitePageClient';

export default async function InvitePage({ params }: { params: { inviteCode: string } }) {
  const invitation = await resolveInvitation(params.inviteCode);
  if (!invitation.valid) return <main className="flex min-h-screen items-center justify-center bg-surface-secondary p-6"><section className="card w-full max-w-md p-8 text-center"><h1 className="text-2xl font-bold text-text-primary">该邀请已失效</h1><p className="mt-3 text-sm text-text-secondary">请联系企业管理员重新生成邀请。</p><Link href="/auth/login" className="btn-primary mt-6 inline-flex px-5 py-2.5">返回登录页</Link></section></main>;
  return <InvitePageClient inviteCode={params.inviteCode} invitation={invitation} />;
}
