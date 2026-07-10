# 企库库 可售版本状态

## 已完成能力
| 模块 | 状态 |
|------|------|
| 账号/登录/退出/权限/disabled | ✅ |
| Sidebar 按角色显示 | ✅ |
| 文件上传 + storage adapter | ✅ |
| RAG 管道（解析/切片/Embedding/检索） | ✅ |
| DeepSeek Chat / Skill Chat 真实接入 | ✅ |
| 图片生成 + prompt builder + 持久化 | ✅ |
| AiCallLog 调用日志 | ✅ |
| 企业管理/成员管理/安全审计 | ✅ |
| 商业化官网（价格/留资/安全/FAQ/交付） | ✅ |
| 线索管理（Leads 表 + API + 后台页） | ✅ |
| 生产检查脚本 5 个 | ✅ |
| 部署文档 + 测试计划 | ✅ |

## 仍需人工配置
- BLOB_READ_WRITE_TOKEN (Vercel Blob)
- 正式客服电话/微信/公司主体/备案号
- `npx prisma db push` (AiCallLog + ImageGeneration 扩展 + Lead)

## 已知限制
- 图片 OCR 暂不支持
- 生产需 BLOB_READ_WRITE_TOKEN
- 需要真实商业联系信息
