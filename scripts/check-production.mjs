import { existsSync } from 'fs';

const checklist = [];
function check(path, label) {
  const ok = existsSync(path);
  checklist.push({ path, label, ok });
  console.log(ok ? '✓' : '✗', label);
}

console.log('=== Pages ===');
check('app/page.tsx','首页');
check('app/auth/login/page.tsx','登录页');
check('app/pricing/page.tsx','价格页');
check('app/contact/page.tsx','预约演示');
check('app/security/page.tsx','安全页');
check('app/faq/page.tsx','FAQ');
check('app/onboarding/page.tsx','交付流程');
check('app/dashboard/page.tsx','工作台');
check('app/dashboard/chat/page.tsx','AI问答');
check('app/dashboard/skill-chat/page.tsx','Skill问答');
check('app/dashboard/images/page.tsx','图片生成');
check('app/dashboard/files/page.tsx','文件中心');
check('app/dashboard/team/page.tsx','成员管理');
check('app/dashboard/leads/page.tsx','线索管理');

console.log('\n=== APIs ===');
check('app/api/auth/login/route.ts','登录API');
check('app/api/auth/logout/route.ts','登出API');
check('app/api/upload/route.ts','上传API');
check('app/api/ai/chat/route.ts','Chat API');
check('app/api/ai/skill-chat/route.ts','Skill API');
check('app/api/ai/images/route.ts','图片API');
check('app/api/leads/route.ts','Leads API');
check('app/api/admin/leads/route.ts','管理员Leads API');
check('app/api/team/route.ts','团队API');
check('app/api/company/route.ts','企业API');

console.log('\n=== Libraries ===');
check('lib/roles.ts','角色模块');
check('lib/storage/index.ts','存储适配器');
check('lib/ai/rag-pipeline.ts','RAG管道');
check('lib/ai/llm-provider.ts','LLM Provider');
check('lib/ai/image-provider.ts','图片Provider');
check('lib/audit-log.ts','审计日志');

const failures = checklist.filter(c=>!c.ok);
console.log('\nproduction ready:', failures.length === 0);
if (failures.length) console.log('blockers:', failures.map(f=>f.label).join(', '));
