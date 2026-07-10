import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Lightbulb, ArrowRight, CheckCircle, XCircle } from 'lucide-react';

interface SkillRow {
  id: string; companyId: string | null; name: string; category: string;
  description: string; sourceInspiration: string | null; framework: string | null;
  diagnosticQuestions: string | null; requiredKnowledgeTypes: string | null;
  systemPrompt: string; outputSchema: string | null; suitableQuestions: string | null;
  enabled: number; isBuiltIn: number; createdAt: string; updatedAt: string;
}

const categoryLabels: Record<string, string> = {
  management: '管理', strategy: '战略', innovation: '创新',
};

const categoryColors: Record<string, string> = {
  management: 'bg-accent-blue/10 text-accent-blue',
  strategy: 'bg-accent-purple/10 text-accent-purple',
  innovation: 'bg-accent-cyan/10 text-accent-cyan',
};

export default async function SkillsPage() {
  const cookie = cookies().get('qikuku_user');
  if (!cookie) return null;
  const user = JSON.parse(cookie.value);
  const db = getDb();

  const skills = await db.prepare(
    'SELECT * FROM "Skill" WHERE "enabled" = true AND ("companyId" = ? OR "isBuiltIn" = true) ORDER BY "createdAt" ASC'
  ).all(user.companyId) as SkillRow[];

  return (
    <div className="p-8 max-w-7xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary mb-1">Skill 中心</h1>
        <p className="text-sm text-text-secondary">管理诊断 Skill，叠加企业知识库进行增强问答</p>
      </div>
      <div className="space-y-4">
        {skills.map((s: SkillRow) => {
          const sqs = s.suitableQuestions ? JSON.parse(s.suitableQuestions) : [];
          return (
            <div key={s.id} className="card p-6 hover:shadow-hover transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-surface-tertiary flex items-center justify-center">
                    <Lightbulb className="w-5 h-5 text-accent-purple" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-text-primary">{s.name}</h2>
                    <span className={`inline-flex text-[10px] px-2 py-0.5 rounded-full font-medium ${categoryColors[s.category] || 'bg-surface-tertiary text-text-muted'}`}>
                      {categoryLabels[s.category] || s.category}
                    </span>
                  </div>
                </div>
                <span className={`flex items-center gap-1 text-xs ${s.enabled ? 'text-success' : 'text-text-muted'}`}>
                  {s.enabled ? <><CheckCircle className="w-3.5 h-3.5" /> 已启用</> : <><XCircle className="w-3.5 h-3.5" /> 已禁用</>}
                </span>
              </div>
              <p className="text-sm text-text-secondary mb-4 leading-relaxed">{s.description}</p>
              {s.framework && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[10px] text-text-muted uppercase">分析框架:</span>
                  <span className="text-xs font-medium text-text-primary bg-surface-secondary px-2 py-1 rounded-lg">{s.framework}</span>
                </div>
              )}
              {sqs.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] text-text-muted uppercase mb-2">适用问题</p>
                  <div className="space-y-1.5">
                    {sqs.slice(0, 3).map((q: string, i: number) => (
                      <Link key={i} href={`/dashboard/skill-chat?skill=${s.id}`}
                        className="block text-xs text-text-secondary hover:text-text-primary transition-colors py-1">
                        → {q}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              <Link href={`/dashboard/skill-chat?skill=${s.id}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent-blue hover:underline">
                使用此 Skill 诊断 <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
