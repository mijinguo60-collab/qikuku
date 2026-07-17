import { NextRequest } from 'next/server';
import { getRequestSession, ServerSession } from '@/lib/session';
import { getDb } from '@/lib/db';

export type BillingOwner = ServerSession;

export async function getBillingOwner(request: NextRequest): Promise<BillingOwner | null> { return getRequestSession(request); }

// 企业内的 super_admin 是企业所有者，不等于平台运营人员。
export async function isPlatformSuperAdmin(user: BillingOwner | null) {
  if (!user) return false;
  const row = await getDb().prepare(`SELECT role FROM "User" WHERE id=? AND status='active'`).get(user.id);
  return row?.role === 'platform_super_admin';
}
