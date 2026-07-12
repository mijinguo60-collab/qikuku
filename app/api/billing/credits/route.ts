import { NextRequest, NextResponse } from 'next/server';
import { getCreditBreakdown } from '@/lib/billing/credits';
import { ensureCompanySubscription } from '@/lib/billing/plans';
import { getBillingOwner } from '@/lib/billing/access';
import { getDb } from '@/lib/db';
import { isWechatPayConfigured } from '@/lib/payments/wechat';
import { isAlipayConfigured } from '@/lib/payments/alipay';

export async function GET(request: NextRequest) {
  const owner = await getBillingOwner(request);
  if (!owner) return NextResponse.json({ error: '未登录' }, { status: 401 });
  try {
    const subscription = await ensureCompanySubscription(owner.companyId, owner.id);
    const credits = await getCreditBreakdown(owner.companyId);
    const db = getDb();
    const [ledger, usage] = await Promise.all([
      db.prepare(`SELECT l.*, u.name as "userName" FROM "CreditLedger" l LEFT JOIN "User" u ON u.id=l."userId" WHERE l."companyId" = ? ORDER BY l."createdAt" DESC LIMIT 100`).all(owner.companyId),
      db.prepare(`SELECT "featureType", COUNT(*) as count, COALESCE(SUM("chargedCredits"),0) as credits FROM "UsageRecord" WHERE "companyId" = ? AND success = true AND "createdAt" >= ? GROUP BY "featureType"`).all(owner.companyId, new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    ]);
    return NextResponse.json({ subscription, credits, ledger, usage, payments: { wechat: isWechatPayConfigured(), alipay: isAlipayConfigured() } });
  } catch (error: any) {
    console.error('[BILLING] Failed to read credit balance', { message: error.message });
    return NextResponse.json({ error: '读取套餐与积分失败，请稍后重试' }, { status: 500 });
  }
}
