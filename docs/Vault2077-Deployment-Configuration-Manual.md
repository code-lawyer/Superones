---
type: runbook
status: active
updated: 2026-07-25
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
| `VAULT2077_ADMIN_SESSION_SECRET` | 必需 | 后台会话令牌摘要密钥 |
| `VAULT2077_AUDIT_HASH_SECRET` | 必需 | 客户地址匿名化 |
| `VAULT2077_PIPELINE_SHARED_SECRET` | 必需 | 统一批次签名 |
| `VAULT2077_PIPELINE_WORKER_SECRET` | 必须独立 | 处理入口鉴权 |
| `GITHUB_TOKEN` | Frontier 生产必需 | 境内只读公开仓库快速路径 |
| `VAULT2077_FRONTIER_TICK_SECRET` | Frontier 生产必需 | 境内每小时观察入口鉴权 |
| `VAULT2077_HEALTH_SECRET` | 必需 | 受保护健康/新鲜度检查鉴权 |

所有值由秘密管理注入；生产不得使用开发默认值。

生产后台身份配置：

| 变量 | 生产要求 | 用途 |
| --- | --- | --- |
| `VAULT2077_PUBLIC_ORIGIN` | 必需 | 公开站规范来源 |
| `VAULT2077_ADMIN_ORIGIN` | 必需且不同于公开来源 | 独立管理来源 |
| `VAULT2077_ADMIN_IDENTITY_ISSUER` | 必需 | 身份网关 JWT 发行者 |
| `VAULT2077_ADMIN_IDENTITY_AUDIENCE` | 必需 | 身份网关 JWT 受众 |
| `VAULT2077_ADMIN_IDENTITY_JWKS_URL` | 必需且为 HTTPS | 签名公钥与轮换入口 |
| `VAULT2077_ADMIN_IDENTITY_HEADER` | 必需 | 受信任代理注入 JWT 的请求头 |
| `VAULT2077_ADMIN_IDENTITY_ALLOWLIST` | 必需 | 逗号分隔的 `owner` 邮箱白名单 |
| `VAULT2077_ADMIN_REAUTH_URL` | 必需且同属管理来源 | 强制重新进入身份网关的地址 |

身份网关必须对允许身份强制 Passkey 或其他抗钓鱼 MFA。源站必须只接受网关或回环网络；仅验证 JWT 而仍允许任意公网流量直达源站不算完成部署。

## 3. 采集与投递

| 变量 | 位置 | 说明 |
| --- | --- | --- |
| `VAULT2077_DOMESTIC_ACQUISITION_URL` | 采集侧 | `/api/internal/acquisition` |
| `VAULT2077_DOMESTIC_ACQUISITION_PROCESS_URL` | 采集侧 | `/api/internal/acquisition/process` |
| `VAULT2077_FRONTIER_PUBLIC_TASKS_URL` | 采集侧 | `/api/internal/frontier/tasks`，只返回公开回退任务 |
| `VAULT2077_REQUIRE_DOMESTIC_DELIVERY` | 采集侧 | 生产计划任务必须为 `true` |
| `VAULT2077_SOURCE_BUNDLE_FILE` | 两侧 | 来源 bundle |
| `VAULT2077_SOURCE_BUNDLE_REVISION` | 境内 | 紧急显式修订 |
| `VAULT2077_ALLOWED_SOURCE_REVISIONS` | 境内 | 灰度期逗号分隔允许修订 |
| `VAULT2077_ACQUISITION_RUN_MODE` | 采集侧 | `incremental` 或一次性 `bootstrap` |
| `VAULT2077_ACQUISITION_MAX_ATTEMPTS` | 境内 | 进入 quarantine 前的处理上限 |
| `VAULT2077_ACQUISITION_MAX_RECORDS` | 两侧 | 单批硬上限 |
| `VAULT2077_SOURCE_TIMEOUT_SECONDS` | 采集侧 | 单来源超时 |
| `VAULT2077_MAX_UPSTREAM_BYTES` | 采集侧 | 上游响应上限 |
| `VAULT2077_PROCESS_TIMEOUT_SECONDS` | 采集侧 | 等待处理上限 |
| `VAULT2077_TRIGGER_PROCESSING` | 采集侧 | 投递后触发处理 |

已删除的旧 SiC 独立 URL 不得重新加入生产配置。

来源配置分工：

- `config/institutional-news-registry.json`：机构公告、新闻与重大发布；
- `config/sic-source-registry.json`：论文、深度档案、课程与播客；
- `config/source-bundle.json`：构建后的 information/roadside 运行清单。

构建必须排除两个注册表之间的生产重复；无法稳定分流的机构混合 Feed 保持待审。

## 4. 编辑处理

生产配置以逻辑频道编辑配置为边界，不把具体提供方硬编码为产品频道：

| 逻辑配置 | 内容范围 | 必需隔离项 |
| --- | --- | --- |
| `vault_editorial` | information、roadside、Vault 事件编排 | 主提供方、受控备用、队列、并发、预算、超时、熔断 |
| `sic_editorial` | sic 内容 | 主提供方、受控备用、队列、并发、预算、超时、熔断 |

两个配置都只在境内持有凭证，均须记录提供方、模型、提示和处理版本。提供方缺失、预算耗尽或两个提供方均失败时，内容保留在队列或隔离区，不得把未经处理的数据伪装成已发布。rankings 以及 Frontier 的确定性核验、观察、排名和结算不得使用编辑模型。

