import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getRequestSession } from '@/lib/session';
import { getDb } from '@/lib/db';
import { initializeTrialSubscriptionForCompany } from '@/lib/billing/plans';

export async function POST(request: NextRequest) {
  const user = await getRequestSession(request);
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  try {
    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const industry = typeof body.industry === 'string' ? body.industry.trim() : '';
    const teamSize = typeof body.teamSize === 'string' ? body.teamSize.trim() : '';
    const contactName = typeof body.contactName === 'string' ? body.contactName.trim() : '';
    if (!name || !industry || !teamSize || !contactName || body.agreed !== true) {
      return NextResponse.json({ error: '请完整填写企业资料并同意服务协议' }, { status: 400 });
    }

    const db = getDb();
    const token = request.cookies.get('qikuku_user')?.value || '';
    const result = await db.transactionAsync(async (tx: any) => {
      // Always lock an existing row before checking memberships. Locking an empty
      // membership result cannot prevent two concurrent requests creating two companies.
      const lockedUser = await tx
        .prepare(`SELECT id FROM "User" WHERE id=? FOR UPDATE`)
        .get(user.id);

      if (!lockedUser) {
        throw new Error('onboarding_user_not_found');
      }

      const existing = await tx
        .prepare(`SELECT "companyId" FROM "CompanyMembership" WHERE "userId"=? AND status='active' ORDER BY "createdAt" LIMIT 1`)
        .get(user.id);

      if (existing) {
        await tx.prepare(`UPDATE "UserSession" SET "activeCompanyId"=? WHERE token=? AND "userId"=?`).run(existing.companyId, token, user.id);
        return { companyId: existing.companyId, existing: true, subscription: null };
      }

      const companyId = uuid();
      const now = new Date().toISOString();
      await tx.prepare(`INSERT INTO "Company" (id,name,industry,description,plan,"createdAt") VALUES (?,?,?,?,?,?)`).run(companyId, name, industry, JSON.stringify({ teamSize, contactName, contactPhone: body.contactPhone || null, logo: body.logo || null }), 'trial', now);
      await tx.prepare(`INSERT INTO "CompanyMembership" (id,"userId","companyId",role,status,"joinedAt","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?)`).run(uuid(), user.id, companyId, 'owner', 'active', now, now, now);
      await tx.prepare(`UPDATE "User" SET "companyId"=? WHERE id=?`).run(companyId, user.id);
      await tx.prepare(`UPDATE "UserSession" SET "activeCompanyId"=? WHERE token=? AND "userId"=?`).run(companyId, token, user.id);
      const subscription = await initializeTrialSubscriptionForCompany({ companyId, source: 'COMPANY_ONBOARDING', userId: user.id, tx });
      return { companyId, existing: false, subscription };
    });

    return NextResponse.json({ success: true, companyId: result.companyId, redirect: '/dashboard', existing: result.existing, planCode: result.subscription?.planCode || 'trial' });
  } catch (e: any) {
    console.error('[ONBOARDING]', { message: e?.message });
    return NextResponse.json({ error: '创建企业失败，请稍后重试' }, { status: 500 });
  }
}
