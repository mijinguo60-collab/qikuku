# 企库库 QiKuKu AI Brain · 部署文档

## 环境要求

- Node.js >= 18
- npm >= 9
- SQLite (开发环境内置)

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入三组 API 的 Key/地址/模型名

# 3. 初始化数据库（开发环境 SQLite，无需额外配置）
# 数据库文件: prisma/dev.db（已包含种子数据）

# 4. 启动开发服务器
npm run dev
# 访问 http://localhost:3000
```

## 演示账号

| 角色 | 邮箱 | 密码 |
|------|------|------|
| 管理员 | admin@zhucheng.com | 123456 |
| 员工 | employee@zhucheng.com | 123456 |

## 环境变量说明

```bash
# 数据库
DATABASE_URL="file:./prisma/dev.db"

# DeepSeek 系列（共享凭据；模型由服务端目录按用户选择传入）
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL=https://01yq888.com

# 图片模型
IMAGE_API_KEY=sk-xxx
IMAGE_BASE_URL=https://api.openai.com
IMAGE_MODEL=dall-e-3

# Embedding 模型
EMBEDDING_API_KEY=sk-xxx
EMBEDDING_BASE_URL=https://api.openai.com
EMBEDDING_MODEL=text-embedding-3-small
```

## 生产部署

### 方式一: Node.js 服务器

```bash
npm run build
npm start
# 使用 PM2 管理进程
pm2 start npm --name "qikuku" -- start
```

### 方式二: Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### 方式三: Vercel / Netlify

直接关联 Git 仓库，设置环境变量后自动部署。
注意: 需要将 SQLite 替换为 PostgreSQL 用于生产环境。

## 数据库迁移 (开发→生产)

开发环境使用 SQLite，生产环境建议迁移到 PostgreSQL:

1. 安装 Prisma: `npm install prisma @prisma/client`
2. 修改 `prisma/schema.prisma` 中 datasource provider 为 `postgresql`
3. 设置 `DATABASE_URL` 为 PostgreSQL 连接串
4. 运行 `npx prisma migrate dev` 创建表
5. 运行 `node lib/seed.js` 初始化种子数据

## 向量数据库 (可选)

当前使用 SQLite 存储 embedding + 余弦相似度检索。
如需升级到专用向量数据库：

- **Milvus / Qdrant / Pinecone**: 替换 `lib/ai/rag-pipeline.ts` 中的 embedding 存储和检索逻辑
- 保留 `lib/ai/embedding-provider.ts` 的 embedding 生成部分

## API 路由

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/ai/chat` | POST | 语言模型对话（支持流式 SSE） |
| `/api/ai/images` | POST | 图片生成 |
| `/api/ai/embed` | POST | 文本向量化 |
| `/api/ai/models` | POST | 测试模型连接 |
| `/api/upload` | POST | 文件上传 + RAG 入库 |
| `/api/auth/login` | POST | 登录 |
| `/api/auth/register` | POST | 注册 |

## 文件结构

```
qikuku/
├── app/                    # Next.js App Router
│   ├── api/               # API 路由
│   ├── auth/              # 登录注册
│   ├── dashboard/         # 后台 19 个页面
│   └── page.tsx           # 官网首页
├── components/            # 共享组件
│   ├── Navbar.tsx
│   ├── Sidebar.tsx
│   └── landing/           # 首页组件
├── lib/                   # 核心库
│   ├── db.ts              # 数据库连接
│   ├── auth.ts            # 认证
│   ├── ai/                # AI 模块
│   │   ├── language-provider.ts
│   │   ├── image-provider.ts
│   │   ├── embedding-provider.ts
│   │   └── rag-pipeline.ts
│   ├── file-parser.ts     # 文件解析
│   ├── audit.ts           # 审计日志
│   └── crypto-keys.ts     # API Key 加密
└── prisma/
    └── dev.db             # SQLite 数据库
```
