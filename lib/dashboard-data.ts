import { getDb } from './db';

export interface TodayIndustryTopic {
  title: string;
  question: string;
}

const fallbackIndustryTopics: TodayIndustryTopic[] = [
  {
    title: 'AI 工具进入企业日常流程，知识沉淀和权限管理变得更重要',
    question: 'AI 工具进入企业日常流程后，企业应如何做好知识沉淀和权限管理？',
  },
  {
    title: '新员工培训成本上升，企业需要标准化 SOP 和统一话术',
    question: '如何用标准化 SOP 和统一话术降低新员工培训成本？',
  },
  {
    title: '客户咨询渠道变多，销售、客服、运营需要共用一套知识源',
    question: '销售、客服和运营如何共用一套可靠的企业知识源？',
  },
  {
    title: '管理者更关注经验复用，避免知识只留在老员工脑子里',
    question: '如何把老员工经验沉淀为团队可以持续复用的知识资产？',
  },
];

/**
 * 当前使用本地 fallback，确保工作台不会因为外部热点服务不可用而报错。
 * 后续可通过搜索/新闻 API 与 Vercel Cron 每日按 company.industry 拉取一次并缓存。
 */
export function getTodayIndustryTopics(companyIndustry?: string | null): TodayIndustryTopic[] {
  // 保留行业参数，供后续按行业返回差异化热点与缓存结果。
  void companyIndustry;
  return fallbackIndustryTopics;
}

export async function getDashboardSummary(companyId: string) {
  const db = getDb();
  try {
    const com = await db.prepare('SELECT * FROM "Company" WHERE id = ?').get(companyId);
    const dc = await db.prepare('SELECT COUNT(*) as c FROM "Document" WHERE "companyId" = ?').get(companyId) as any;
    const sc = await db.prepare('SELECT COUNT(*) as c FROM "KnowledgeSpace" WHERE "companyId" = ?').get(companyId) as any;
    const sk = await db.prepare('SELECT COUNT(*) as c FROM "Skill" WHERE "enabled" = true AND ("companyId" = ? OR "companyId" IS NULL)').get(companyId) as any;
    return {
      companyName: (com as any)?.name || '你的企业',
      companyIndustry: (com as any)?.industry || null,
      docCount: dc?.c || 0,
      spaceCount: sc?.c || 0,
      skillCount: sk?.c || 0,
    };
  } catch (e: any) {
    console.error('[dashboard-data] Query failed:', e.message);
    return { companyName: '你的企业', companyIndustry: null, docCount: 0, spaceCount: 0, skillCount: 0 };
  }
}
