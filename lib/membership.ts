import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestSession } from '@/lib/session';

export async function getActiveMembershipForUser(userId: string, activeCompanyId?: string | null) {
  const db = getDb();
  if (!activeCompanyId) return null;
  return db.prepare(`SELECT * FROM "CompanyMembership" WHERE "userId"=? AND "companyId"=? AND status='active'`).get(userId, activeCompanyId);
}

export async function getActiveMembership(request: NextRequest) {
  const session = await getRequestSession(request); if (!session) return null;
  const membership = await getActiveMembershipForUser(session.id, session.activeCompanyId);
  return membership ? { session, membership } : null;
}

export async function requireCompanyRole(request: NextRequest, roles: string[]) {
  const current = await getActiveMembership(request);
  return current && roles.includes(current.membership.role) ? current : null;
}
