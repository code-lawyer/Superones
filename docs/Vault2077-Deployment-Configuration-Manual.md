---
type: runbook
status: active
updated: 2026-07-28
---

# Vault2077 部署配置手册

## 1. 环境级别

- 本地开发：允许开发默认值与文件适配器。
- 预览：允许单写者文件适配器，但必须标识演示，禁止真实报名、自动发布、收款和结算。
- 生产：必须使用 PostgreSQL、严格密钥、后台安全、备份和监控；缺项时关闭相关写能力。

## 2. 应用秘密

| 变量 | 生产要求 | 用途 |
| --- | --- | --- |
| `VAULT2077_DATA_KEYS` | 必需，JSON 对象，1-8 把 | 私人字段加密密钥环 |
| `VAULT2077_DATA_ACTIVE_KEY_ID` | 必需且存在于密钥环 | 新私人字段密文的 key ID |
| `VAULT2077_ADMIN_SESSION_SECRET` | 必需 | 后台会话令牌摘要密钥 |
| `VAULT2077_AUDIT_HASH_SECRET` | 必需 | 客户地址匿名化 |
| `VAULT2077_PIPELINE_SIGNING_KEYS` | 必需，JSON 对象，1-8 把 | 统一批次签名验签密钥环 |
| `VAULT2077_PIPELINE_ACTIVE_KEY_ID` | 必需且存在于密钥环 | 境外交付使用的 key ID |
| `VAULT2077_PIPELINE_WORKER_SECRET` | 必须独立 | 回环手动处理入口鉴权 |
| `VAULT2077_FRONTIER_TASKS_SECRET` | 必须独立，仅境内与 GitHub Actions 持有 | 读取已脱敏公开回退任务 |
| `GITHUB_TOKEN` | Frontier 生产必需 | 境内只读公开仓库快速路径 |
| `VAULT2077_FRONTIER_TICK_SECRET` | Frontier 生产必需 | 境内每小时观察入口鉴权 |
| `VAULT2077_HEALTH_SECRET` | 必需 | 受保护健康/新鲜度检查鉴权 |

所有值由秘密管理注入；生产不得使用开发默认值。每个信任边界必须使用彼此独立的随机密钥，生产配置门禁会拒绝跨用途复用。门禁同时拒绝旧单值 `VAULT2077_DATA_KEY` 和 `VAULT2077_PIPELINE_SHARED_SECRET`。密钥环示例为 `{"2026-07":"至少32字节随机值"}`；环境文件中应整体引用 JSON，GitHub Secret 中保存不带外层引号的 JSON 正文。

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
| `VAULT2077_FRONTIER_PUBLIC_TASKS_URL` | 采集侧 | `/api/internal/frontier/tasks`，只返回公开回退任务 |
| `VAULT2077_FRONTIER_TASKS_SECRET` | 两侧 | 独立 Bearer 密钥；不得复用签名、worker、后台或 LLM 密钥 |
| `VAULT2077_REQUIRE_DOMESTIC_DELIVERY` | 采集侧 | 生产计划任务必须为 `true` |
| `VAULT2077_SOURCE_BUNDLE_FILE` | 两侧 | 来源 bundle |
| `VAULT2077_SOURCE_BUNDLE_REVISION` | 境内 | 紧急显式修订 |
| `VAULT2077_ALLOWED_SOURCE_REVISIONS` | 境内 | 灰度期逗号分隔允许修订 |
| `VAULT2077_ACQUISITION_RUN_MODE` | 采集侧 | `incremental` 或一次性 `bootstrap` |
| `VAULT2077_ACQUISITION_MAX_ATTEMPTS` | 境内 | 进入 quarantine 前的处理上限 |
| `VAULT2077_ACQUISITION_WORKER_MAX_BATCHES` | 境内 | 每次 timer 消费的批次数，默认 8 |
| `VAULT2077_ACQUISITION_MAX_RECORDS` | 两侧 | 单批硬上限 |
| `VAULT2077_SOURCE_TIMEOUT_SECONDS` | 采集侧 | 单来源超时 |
| `VAULT2077_MAX_UPSTREAM_BYTES` | 采集侧 | 上游响应上限 |
| `VAULT2077_DELIVERY_ATTEMPTS` | 采集侧 | 同一批次投递次数，生产默认 4 |
| `VAULT2077_DELIVERY_TIMEOUT_MS` | 采集侧 | 单次境内投递超时 |
| `VAULT2077_DELIVERY_RETRY_BASE_MS` | 采集侧 | 指数退避基数 |

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

### OPC 支付宝收款

