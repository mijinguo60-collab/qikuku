/**
 * 企库库 生产数据库种子脚本 (raw pg 版本)
 */
import 'dotenv/config';
import pg from 'pg';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const hash = await bcrypt.hash('123456', 12);
  const c = await pool.connect();
  try {
    const now = new Date().toISOString();
    const cid = 'seed-company-zhucheng';
    const aid = 'seed-admin-zhucheng';
    const eid = 'seed-employee-zhucheng';

    // 1. Company
    await c.query(`INSERT INTO "Company" (id, name, industry, description, plan, "createdAt") VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET name=$2, industry=$3, description=$4`,
      [cid, '诸城吃喝玩乐', '本地生活 / 探店 / 直播 / 代运营 / 工厂 AI 赋能', '企库库演示企业', 'free', now]);
    console.log('✅ Company');

    // 2. Users
    await c.query(`INSERT INTO "User" (id, name, email, "passwordHash", role, "companyId", "createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (email) DO UPDATE SET "passwordHash"=$4`,
      [aid, '张老板', 'admin@zhucheng.com', hash, 'super_admin', cid, now]);
    console.log('✅ Admin: admin@zhucheng.com');

    await c.query(`INSERT INTO "User" (id, name, email, "passwordHash", role, "companyId", "createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (email) DO UPDATE SET "passwordHash"=$4`,
      [eid, '李员工', 'employee@zhucheng.com', hash, 'member', cid, now]);
    console.log('✅ Employee: employee@zhucheng.com');

    // 3. Knowledge Spaces
    const spaces = [
      ['seed-space-1','公司基础资料','企业背景、团队、服务理念'],
      ['seed-space-2','探店业务 SOP','探店拍摄、剪辑、发布全流程'],
      ['seed-space-3','直播运营话术','直播开场、互动、逼单话术'],
      ['seed-space-4','代运营客户 FAQ','客户常见问题标准应答'],
      ['seed-space-5','工厂 AI 赋能资料','工厂AI转型、视觉质检、排产优化'],
      ['seed-space-6','销售成交话术','电话邀约、报价谈判、逼单话术'],
      ['seed-space-7','短视频脚本库','探店/口播/剧情脚本模板'],
      ['seed-space-8','客户案例库','客户案例、效果数据、评价'],
    ];
    for (const [id, name, desc] of spaces) {
      await c.query(`INSERT INTO "KnowledgeSpace" (id, "companyId", name, description, "isAiEnabled", visibility, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,true,'all',$5,$5) ON CONFLICT (id) DO UPDATE SET name=$3, description=$4`,
        [id, cid, name, desc, now]);
    }
    console.log(`✅ Spaces: ${spaces.length}`);

    // 4. Documents
    const docs = [
      ['seed-doc-1','seed-space-1','公司业务介绍.txt','txt','诸城吃喝玩乐是专注于本地生活和探店代运营的公司。为商家提供抖音探店、短视频拍摄、直播代运营、店铺推广一站式服务。2025年拓展工厂AI赋能业务。'],
      ['seed-doc-2','seed-space-6','销售话术手册.txt','txt','【电话邀约】"您好，我是诸城吃喝玩乐小王。我们帮本地商家通过抖音获客。最近帮火锅店带来300+桌新客。"【异议处理】"我理解顾虑。ROI超1:20，服务费不到5%。"'],
      ['seed-doc-3','seed-space-2','探店拍摄SOP.txt','txt','标准流程：1.提前沟通需求 2.准备设备 3.拍环境空镜 4.拍核心产品 5.采访老板 6.拍顾客反应 7.后期剪辑 8.商家审核 9.数据复盘'],
      ['seed-doc-4','seed-space-3','直播转化话术.txt','txt','【开场】"欢迎新进直播间！今天来到最火火锅店XX火锅，带来全网最低套餐福利！"【逼单】"298套餐原价468，只剩18份，想要的赶紧拍！"'],
      ['seed-doc-5','seed-space-5','工厂AI赋能介绍.txt','txt','工厂AI赋能：1.AI视觉质检(准确率99.5%) 2.智能排产优化(利用率+20%) 3.预测性维护 4.AI培训助手 5.能耗智能管理(成本-15%)'],
      ['seed-doc-6','seed-space-4','客户FAQ手册.txt','txt','Q1:代运营有什么不同？A:全链路运营，从定位到复盘。Q2:多久见效果？A:2-4周。Q3:服务费？A:基础6800元/月，标准12800元/月。Q4:工厂AI？A:质检2-4周上线。'],
    ];
    for (const [id, sid, fn, ft, txt] of docs) {
      await c.query(`INSERT INTO "Document" (id, "companyId", "knowledgeSpaceId", filename, "fileType", "extractedText", status, "sensitivityLevel", "uploadedBy", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,'indexed','normal',$7,$8,$8) ON CONFLICT (id) DO UPDATE SET "extractedText"=$6, status='indexed'`,
        [id, cid, sid, fn, ft, txt, aid, now]);
    }
    console.log(`✅ Documents: ${docs.length}`);

    // 5. Skills
    const skills = [
      ['seed-skill-1','目标与贡献管理','management','基于德鲁克：目标、责任、贡献。诊断执行力、目标和复盘机制。','目标→责任→贡献→复盘','你是企业目标管理分析助手。基于企业知识库资料，诊断目标清晰度、岗位责任、贡献可衡量度。先引用资料再分析，输出须具体可执行。','结论先行→事实→诊断→根因→优先级→30天计划→引用','["员工执行力差？","目标完不成？","员工不知道做什么？"]'],
      ['seed-skill-2','差异化战略','strategy','彼得·蒂尔战略：从0到1、垄断、差异化、小市场切入','差异化→小市场→壁垒→价值','你是差异化战略分析助手。基于企业资料判断是否具备差异化、是否陷入同质化竞争。必须结合企业业务和客户资料。','差异化判断→同质化风险→小市场→价值主张→壁垒→30天计划','["没有差异化？","产品太像同行？","先打哪个市场？"]'],
      ['seed-skill-3','竞争战略分析','strategy','波特五力：成本领先、差异化、供应商/客户议价、替代品、壁垒','五力→成本→差异化→定位→风险','你是竞争战略分析助手。用行业结构分析竞争格局。落到成本、客户、供应商、替代品、门槛和同行竞争上。','竞争位置→五力→成本可行性→差异化可行性→风险→策略','["竞争太激烈？","利润越来越低？","低价还是高端？"]'],
      ['seed-skill-4','经营利润分析','management','稻盛和夫：利润意识、阿米巴、单位时间效率、收入最大化费用最小化','利润→责任单元→效率→指标','你是经营利润分析助手。分析收入、成本、利润和部门经营意识。帮老板从做事思维转向经营思维。','利润意识→收入成本→责任单元→费用控制→效率→30天计划','["收入不少利润低？","员工没成本意识？","哪个业务最赚？"]'],
      ['seed-skill-5','精益验证与改进','innovation','精益创业：MVP、验证、浪费消除、数据驱动、持续改进','假设→MVP→验证→反馈→迭代','你是精益改进助手。帮助企业用最小成本验证假设、减少浪费。必须输出可验证指标。','假设→MVP→验证指标→浪费→实验→7/30天迭代','["新项目能做吗？","流程太慢？","快速验证市场？"]'],
    ];
    for (const [id, name, cat, desc, fw, sp, os, sq] of skills) {
      await c.query(`INSERT INTO "Skill" (id, "companyId", name, category, description, framework, "systemPrompt", "outputSchema", "suitableQuestions", enabled, "isBuiltIn", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,true,$10,$10) ON CONFLICT (id) DO UPDATE SET "systemPrompt"=$7, "outputSchema"=$8`,
        [id, cid, name, cat, desc, fw, sp, os, sq, now]);
    }
    console.log(`✅ Skills: ${skills.length}`);

    // 6. FAQ Document
    const faqs = [
      '客户嫌代运营服务太贵怎么回复？','探店拍摄标准流程是什么？','如何提高直播间转化率？',
      '新员工培训需要多久？','工厂老板不了解AI怎么沟通？','企业知识库适合哪些企业？',
      '如何把员工经验沉淀进知识库？','怎么避免客户资料丢失？','销售话术如何统一？',
      '短视频账号代运营交付标准是什么？','本地生活达人合作流程是什么？','如何判断客户是否适合做AI知识库？',
    ].map((q, i) => `${i + 1}. ${q}`).join('\n');
    await c.query(`INSERT INTO "Document" (id, "companyId", "knowledgeSpaceId", filename, "fileType", "extractedText", status, "sensitivityLevel", "uploadedBy", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,'indexed','normal',$7,$8,$8) ON CONFLICT (id) DO UPDATE SET "extractedText"=$6`,
      ['seed-faq-001', cid, 'seed-space-4', '热门问题FAQ汇总.txt', 'txt', faqs, aid, now]);
    console.log('✅ FAQs: 12 条');

    console.log('\n🎉 Seed complete! admin@zhucheng.com / 123456');
  } finally { c.release(); await pool.end(); }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
