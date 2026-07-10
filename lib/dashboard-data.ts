import { getDb } from './db';

export function getDashboardSummary(companyId: string) {
  const db = getDb();
  const com = db.prepare('SELECT * FROM Company WHERE id = ?').get(companyId);
  const dc = db.prepare('SELECT COUNT(*) as c FROM Document WHERE companyId = ?').get(companyId) as any;
  const sc = db.prepare('SELECT COUNT(*) as c FROM KnowledgeSpace WHERE companyId = ?').get(companyId) as any;
  const sk = db.prepare('SELECT COUNT(*) as c FROM Skill WHERE enabled = 1 AND (companyId = ? OR companyId IS NULL)').get(companyId) as any;
  return {
    companyName: (com as any)?.name || '你的企业',
    docCount: dc?.c || 0,
    spaceCount: sc?.c || 0,
    skillCount: sk?.c || 0,
  };
}