| 变量 | 说明 |
| --- | --- |
| `VAULT2077_OPC_ALIPAY_QR_PATH` | `public/` 下真实支付宝收款码的站内绝对路径，例如 `/opc/alipay-payment-qr.png`；只接受 PNG、WebP 或 JPEG，不接受外部 URL 或 SVG |
| `VAULT2077_OPC_ALIPAY_PAYEE` | 用户扫码后应在支付宝中看到的真实收款方名称，2–80 字 |

生产环境两项都必须配置，`npm run deploy:check` 会拒绝缺失、占位或外部二维码路径。二维码文件不得提交为测试码；部署后必须使用目标支付宝账户扫码，核对支付宝显示的收款方名称与配置完全一致。更换收款码时应在受控发布中同时更新静态资源和收款方配置，并完成一笔小额端到端到账/退款演练。

`VAULT2077_DATA_DIR` 统一规范预览文件和本地报告，包括 Frontier 预览存储；它不构成生产数据库或备份。Next 生产进程只有在显式设置 `VAULT2077_ALLOW_FILE_PREVIEW=true` 时才允许文件模式，该开关只用于 E2E/本地预览，生产部署必须保持关闭。

生产 v1 配置 `VAULT2077_DATABASE_URL`、`VAULT2077_DATABASE_SSL` 与有界连接池，并在启动前运行 `npm run db:migrate`。当前迁移覆盖业务聚合、统一 inbox、不可变审计、登录锁定、分布式限速和可撤销后台会话；健康检查必须确认最新迁移名为 `0005_admin_sessions.sql`，迁移文件应用后不得修改。

阿里云首个商用版本优先使用同 VPC 的 RDS PostgreSQL，而不是把 PostgreSQL 与 Node 放在同一台 VPS。RDS 必须开启 TLS、自动备份、日志备份/时间点恢复、删除保护和监控；上线前从生产备份恢复到隔离实例并记录 RPO/RTO。Redis 当前不需要。OSS 当前也不需要；只有原始包/长期归档体量超过数据库保留策略后，才通过新 ADR 引入私有 Bucket、服务端加密、生命周期与恢复验证。

## 6. GitHub Actions

目标只保留一个境外采集 workflow，支持四 lane：

- information：北京时间偶数小时 `:05`
- roadside：北京时间偶数小时 `:55`
- sic：北京时间 `07:25`、`19:25`
- rankings：每小时

计划任务必须要求成功投递。交付模块对瞬时网络错误做最多四次同批次重试，但 GitHub 定时任务仍可能延迟或被平台丢弃，因此必须以境内内容新鲜度告警发现漏跑，并通过 `workflow_dispatch` 使用新的 schedule ID 补跑。workflow 权限保持 `contents: read`，artifact 不得含密钥、邮箱或后台数据。

GitHub Actions 只持有接收 URL、公开任务 URL、公开任务只读密钥、版本化签名密钥环和活动 key ID，不得持有 worker、后台、用户数据或境内 LLM 密钥，也不得调用 `/api/internal/acquisition/process`。境内安装并启用 `vault2077-acquisition-worker.{service,timer}`，每五分钟消费 inbox；Frontier 每小时执行 `npm run frontier:tick`。两类任务都以 systemd 退出码、append-only 审计和 `/api/internal/health` 判断成功，并配置失败告警和错过任务补跑策略。

Frontier 境内 GitHub 请求必须使用服务端只读凭证、短超时、限流、缓存或条件请求并记录最近成功时间。普通页面不得触发 GitHub 请求；直读失败必须转为只含公开仓库标识的 rankings 回退任务。

相关变量为 `GITHUB_TOKEN`、`VAULT2077_GITHUB_TIMEOUT_MS`、`VAULT2077_GITHUB_CONCURRENCY`。生产必须使用仓库 Nginx 模板覆盖 `X-Forwarded-For` 与 `X-Real-IP`，随后设置 `VAULT2077_TRUST_PROXY_HEADERS=true`；门禁不再允许未信任代理头的生产配置。若前面还有 CDN/身份网关，必须以 `set_real_ip_from` 限定其出口地址后再恢复真实地址，不得直接信任用户提交的头。

## 7. 反向代理与公开边界

