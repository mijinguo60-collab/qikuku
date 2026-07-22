import { NextRequest, NextResponse } from 'next/server';
import { getCreditBreakdown } from '@/lib/billing/credits';
import { getCurrentCompanySubscription } from '@/lib/billing/plans';
import { getBillingOwner } from '@/lib/billing/access';
import { getDb } from '@/lib/db';
import { isWechatPayConfigured } from '@/lib/payments/wechat';
import { isAlipayConfigured } from '@/lib/payments/alipay';

export async function GET(request: NextRequest) {
  try {
    const owner = await getBillingOwner(request);
    if (!owner) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const credits = await getCreditBreakdown(owner.companyId);
    // The persistent dashboard provider only needs this small payload. Loading
    // a 100-row ledger on every sidebar render was the primary repeat-request
    // cost. Full billing details are opt-in for the billing page itself.
    if (request.nextUrl.searchParams.get('details') !== '1') return NextResponse.json({ credits });

    const db = getDb();
    const [subscription, ledger, usage] = await Promise.all([
      getCurrentCompanySubscription(owner.companyId),
      db.prepare(`SELECT l.*, u.name as "userName" FROM "CreditLedger" l LEFT JOIN "User" u ON u.id=l."userId" WHERE l."companyId" = ? ORDER BY l."createdAt" DESC LIMIT 100`).all(owner.companyId),
      db.prepare(`SELECT "featureType", COUNT(*) as count, COALESCE(SUM("chargedCredits"),0) as credits FROM "UsageRecord" WHERE "companyId" = ? AND success = true AND "createdAt" >= ? GROUP BY "featureType"`).all(owner.companyId, new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    ]);
    return NextResponse.json({ subscription, credits, ledger, usage, payments: { wechat: isWechatPayConfigured(), alipay: isAlipayConfigured() } });
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') console.error('[BILLING] Credit query failed', { code: error?.code || 'UNKNOWN' });
    return NextResponse.json({ error: '读取套餐与积分失败，请稍后重试' }, { status: 503 });
  }
}
