---
type: runbook
status: active
updated: 2026-07-24
---

# Vault2077 部署配置手册

## 1. 环境级别

- 本地开发：允许开发默认值与文件适配器。
- 预览：允许单写者文件适配器，但必须标识演示，禁止真实报名、自动发布、收款和结算。
- 生产：必须使用 PostgreSQL、严格密钥、后台安全、备份和监控；缺项时关闭相关写能力。

## 2. 应用秘密

| 变量 | 生产要求 | 用途 |
| --- | --- | --- |
| `VAULT2077_DATA_KEY` | 必需 | 私人字段加密 |
| `VAULT2077_ADMIN_PASSWORD` | 必需 | 后台共享口令 |
| `VAULT2077_ADMIN_SESSION_SECRET` | 必需 | 后台会话签名 |
| `VAULT2077_PIPELINE_SHARED_SECRET` | 必需 | 统一批次签名 |
| `VAULT2077_PIPELINE_WORKER_SECRET` | 建议独立 | 处理入口鉴权 |

所有值由秘密管理注入；生产不得使用开发默认值。

## 3. 采集与投递

| 变量 | 位置 | 说明 |
| --- | --- | --- |
| `VAULT2077_DOMESTIC_ACQUISITION_URL` | 采集侧 | `/api/internal/acquisition` |
| `VAULT2077_DOMESTIC_ACQUISITION_PROCESS_URL` | 采集侧 | `/api/internal/acquisition/process` |
| `VAULT2077_REQUIRE_DOMESTIC_DELIVERY` | 采集侧 | 生产计划任务必须为 `true` |
| `VAULT2077_SOURCE_BUNDLE_FILE` | 两侧 | 来源 bundle |
| `VAULT2077_SOURCE_BUNDLE_REVISION` | 境内 | 紧急显式修订 |
| `VAULT2077_ACQUISITION_MAX_RECORDS` | 两侧 | 单批硬上限 |
| `VAULT2077_SOURCE_TIMEOUT_SECONDS` | 采集侧 | 单来源超时 |
| `VAULT2077_MAX_UPSTREAM_BYTES` | 采集侧 | 上游响应上限 |
| `VAULT2077_PROCESS_TIMEOUT_SECONDS` | 采集侧 | 等待处理上限 |
| `VAULT2077_TRIGGER_PROCESSING` | 采集侧 | 投递后触发处理 |

旧 SiC 独立 URL 仅用于迁移兼容，生产配置应为空并最终删除。

## 4. 编辑处理

`VAULT2077_LLM_BASE_URL`、`VAULT2077_LLM_API_KEY`、`VAULT2077_LLM_MODEL`、超时与并发只在境内配置，且不向公开页面展示。rankings 不使用编辑模型；提供方缺失时，内容通道不得把未经处理的数据伪装成已发布。

## 5. 数据

`VAULT2077_DATA_DIR` 只规范预览文件和本地报告。当前 Frontier 仍固定使用 `data/mvp-store.json`，这是待修复差距，不能据此宣称统一备份完成。

生产 v1 必须配置 PostgreSQL 并在启动前运行兼容迁移。Redis 与对象存储保持未配置，除非容量和恢复需求已经形成批准决策。

## 6. GitHub Actions

目标只保留一个采集 workflow，支持四 lane：

- information：北京时间偶数小时 `:05`
- roadside：北京时间偶数小时 `:55`
- sic：北京时间 `07:25`、`19:25`
- rankings：每小时

计划任务必须要求成功投递。workflow 权限保持 `contents: read`，artifact 不得含密钥、邮箱或后台数据。

## 7. 反向代理与公开边界

- 只公开产品路由和必要表单 API。
- acquisition、process、后台与诊断路由由网络策略和应用鉴权共同保护。
- `/pipeline` 只允许回环/内部网络或认证后台访问，并设置 `noindex`。
- 配置 TLS、HSTS、CSP、MIME 防护、Referrer Policy、请求体限制与日志脱敏。

## 8. 部署步骤

1. 固定提交、运行时和锁文件。
2. 注入秘密并拒绝开发默认值。
3. 运行文档、类型、单元、采集器、构建和 E2E。
4. 生产运行 PostgreSQL 迁移并确认恢复点。
5. 部署应用，再启用统一采集计划。
6. 验证四通道新鲜度、公开降级、后台鉴权和 `/pipeline` 边界。
7. 保存证据；失败按上一版本和数据库迁移策略回滚。

## 9. 轮换与事故

密钥轮换按新旧短暂双读、采集侧切换、确认新签名、撤销旧值进行。事故时暂停写入口和计划任务，保留审计与批次证据；恢复前重新验证重放、来源 revision 和备份一致性。