- 仓库中的 `deploy/nginx/vault2077.conf.example`、`deploy/nginx/vault2077-admin-proxy.conf.example` 和 `deploy/systemd/vault2077-web.service` 是双入口与应用服务模板；部署时必须替换域名、证书路径、目录和身份网关配置，并先通过目标环境审查。
- 只公开产品路由和必要表单 API。
- 内部命名空间在公网仅开放两个精确跨境接口：`POST /api/internal/acquisition` 负责写入签名批次，`GET /api/internal/frontier/tasks` 使用独立只读密钥返回已脱敏公开任务；两者均由 Nginx 先执行方法和速率限制。
- `/api/internal/acquisition/process`、健康、Frontier tick、后台与诊断路由不得经公开域名访问；监控和人工处理使用回环或受控内网。
- `/admin` 与 `/api/admin/*` 只在 `VAULT2077_ADMIN_ORIGIN` 的主机上提供；公开站主机显式拒绝这些路径。
- 管理入口前置身份访问网关，网关覆盖身份断言头；反向代理只监听回环应用端口，防火墙拒绝服务器 IP 绕过。
- 监控以 Bearer 密钥读取 `/api/internal/health`；`503` 或任一 degraded 检查触发告警，不向公网匿名暴露检查详情。
- `/pipeline` 只允许回环/内部网络或认证后台访问，并设置 `noindex`。
- 配置 TLS、HSTS、逐请求 nonce CSP、MIME 防护、Referrer Policy、请求体限制与日志脱敏。nonce 使页面采用动态渲染；首发 VPS 必须以压测确认可接受的 CPU、TTFB 和并发。

## 8. 部署步骤

1. 固定提交、Node/Python 运行时和锁文件；在阿里云创建 VPC、ECS/VPS、同 VPC RDS、安全组、DNS、TLS 证书和监控联系人。
2. 安全组仅允许公网 `80/443`，SSH 只允许受控运维来源；RDS 只允许应用安全组访问。Node 只监听 `127.0.0.1:3000`。
3. 配置独立管理来源、身份网关白名单、Passkey/MFA 策略、JWT 发行者/受众/JWKS 与再认证地址；确认公网域名和服务器 IP 都不能绕过网关。
4. 生成彼此独立的高熵秘密与两个版本化密钥环；把采集签名密钥环、活动 ID 和 Frontier 公开任务只读密钥配置到 GitHub Secrets，把完整验签密钥环配置在境内。不得复制 worker、LLM、后台或用户数据秘密到 GitHub。
5. 在最终生产环境变量下运行 `npm run deploy:check`，再运行文档、ESLint、Ruff、类型、单元、采集器、构建和 E2E。
6. 运行 PostgreSQL 迁移，确认健康检查识别最新迁移；创建自动备份后执行一次隔离恢复演练。
7. 安装 Nginx、`vault2077-web.service`、`vault2077-acquisition-worker.timer` 与 `vault2077-frontier-tick.timer`；执行 `nginx -t`、`systemd-analyze verify` 并接入失败告警。
8. 部署应用但暂不开放内容频道；执行一次性 bootstrap，把 SiC 每个 approved 来源的最近一条合格内容与 Vault 最近 30 天真实内容写入生产事实源。
9. 验证 bootstrap 的逐来源覆盖、原始日期、稳定 ID、分批处理和幂等补跑，再启用统一增量计划和境内两个 timer。
10. 在生产等价预发布环境验证投递重试、GitHub 漏跑补跑、worker 积压恢复、四通道新鲜度、Frontier 快速路径与异步回退、公开降级、后台会话与再认证、OPC 下单/到账/完成/退款状态流转、反向代理伪造头拒绝和 `/pipeline` 边界。
11. 完成容量基准、告警演练、回滚演练和发布签字；失败按上一应用版本和向前兼容数据库迁移策略回滚。

bootstrap 是一次性受审计作业，不是应用启动钩子。多副本启动不得各自触发回填；新增 approved 来源时只对该来源执行同一基线规则。

## 9. 轮换与事故

管线签名轮换：

1. 在境内 `VAULT2077_PIPELINE_SIGNING_KEYS` 加入新 key ID，保留旧值并重启/复验接收端。
2. 在 GitHub Secret 中加入同一新密钥，把 `VAULT2077_PIPELINE_ACTIVE_KEY_ID` 切到新 ID。
3. 手动投递一个受审计批次，确认接收报告记录新 key ID；观察至少一个完整通道周期。
4. 从 GitHub 和境内密钥环删除旧密钥，再运行 `deploy:check`。不得先删境内旧密钥。

敏感数据轮换先把新值加入 `VAULT2077_DATA_KEYS` 并切换活动 ID。新写入自动使用新版本，旧密文按自身 key ID 解密；无 key ID 的历史密文会尝试保留的旧密钥。删除旧数据密钥前，必须确认相应数据已过保留期或已通过受审计迁移重加密，不能仅凭新写入成功删除。

事故时暂停公网写入口、境外计划和境内 worker timer，保留审计与批次证据；恢复前重新验证重放、来源 revision、密钥版本和备份一致性。