变量分别使用 `VAULT2077_VAULT_LLM_*` 与 `VAULT2077_SIC_LLM_*` 前缀；主配置包含 `BASE_URL`、`API_KEY`、`MODEL`、`TIMEOUT_MS`、`CONCURRENCY`、`BATCH_ITEMS`、`MAX_REQUESTS_PER_RUN`，受控备用使用各自的 `FALLBACK_BASE_URL`、`FALLBACK_API_KEY`、`FALLBACK_MODEL` 与 `FALLBACK_TIMEOUT_MS`。旧 `VAULT2077_LLM_*` 只作为非生产迁移期本地预览兼容层，生产会拒绝只提供旧配置。

## 5. 数据

`VAULT2077_DATA_DIR` 统一规范预览文件和本地报告，包括 Frontier 预览存储；它不构成生产数据库或备份。Next 生产进程只有在显式设置 `VAULT2077_ALLOW_FILE_PREVIEW=true` 时才允许文件模式，该开关只用于 E2E/本地预览，生产部署必须保持关闭。

生产 v1 配置 `VAULT2077_DATABASE_URL`、`VAULT2077_DATABASE_SSL` 与有界连接池，并在启动前运行 `npm run db:migrate`。当前迁移覆盖业务聚合、统一 inbox、不可变审计、登录锁定、分布式限速和可撤销后台会话；迁移文件应用后不得修改。Redis 与对象存储保持未配置，除非容量和恢复需求已经形成批准决策。

## 6. GitHub Actions

目标只保留一个境外采集 workflow，支持四 lane：

- information：北京时间偶数小时 `:05`
- roadside：北京时间偶数小时 `:55`
- sic：北京时间 `07:25`、`19:25`
- rankings：每小时

计划任务必须要求成功投递。workflow 权限保持 `contents: read`，artifact 不得含密钥、邮箱或后台数据。Frontier 的每小时观察是境内业务调度，不属于境外采集 workflow；境内 scheduler 每小时执行 `npm run frontier:tick`，并以任务退出码、append-only 审计和 `/api/internal/health` 共同判断成功。仓库的 `deploy/systemd/vault2077-frontier-tick.{service,timer}` 是可安装模板，部署方必须确认用户、目录、环境文件、告警和错过任务补跑策略。

Frontier 境内 GitHub 请求必须使用服务端只读凭证、短超时、限流、缓存或条件请求并记录最近成功时间。普通页面不得触发 GitHub 请求；直读失败必须转为只含公开仓库标识的 rankings 回退任务。

相关变量为 `GITHUB_TOKEN`、`VAULT2077_GITHUB_TIMEOUT_MS`、`VAULT2077_GITHUB_CONCURRENCY`。反向代理只有在确认会覆盖而非追加外部转发头后才设置 `VAULT2077_TRUST_PROXY_HEADERS=true`；否则所有未知客户共享保守限额，不信任可伪造的 `X-Forwarded-For`。

## 7. 反向代理与公开边界

- 仓库中的 `deploy/nginx/vault2077.conf.example`、`deploy/nginx/vault2077-admin-proxy.conf.example` 和 `deploy/systemd/vault2077-web.service` 是双入口与应用服务模板；部署时必须替换域名、证书路径、目录和身份网关配置，并先通过目标环境审查。
- 只公开产品路由和必要表单 API。
- acquisition、process、后台与诊断路由由网络策略和应用鉴权共同保护。
- `/admin` 与 `/api/admin/*` 只在 `VAULT2077_ADMIN_ORIGIN` 的主机上提供；公开站主机显式拒绝这些路径。
- 管理入口前置身份访问网关，网关覆盖身份断言头；反向代理只监听回环应用端口，防火墙拒绝服务器 IP 绕过。
- 监控以 Bearer 密钥读取 `/api/internal/health`；`503` 或任一 degraded 检查触发告警，不向公网匿名暴露检查详情。
- `/pipeline` 只允许回环/内部网络或认证后台访问，并设置 `noindex`。
- 配置 TLS、HSTS、CSP、MIME 防护、Referrer Policy、请求体限制与日志脱敏。

## 8. 部署步骤

1. 固定提交、运行时和锁文件。
2. 配置独立管理来源、身份网关白名单、Passkey/MFA 策略、JWT 发行者/受众/JWKS 与再认证地址；注入会话及审计秘密并拒绝开发默认值。
3. 在最终生产环境变量下运行 `npm run deploy:check`，再运行文档、类型、单元、采集器、构建和 E2E。
4. 生产运行 PostgreSQL 迁移并确认恢复点。
5. 部署应用但暂不开放内容频道；执行一次性 bootstrap，把 SiC 每个 approved 来源的最近一条合格内容与 Vault 最近 30 天真实内容写入生产事实源。
6. 验证 bootstrap 的逐来源覆盖、原始日期、稳定 ID、分批处理和幂等补跑，再启用统一增量计划和境内 Frontier 业务调度。
7. 在生产等价预发布环境验证四通道新鲜度、Frontier 快速路径与异步回退、公开降级、后台身份断言、单会话撤销、再认证、公共主机拒绝、服务器 IP 绕过失败和 `/pipeline` 边界。
8. 保存证据；失败按上一版本和数据库迁移策略回滚。

bootstrap 是一次性受审计作业，不是应用启动钩子。多副本启动不得各自触发回填；新增 approved 来源时只对该来源执行同一基线规则。

## 9. 轮换与事故

密钥轮换按新旧短暂双读、采集侧切换、确认新签名、撤销旧值进行。事故时暂停写入口和计划任务，保留审计与批次证据；恢复前重新验证重放、来源 revision 和备份一致性。
