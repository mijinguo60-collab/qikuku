import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuid } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyName, contactName, contact, industry, teamSize, currentTool, painPoint, note } = body;
    if (!companyName || !contactName || !contact) {
      return NextResponse.json({ error: '请填写企业名称、联系人和联系方式' }, { status: 400 });
    }
    const db = getDb();
    const stmt = db.prepare(`INSERT INTO "Lead" (id, "companyName", "contactName", contact, industry, "teamSize", "currentTool", "painPoint", note, status, source, "createdAt", "updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const now = new Date().toISOString();
    await stmt.run(uuid(), companyName, contactName, contact, industry||null, teamSize||null, currentTool||null, painPoint||null, note||null, 'new', 'website', now, now);
    return NextResponse.json({ success: true, message: '已收到申请，我们会尽快联系你。' });
  } catch (e: any) {
    console.error('[LEADS]', e.message);
    return NextResponse.json({ error: '提交失败，请稍后重试' }, { status: 500 });
  }
}
