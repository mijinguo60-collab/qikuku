import Database from 'better-sqlite3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const DB_PATH = path.join(process.cwd(), 'prisma', 'dev.db');
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const companyId = uuidv4();
const adminId = uuidv4();
const employeeId = uuidv4();
const now = new Date().toISOString();

// Create company
db.prepare(`INSERT INTO "Company" (id, name, logo, industry, description, plan, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`)
  .run(companyId, '诸城吃喝玩乐', null, '本地生活 / 探店代运营', '诸城本地生活与探店代运营服务商', 'free', now);

// Create users (password: "123456")
const hash = '$2a$12$LJ3m4ys3Lk0TSwMCfUzrUeCk0Z7GZ8wU0YzvZyvFqX0e0V0YK0KoW'; // bcrypt hash for "123456"
db.prepare(`INSERT INTO "User" (id, name, email, passwordHash, role, companyId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`)
  .run(adminId, '张老板', 'admin@zhucheng.com', hash, 'super_admin', companyId, now);
db.prepare(`INSERT INTO "User" (id, name, email, passwordHash, role, companyId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`)
  .run(employeeId, '李员工', 'employee@zhucheng.com', hash, 'member', companyId, now);

// Create knowledge spaces
const spaces = [
  { name: '公司介绍', description: '公司背景、团队、服务理念等基本介绍' },
  { name: '产品资料', description: '产品服务详情、套餐介绍、服务流程' },
  { name: '销售话术', description: '销售沟通话术、异议处理、成交话术' },
  { name: '客服 FAQ', description: '客户常见问题及标准回复' },
  { name: '员工制度', description: '考勤、绩效、薪资、福利等制度文件' },
  { name: '业务 SOP', description: '各业务线标准操作流程' },
  { name: '报价体系', description: '产品报价、套餐价格、优惠政策' },
  { name: '客户案例', description: '已服务客户案例、效果展示' },
  { name: '直播话术', description: '直播带货话术、互动话术、转化话术' },
  { name: '短视频脚本', description: '抖音/快手视频脚本模板和案例' },
  { name: '工厂 AI 赋能', description: '工厂AI数字化改造方案资料' },
  { name: '培训资料', description: '新员工培训教材、岗位技能培训' },
];

const insertSpace = db.prepare(
  'INSERT INTO "KnowledgeSpace" (id, companyId, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)'
);
for (const s of spaces) {
  insertSpace.run(uuidv4(), companyId, s.name, s.description, now, now);
}

// Create demo documents
const docSpaces = db.prepare('SELECT id, name FROM "KnowledgeSpace" WHERE companyId = ?').all(companyId) as any[];
const spaceMap: Record<string, string> = {};
docSpaces.forEach((s: any) => { spaceMap[s.name] = s.id; });

const documents = [
  { space: '公司介绍', name: '公司业务介绍.pdf', type: 'pdf', text: '诸城吃喝玩乐是一家专注于本地生活服务和探店代运营的公司。我们为本地商家提供抖音探店、短视频拍摄、直播代运营、店铺推广等一站式服务。', status: 'indexed' },
  { space: '销售话术', name: '本地生活商家销售话术.docx', type: 'docx', text: '销售话术："您好，我们是诸城吃喝玩乐，专注于帮助本地商家通过抖音获得更多客流。我们不是简单地拍视频，而是帮您建立完整的线上获客体系。"\n\n异议处理 - 客户嫌贵："我理解您的顾虑。让我帮您算一笔账，我们服务过的商家平均ROI是1:5，也就是投入1万，能带来5万的销售额。"', status: 'indexed' },
  { space: '业务 SOP', name: '探店拍摄 SOP.pdf', type: 'pdf', text: '探店拍摄标准流程：1. 提前与商家沟通拍摄需求和时间 2. 准备拍摄设备（手机/相机、补光灯、麦克风） 3. 到达现场先拍摄环境素材 4. 重点拍摄招牌产品/服务 5. 采访商家老板或员工 6. 后期剪辑和配音', status: 'indexed' },
  { space: '直播话术', name: '直播间转化话术.md', type: 'md', text: '# 直播间转化话术\n\n## 开场话术\n"欢迎新进来的朋友！今天我们来到诸城最火的火锅店，给大家带来独家福利！"\n\n## 逼单话术\n"这个套餐只有今天直播间才有，下播就没有了，想要的赶紧拍！"\n\n## 互动话术\n"想吃的扣1，我看看有多少人！"', status: 'indexed' },
  { space: '工厂 AI 赋能', name: '工厂 AI 赋能服务介绍.pptx', type: 'pptx', text: '工厂AI赋能服务：为制造业工厂提供AI数字化转型方案，包括智能质检、生产排程优化、设备预测维护、AI员工培训助手等。', status: 'indexed' },
  { space: '客服 FAQ', name: '客户常见问题 FAQ.xlsx', type: 'xlsx', text: 'Q: 你们的服务和别人有什么不同？\nA: 我们不是单纯的拍摄公司，而是从策划、拍摄、剪辑到数据复盘的全链路服务。\n\nQ: 多久能看到效果？\nA: 一般在合作后30天内能看到明显的客流增长，具体效果取决于行业和店铺位置。', status: 'indexed' },
];

