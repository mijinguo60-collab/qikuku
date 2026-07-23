# 腾讯云 CVM 部署准备

本目录只提供部署准备文件；它不会创建 CVM、修改 DNS、关闭 Vercel、删除 Neon，或自动执行数据库写入。

## 采用架构

- 一台腾讯云北京 CVM：Docker Compose 运行一个非 root 的 Next.js standalone 容器，仅绑定 `127.0.0.1:3000`。
- 同机 Nginx：公网 HTTP/HTTPS 反向代理、静态资源缓存和流式 AI 透传。
- 腾讯云 PostgreSQL：同 VPC 私网连接；数据库安全组仅允许 CVM 安全组访问 5432。
- systemd timer：替代 Vercel Cron，通过 loopback 调用账单任务。
- Vercel Blob：暂时保留，直至 COS adapter 和对象迁移完成。

Docker Compose 的复杂度最低，镜像可用不可变 tag 回滚；它避免了此阶段不必要的 Kubernetes、Redis、负载均衡和多节点会话协调。

## 主机文件与权限

在 CVM 上以 root 创建，绝不放入仓库：

- `/etc/qikuku/production.env`：从 `.env.production.example` 填写真实运行变量，权限 `0600`。
- `/etc/qikuku/tencentdb-ca.pem`：腾讯云数据库 CA，权限 `0644` 即可；它不是应用密钥，但不能提交到 Git。
- `/etc/qikuku/compose.env`：从 `compose.env.example` 填写本机路径和镜像 tag，权限 `0600`。
- `/var/backups/qikuku`：迁移前 PostgreSQL custom-format 备份，权限 `0700`。

脚本接受 `QIKUKU_ENV_FILE` 和 `DATABASE_SSL_CA_HOST_PATH`，默认上述路径。真实数据库密码、短信密钥、支付密钥、AI 密钥、Session secret 和 Cron secret 不要发送到聊天中。

## 严格 TLS：CVM 到腾讯云 PostgreSQL

应用的 `lib/db.ts` 读取 CA 并强制 `rejectUnauthorized: true`。**绝不**用 `rejectUnauthorized: false`、`sslmode=require` 或私网 IP host remap 绕过证书检查。

腾讯云 PostgreSQL SSL 配置一次只保护一个连接地址。当前本地外网 TLS 连接保持不动。CVM 切换前，需要在腾讯云控制台的数据库 **数据安全性 → SSL** 中确认新的私网连接地址及下载的新 CA：

1. 将该实例 SSL 的“保护地址”切换为 CVM 将使用的私网连接地址，或选择腾讯云提供且证书 SAN 覆盖的私网域名。
2. 在 CVM 用 `openssl s_client` 或本应用 readiness 探针验证证书 SAN 与 URL hostname 匹配，并由腾讯 CA 严格校验成功。
3. 只有完成上一步，才把 `DATABASE_URL` / `DATABASE_DIRECT_URL` 写入 `/etc/qikuku/production.env`。

若 `10.0.1.12` 没有出现在证书 IP SAN 中，不能直接使用它做 `verify-full` host；必须使用腾讯云控制台支持的受保护私网地址/域名。不要降级 TLS。

## 镜像、迁移和回滚顺序

### 离线交付的数据库工具镜像

生产迁移使用独立的 `Dockerfile.migrator` 构建，不改变 Web 运行镜像的行为。该镜像只包含 Prisma CLI、生产依赖、`prisma/schema.prisma` 和完整迁移历史；以非 root 用户运行、不暴露端口，也不会启动 Next.js。它不含环境文件、CA、密码、Token、私钥或数据库连接串。

在 Docker Hub 访问不稳定时，在受控 Mac 上为 `linux/amd64` 构建迁移镜像并拉取官方 `postgres:17-bookworm`，分别 `docker save | gzip` 后生成 SHA-256。上传时先传至服务器目标目录中的 `.part` 文件，校验哈希后才原子改名并 `docker load`。迁移镜像只可在明确提供运行时环境变量并经人工批准的维护窗口执行；交付与导入阶段不得连接数据库或运行迁移。

在已验证 TLS 的 CVM 上：

1. `deploy/scripts/build-image.sh` 构建 CVM 本机架构镜像。
2. `deploy/scripts/backup-database.sh --apply`（需要 `CONFIRM_QIKUKU_DATABASE_BACKUP=backup-qikuku-production`）创建备份。
3. `deploy/scripts/migrate.sh --apply`（需要 `CONFIRM_QIKUKU_MIGRATION=apply-production-migrations`）才会运行 `prisma migrate deploy`。
4. `deploy/scripts/start.sh` 启动 web 容器；先探测 loopback `/api/health/live` 和 `/api/health/ready`，再启用 Nginx 模板。

`update.sh` 串行执行备份、构建、迁移、启动，且需 `--apply` 和确认变量。`rollback.sh` 只切回已验证的旧镜像；Prisma migration 是前向的，不能自动回退数据。数据库恢复只能在停机后的事故流程中，使用迁移前 custom-format 备份执行，并先在隔离库演练。

## Vercel 专属迁移清单

当前 Vercel 依赖：

- `@vercel/blob`：文件上传与图片持久化，生产缺少 `BLOB_READ_WRITE_TOKEN` 时会拒绝写入。
- `vercel.json`：每日账单 Cron；CVM 上改由本目录 systemd timer，切流后才可在 Vercel 停用 Cron，避免重复发放。
- Vercel 环境变量：迁移到 root-owned CVM env 文件；不要复制到 Git。

COS 迁移仍需：北京 COS bucket、访问角色或最小权限密钥、私有读写/签名 URL 策略、CORS/CDN 域名、Vercel Blob 到 COS 的精确对象清单、适配器（保留 `storageProvider` / `storageKey`）、分批复制与校验、读回退窗口和回滚计划。当前 `Document.fileUrl`、`ImageGeneration.imageUrl` 是既有外部引用；先迁对象和验证，再切 adapter，不能直接删除 Blob。

## 生产边界

- CVM 安全组入站：`22/tcp` 仅固定管理 IP；`80/tcp`、`443/tcp` 面向公网；不开放 `3000`。
- 数据库安全组入站：仅 `5432/tcp`，来源为 CVM 安全组；不开放公网数据库端口。
- 支付回调需要 HTTPS `443` 和对应已验证 callback URL；短信、AI、Vercel Blob 出站 HTTPS `443`。
- 文件上传最大 20 MiB；Nginx 配置同样设为 20 MiB。应用解析请求内存中的上传字节，避免把 Vercel Blob/COS key 误当成本机文件路径。
- 健康端点不返回连接串、版本、IP、账号或密钥。liveness 不访问数据库；readiness 仅执行 `SELECT 1`。
