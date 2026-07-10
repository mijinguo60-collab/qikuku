import { getDb } from './db';

export async function getDashboardSummary(companyId: string) {
  const db = getDb();
  try {
    const com = await db.prepare('SELECT * FROM "Company" WHERE id = ?').get(companyId);
    const dc = await db.prepare('SELECT COUNT(*) as c FROM "Document" WHERE "companyId" = ?').get(companyId) as any;
    const sc = await db.prepare('SELECT COUNT(*) as c FROM "KnowledgeSpace" WHERE "companyId" = ?').get(companyId) as any;
    const sk = await db.prepare('SELECT COUNT(*) as c FROM "Skill" WHERE "enabled" = true AND ("companyId" = ? OR "companyId" IS NULL)').get(companyId) as any;
    return {
      companyName: (com as any)?.name || '你的企业',
      docCount: dc?.c || 0,
      spaceCount: sc?.c || 0,
      skillCount: sk?.c || 0,
    };
  } catch (e: any) {
    console.error('[dashboard-data] Query failed:', e.message);
    return { companyName: '你的企业', docCount: 0, spaceCount: 0, skillCount: 0 };
  }
}