const insertDoc = db.prepare(
  'INSERT INTO "Document" (id, companyId, knowledgeSpaceId, filename, fileType, extractedText, status, sensitivityLevel, uploadedBy, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
for (const d of documents) {
  const spaceId = spaceMap[d.space];
  if (spaceId) {
    insertDoc.run(uuidv4(), companyId, spaceId, d.name, d.type, d.text, d.status, 'normal', adminId, now, now);
  }
}

// Seed 5 built-in skills
const skills = [
  {
    name: '目标与贡献管理 Skill',
    category: 'management',
    description: '基于德鲁克管理思想，帮企业诊断目标、责任、贡献和执行力问题',
    sourceInspiration: '目标管理与有效管理者',
    framework: '目标-责任-贡献-复盘',
    diagnosticQuestions: JSON.stringify([
      '企业当前最重要的目标是什么？',
      '目标是否被量化？',
      '每个岗位是否知道自己对目标的贡献？',
      '是否有责任人？',
      '管理者关注的是动作还是结果？',
    ]),
    requiredKnowledgeTypes: JSON.stringify(['公司目标', '岗位职责', '绩效制度', '会议纪要', '业务流程']),
    systemPrompt: `你是企业目标与贡献管理分析助手。
你的任务不是泛泛讲管理理论，而是基于企业知识库资料，对企业当前目标、岗位责任、流程执行、员工贡献和复盘机制进行诊断。
你必须先引用企业资料，再使用目标与贡献管理框架分析。
如果企业资料不足，必须指出缺少哪些资料。
输出必须具体、可执行、适合老板和管理层阅读。
不得编造企业没有提供的信息。`,
    outputSchema: '结论先行 → 基于资料的事实 → 管理框架分析 → 问题诊断 → 根因分析 → 优先级排序 → 30天行动计划 → 需补充的资料 → 引用来源',
    suitableQuestions: JSON.stringify([
      '员工执行力差，问题可能在哪里？',
      '目标总完不成怎么调整？',
      '员工不知道做什么怎么办？',
    ]),
  },
  {
    name: '差异化战略与从 0 到 1 Skill',
    category: 'strategy',
    description: '基于彼得·蒂尔战略思想，帮企业找到差异化定位和蓝海机会',
    sourceInspiration: '从0到1与垄断优势',
    framework: '差异化-小市场-壁垒',
    diagnosticQuestions: JSON.stringify([
      '这家公司和同行有什么明显不同？',
      '当前业务是否陷入同质化竞争？',
      '是否有一个足够小但可占领的细分市场？',
      '客户为什么非要选你？',
      '有哪些能力可以形成壁垒？',
    ]),
    requiredKnowledgeTypes: JSON.stringify(['公司业务介绍', '产品资料', '客户群体', '竞品资料', '销售话术', '价格体系']),
    systemPrompt: `你是企业差异化战略分析助手。
你的任务是基于企业知识库资料，判断企业是否具备差异化、是否陷入同质化竞争、是否有可切入的小市场和长期壁垒。
你不能空谈战略，必须结合企业业务、客户、产品和案例资料。
如果资料不足，明确指出缺少竞品、客户、价格或案例资料。
输出必须帮助老板做取舍，而不是列一堆空泛机会。`,
    outputSchema: '当前差异化判断 → 同质化风险 → 可切入小市场 → 独特价值主张 → 潜在壁垒 → 不建议做的方向 → 30天验证计划',
    suitableQuestions: JSON.stringify([
      '我们公司没有差异化怎么办？',
      '产品太像同行了怎么办？',
      '应该先打哪个市场？',
    ]),
  },
  {
    name: '竞争战略与行业结构 Skill',
    category: 'strategy',
    description: '基于波特五力模型，帮企业分析行业竞争格局和定位选择',
    sourceInspiration: '竞争战略与五力分析',
    framework: '五力-成本-差异化-定位',
    diagnosticQuestions: JSON.stringify([
      '企业靠低成本还是差异化竞争？',
      '客户议价能力强不强？',
      '供应商是否限制利润？',
      '替代品有哪些？',
      '新进入者门槛高不高？',
    ]),
    requiredKnowledgeTypes: JSON.stringify(['行业信息', '产品资料', '报价体系', '客户资料', '供应商资料', '成本结构']),
    systemPrompt: `你是企业竞争战略分析助手。
你的任务是基于企业资料，用行业结构和竞争战略框架分析企业所在市场的竞争压力、利润空间和定位选择。
你必须把问题落到成本、客户、供应商、替代品、进入门槛和同行竞争上。
不得只给情绪化建议，必须输出可执行的竞争策略。`,
    outputSchema: '当前竞争位置 → 五力分析 → 成本领先可行性 → 差异化可行性 → 主要风险 → 应避开的竞争 → 策略建议',
    suitableQuestions: JSON.stringify([
      '行业竞争太激烈怎么办？',
      '利润越来越低怎么调整？',
      '选低价还是高端路线？',
    ]),
  },
  {
    name: '经营利润与责任单元 Skill',
    category: 'management',
    description: '基于稻盛和夫经营哲学，帮企业提升利润意识和经营效率',
    sourceInspiration: '阿米巴经营与利润意识',
    framework: '利润-责任单元-效率',
    diagnosticQuestions: JSON.stringify([
      '哪些业务赚钱，哪些不赚钱？',
      '是否按项目或部门核算利润？',
      '员工是否知道自己的工作和利润有关？',
      '成本是否被明确记录？',
      '是否存在只看收入不看利润的情况？',
    ]),
    requiredKnowledgeTypes: JSON.stringify(['收入结构', '成本结构', '部门职责', '项目数据', '报价体系']),
    systemPrompt: `你是企业经营利润分析助手。
你的任务是基于企业知识库资料，分析企业收入、成本、利润、部门责任和经营意识。
你要帮助老板把公司从"做事思维"转向"经营思维"。
如果缺少收入、成本、项目数据，必须明确提示。
输出必须具体到业务单元、指标、动作和复盘方式。`,
    outputSchema: '利润意识判断 → 收入成本问题 → 责任单元划分 → 费用控制点 → 效率提升 → 经营指标 → 30天改善动作',
    suitableQuestions: JSON.stringify([
      '收入不少但利润低怎么办？',
      '员工没有成本意识怎么培养？',
      '哪个业务最赚钱？',
    ]),
  },
  {
    name: '精益验证与持续改进 Skill',
    category: 'innovation',
    description: '基于精益创业方法论，帮企业用最小成本验证业务假设并持续优化',
    sourceInspiration: '精益创业与持续改进',
    framework: 'MVP-验证-反馈-迭代',
    diagnosticQuestions: JSON.stringify([
      '当前假设是什么？',
      '有没有最小可验证版本？',
      '用户是否真正付费或行动？',
      '哪些环节是浪费？',
      '哪些功能不是刚需？',
    ]),
    requiredKnowledgeTypes: JSON.stringify(['产品方案', '客户反馈', '销售数据', '交付流程', 'SOP', '运营数据']),
    systemPrompt: `你是企业精益验证与持续改进助手。
你的任务是基于企业资料，帮助企业用最小成本验证业务假设，减少浪费，优化流程，并建立持续改进机制。
你必须要求输出可验证指标，不能只给抽象建议。
如果企业缺少客户反馈、销售数据或流程资料，必须指出资料缺口。`,
    outputSchema: '当前假设 → MVP设计 → 验证指标 → 浪费环节 → 应砍掉的动作 → 下一步实验 → 7天/30天迭代计划',
    suitableQuestions: JSON.stringify([
      '新项目不知道能不能做怎么办？',
      '流程太慢怎么优化？',
      '怎么快速验证市场？',
    ]),
  },
];

const insertSkill = db.prepare(
  'INSERT INTO "Skill" (id, companyId, name, category, description, sourceInspiration, framework, diagnosticQuestions, requiredKnowledgeTypes, systemPrompt, outputSchema, suitableQuestions, enabled, isBuiltIn, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
for (const s of skills) {
  insertSkill.run(uuidv4(), companyId, s.name, s.category, s.description, s.sourceInspiration, s.framework, s.diagnosticQuestions, s.requiredKnowledgeTypes, s.systemPrompt, s.outputSchema, s.suitableQuestions, 1, 1, now, now);
}

// Create demo API credentials (placeholder)
db.prepare('INSERT INTO ApiCredential (id, companyId, provider, encryptedKey, baseUrl, model, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  .run(uuidv4(), companyId, 'deepseek', null, 'https://api.deepseek.com', 'deepseek-chat', now, now);
db.prepare('INSERT INTO ApiCredential (id, companyId, provider, encryptedKey, baseUrl, model, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  .run(uuidv4(), companyId, 'image', null, null, null, now, now);
db.prepare('INSERT INTO ApiCredential (id, companyId, provider, encryptedKey, baseUrl, model, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  .run(uuidv4(), companyId, 'embedding', null, null, null, now, now);

console.log('Seed data inserted successfully!');
console.log('Demo company: 诸城吃喝玩乐');
console.log('Admin: admin@zhucheng.com / 123456');
console.log('Employee: employee@zhucheng.com / 123456');

db.close();
