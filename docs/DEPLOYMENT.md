# 企库库 部署文档

## 环境变量

在 Vercel 项目 Settings → Environment Variables 中配置：

| 变量 | 说明 |
|------|------|
| DATABASE_URL | Neon PostgreSQL 连接串 |
| BLOB_READ_WRITE_TOKEN | Vercel Blob Store Token |
| DEEPSEEK_API_KEY | DeepSeek API Key |
| DEEPSEEK_BASE_URL | DeepSeek API 地址 |
| DEEPSEEK_MODEL | 模型名称 |
| EMBEDDING_API_KEY | Embedding API Key |
| EMBEDDING_BASE_URL | Embedding API 地址 |
| EMBEDDING_MODEL | Embedding 模型名 |
| IMAGE_API_KEY | 图片生成 API Key |
| IMAGE_BASE_URL | 图片 API 地址 |
| IMAGE_MODEL | 图片模型名 |
| ENABLE_DEMO_FALLBACK | 设 false |
| NEXTAUTH_URL | https://www.qikuku.cn |
| NEXTAUTH_SECRET | 随机字符串 |

## 数据库初始化

```bash
npx prisma db push
npm run db:seed
```

## 部署步骤

1. git add . && git commit -m "release" && git push
2. Vercel 自动部署
3. 等待 Ready 后按 TEST_PLAN.md 测试
