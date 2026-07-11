import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getBillingOwner, isPlatformSuperAdmin } from '@/lib/billing/access';
import { createRechargeCredits, grantCredits, reverseUnusedRechargeCredits, consumeCredits } from '@/lib/billing/credits';
import { logAction } from '@/lib/audit';

async function guard(request: NextRequest) {
  const user = getBillingOwner(request);
  return isPlatformSuperAdmin(user) ? user : null;
}

export async function GET(request: NextRequest) {
  const admin = await guard(request);
  if (!admin) return NextResponse.json({ error: '仅限平台运营管理员访问' }, { status: 403 });
  try {
    const db = getDb();
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const [overview, companies, orders, ledgers] = await Promise.all([
      db.prepare(`SELECT (SELECT COUNT(*) FROM "Company") as "companyCount", (SELECT COUNT(DISTINCT "companyId") FROM "Subscription" WHERE status = 'active') as "paidCompanyCount", (SELECT COALESCE(SUM("amountCents"),0) FROM "RechargeOrder" WHERE status='paid' AND "paidAt" >= ?) as "todayRechargeCents", (SELECT COALESCE(SUM("amountCents"),0) FROM "RechargeOrder" WHERE status='paid' AND "paidAt" >= ?) as "monthRechargeCents", (SELECT COALESCE(SUM("chargedCredits"),0) FROM "UsageRecord" WHERE success=true AND "createdAt" >= ?) as "todayCredits", (SELECT COALESCE(SUM("estimatedCostCents"),0) FROM "UsageRecord" WHERE success=true) as "estimatedCostCents"`).get(dayStart, monthStart, dayStart),
      db.prepare(`SELECT c.id, c.name, c.industry, ca."totalBalance", ca."packageBalance", ca."purchasedBalance", ca."bonusBalance", p.name as "planName", s."expiresAt", s.status, (SELECT COUNT(*) FROM "User" u WHERE u."companyId" = c.id) as "memberCount", (SELECT COUNT(*) FROM "Document" d WHERE d."companyId" = c.id) as "fileCount" FROM "Company" c LEFT JOIN "CreditAccount" ca ON ca."companyId"=c.id LEFT JOIN "Subscription" s ON s."companyId"=c.id AND s.status IN ('trialing','active','past_due') LEFT JOIN "Plan" p ON p.id=s."planId" ORDER BY c."createdAt" DESC LIMIT 100`).all(),
      db.prepare(`SELECT o.*, c.name as "companyName", u.name as "userName" FROM "RechargeOrder" o JOIN "Company" c ON c.id=o."companyId" LEFT JOIN "User" u ON u.id=o."userId" ORDER BY o."createdAt" DESC LIMIT 100`).all(),
      db.prepare(`SELECT l.*, c.name as "companyName", u.name as "userName" FROM "CreditLedger" l JOIN "Company" c ON c.id=l."companyId" LEFT JOIN "User" u ON u.id=l."userId" ORDER BY l."createdAt" DESC LIMIT 200`).all(),
    ]);
    const revenue = Number(overview?.monthRechargeCents || 0);
    const cost = Number(overview?.estimatedCostCents || 0);
    return NextResponse.json({ overview: { ...overview, monthGrossProfitCents: revenue - cost, monthGrossMargin: revenue ? Math.round(((revenue - cost) / revenue) * 10000) / 100 : null }, companies, orders, ledgers });
  } catch (error: any) {
    console.error('[ADMIN_BILLING] Load failed', { message: error.message });
    return NextResponse.json({ error: '加载运营计费数据失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await guard(request);
  if (!admin) return NextResponse.json({ error: '仅限平台运营管理员访问' }, { status: 403 });
  try {
    const body = await request.json();
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) return NextResponse.json({ error: '请填写操作原因' }, { status: 400 });
    const db = getDb();
    if (body.action === 'mark_paid') {
      const order = await db.prepare(`SELECT * FROM "RechargeOrder" WHERE id = ?`).get(body.orderId);
      if (!order) return NextResponse.json({ error: '订单不存在' }, { status: 404 });
      const result = await createRechargeCredits(order, admin.id);
      await logAction({ companyId: order.companyId, userId: admin.id, action: 'billing_order_mark_paid', targetType: 'RechargeOrder', targetId: order.id, result: JSON.stringify({ reason, result }) });
      return NextResponse.json({ success: true, result });
    }
    if (body.action === 'refund') {
      const result = await reverseUnusedRechargeCredits(String(body.orderId || ''), admin.id);
      const order = await db.prepare(`SELECT "companyId" FROM "RechargeOrder" WHERE id = ?`).get(body.orderId);
      await logAction({ companyId: order.companyId, userId: admin.id, action: 'billing_order_refund', targetType: 'RechargeOrder', targetId: body.orderId, result: JSON.stringify({ reason, result }) });
      return NextResponse.json({ success: true, result });
    }
    if (body.action === 'grant') {
      const amount = Number(body.amount);
      if (!body.companyId || !Number.isInteger(amount) || amount <= 0) return NextResponse.json({ error: '企业和正整数积分为必填项' }, { status: 400 });
      const result = await grantCredits({ companyId: body.companyId, userId: admin.id, sourceType: body.sourceType === 'purchase' ? 'purchase' : 'manual', amount, description: reason, idempotencyKey: `admin:grant:${body.requestId || `${body.companyId}:${Date.now()}`}`, metadata: { note: body.note || null, adminId: admin.id } });
      await logAction({ companyId: body.companyId, userId: admin.id, action: 'billing_manual_grant', targetType: 'CreditAccount', result: JSON.stringify({ reason, amount, sourceType: body.sourceType || 'manual' }) });
      return NextResponse.json({ success: true, result });
    }
    if (body.action === 'deduct') {
      const amount = Number(body.amount);
      if (!body.companyId || !Number.isInteger(amount) || amount <= 0) return NextResponse.json({ error: '企业和正整数积分为必填项' }, { status: 400 });
      const result = await consumeCredits({ companyId: body.companyId, userId: admin.id, amount, featureType: 'manual_adjustment', requestId: body.requestId || `admin-deduct:${uuidSafe()}`, idempotencyKey: `admin:deduct:${body.requestId || uuidSafe()}`, description: reason });
      await logAction({ companyId: body.companyId, userId: admin.id, action: 'billing_manual_deduct', targetType: 'CreditAccount', result: JSON.stringify({ reason, amount }) });
      return NextResponse.json({ success: true, result });
    }
    return NextResponse.json({ error: '不支持的运营操作' }, { status: 400 });
  } catch (error: any) {
    const message = error.message || '运营操作失败';
    return NextResponse.json({ error: message }, { status: message.includes('积分不足') ? 400 : 500 });
  }
}

function uuidSafe() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
