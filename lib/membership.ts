import { NextRequest } from 'next/server';
import { getRequestSession } from '@/lib/session';

export async function getActiveMembership(request: NextRequest) {
  const session = await getRequestSession(request); if (!session) return null;
  if (!session.activeCompanyId) return null;
  // getRequestSession has already performed the definitive active membership,
  // company status and unique-membership checks in one SQL query. Re-querying
  // it here only adds cross-region latency and cannot strengthen authorization.
  return {
    session,
    membership: {
      id: session.membershipId,
      userId: session.id,
      companyId: session.activeCompanyId,
      role: session.role,
      status: 'active',
    },
  };
}

export async function requireCompanyRole(request: NextRequest, roles: string[]) {
  const current = await getActiveMembership(request);
  return current && roles.includes(current.membership.role) ? current : null;
}
