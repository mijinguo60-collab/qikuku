import { NextRequest, NextResponse } from 'next/server';
import { resolveInvitation } from '@/lib/invitations/company-invitations';

export async function GET(_request: NextRequest, context: { params: { inviteCode: string } }) {
  return NextResponse.json(await resolveInvitation(context.params.inviteCode));
}
