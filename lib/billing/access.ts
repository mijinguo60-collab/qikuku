import { NextRequest } from 'next/server';

export type BillingOwner = { id: string; companyId: string; role: string; email?: string; name?: string };

export function getBillingOwner(request: NextRequest): BillingOwner | null {
  const value = request.cookies.get('qikuku_user')?.value;
  if (!value) return null;
  try {
    const user = JSON.parse(value);
    return user?.id && user?.companyId ? user : null;
  } catch {
    return null;
  }
}

// 企业内的 super_admin 是企业所有者，不等于平台运营人员。
export function isPlatformSuperAdmin(user: BillingOwner | null) {
  if (!user) return false;
  if (user.role === 'platform_super_admin') return true;
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  return Boolean(user.email && allowed.includes(user.email.toLowerCase()));
}
