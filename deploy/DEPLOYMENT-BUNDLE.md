# 企库库 CVM 部署包

此目录的发布包只包含 Docker Compose、启动/停止/回滚/健康检查脚本和本说明；不包含应用源码、环境变量、证书或任何密钥。

## CVM 文件布局

- `/opt/qikuku/deploy/docker-compose.production.yml`
- `/opt/qikuku/deploy/scripts/`
- `/etc/qikuku/compose.env`：root 所有、`0600`，仅镜像和路径变量。
- `/etc/qikuku/production.env`：root 所有、`0600`，由单独的受控步骤创建。
- `/etc/qikuku/tencentdb-ca.pem`：root 所有、`0644`，仅腾讯云公开 CA。

应用镜像必须在部署前以不可变 tag 导入 CVM。生产 Compose 永不构建或拉取镜像；启动脚本使用 `--no-build --pull never`。

当前部署包不包含 migrator 或 PostgreSQL 备份镜像。运行迁移或备份前，需要在独立审批步骤中导入并校验对应官方镜像。
