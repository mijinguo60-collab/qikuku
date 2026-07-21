import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/session';
import LoginPageClient from './LoginPageClient';

export default async function LoginPage() {
  // Cookie 签名有效并不代表数据库中的 UserSession 仍有效。
  // 仅在数据库 Session 校验成功后才将用户带回工作台。
  if (await getServerSession()) redirect('/dashboard');

  return <LoginPageClient />;
}
