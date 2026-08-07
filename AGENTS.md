# Vault2077 协作与长期记忆规则

本仓库可提交的长期项目记忆位于 `docs/Vault2077-Project-Memory.md`；当前设备的私有生产资源清单位于 `.vault2077-operations-memory.local.md`，该文件存在时也必须阅读，但永远不得提交。开始任何开发、发布或运维工作前，必须先阅读这些记忆、`docs/README.md` 和与任务有关的权威规格或 ADR，并运行 `git status --short --branch`；不得覆盖、重置或混入用户已有改动。

## 不可破坏的边界

- `docs/README.md` 定义文档权威层级；项目记忆只总结已验证事实和当前状态，不覆盖产品规格、ADR、系统交付规格或上线门禁。
- 生产公开内容、业务状态、后台会话、审计和任务状态以 PostgreSQL 为事实源；文件适配器只用于本地开发和预览。
- 境外 GitHub Actions 只采集公开数据并投递签名批次；境内 VPS 的独立 worker 才能调用编辑模型和写入生产状态。
- 公网只精确开放 `POST /api/internal/acquisition` 和带独立凭证的 `GET /api/internal/frontier/tasks`；Node、RDS、health、处理入口与后台不得通过公开域名或源站 IP 绕过。
- 生产管理员固定使用独立管理域名的原生 Passkey；不得恢复共享密码、OIDC、Basic Auth 或客户端身份断言。
- 不读取、打印、提交或在聊天中复述私钥、数据库连接串、AccessKey Secret、API key、支付密钥、恢复码和生产环境文件内容。检查配置时只报告字段名、状态、后四位或指纹等非秘密证据。

## 变更与发布

- 本地变更至少按风险运行 `npm run docs:check`、`npm run lint`、`npm run typecheck`、`npm test`；涉及构建、采集器或 Python 时补充生产构建、E2E、Ruff 和 Python 测试。
- 生产发布顺序固定为：确认 commit 与发布包哈希 → 备份/恢复点 → 安装新 release → `deploy:check` → 编辑提供方探针 → 数据库迁移 → 必要时一次性 bootstrap → 启动 Web → health → 四通道闭环 → 业务验收 → 启用 timers/功能开关 → 公开切流。
- 当前仓库只有构建发布包 workflow，没有自动部署 workflow；不得把“推送到 GitHub”描述为“已经部署”。
- 真实资金、Passkey 实体注册、Frontier 奖励、RPO/RTO 降级、DNS 切流和最终 Go/No-Go 需要项目负责人明确授权或亲自完成。

## 维护长期记忆

架构、运行合同、发布方式和凭证边界变化时，在同一次提交中更新 `docs/Vault2077-Project-Memory.md`。精确实例 ID、私网地址、VPC、安全组、SSH 指纹、RAM 身份、备份 ID、生产 commit、功能开关和实时告警只更新 `.vault2077-operations-memory.local.md`。两层都不记录任何秘密值。
