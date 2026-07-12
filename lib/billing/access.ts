import { NextRequest } from 'next/server';
import { getRequestSession, ServerSession } from '@/lib/session';

export type BillingOwner = ServerSession;

export async function getBillingOwner(request: NextRequest): Promise<BillingOwner | null> { return getRequestSession(request); }

// 企业内的 super_admin 是企业所有者，不等于平台运营人员。
export function isPlatformSuperAdmin(user: BillingOwner | null) {
  if (!user) return false;
  if (user.role === 'platform_super_admin') return true;
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  return Boolean(user.email && allowed.includes(user.email.toLowerCase()));
}
