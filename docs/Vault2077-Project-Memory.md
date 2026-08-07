---
type: project-memory
status: active
updated: 2026-08-07
---

# Vault2077 项目长期记忆

本文是供长期共同开发、发布和运维使用的项目地图。它记录代码与外部环境交叉核验后的稳定事实、当前状态、未知项和凭证边界，不创造产品需求，也不替代 [文档权威索引](README.md)、[系统交付规格](Vault2077-System-Delivery-Spec.md)、[上线清单](Vault2077-Launch-Checklist.md) 或已接受 ADR。

## 1. 项目定位与产品边界

Vault2077 是面向超级个体与一人公司的公开网站，固定包含四个一级频道：

- Vault 信息流：资讯瀑布、永久事件簿、路边信息和可追溯证据。
- OPC 服务台：结构化服务目录、游骑兵档案、无账号纸质签约订单、支付宝付款/退款和后台履约。
- SiC 学院：论文、档案、课程、播客和平台原生榜。
- 边境计划：公开 GitHub 仓库报名、挑战、观察、排行、奖励与结算。

公开用户不创建 Vault2077 账户。生产后台只有固定 owner，通过 `admin.superones.top` 上的原生 WebAuthn/Passkey 登录。公开内容采集和境内编辑发布分属两个信任域。

## 2. 技术栈与仓库结构

| 层 | 当前实现 |
| --- | --- |
| Web | Next.js 16.2.11 App Router、React 19.2.7、TypeScript 5.9、Node.js 24 |
| 采集 | Node 统一编排；Python 3.12 feed collector；vendored Horizon 只作为隔离采集依赖 |
| 数据库 | PostgreSQL；生产使用 RDS；`pg` 连接池基线为每进程 4 个连接 |
| 对象存储 | `ali-oss`；公开头像 Bucket 与未来电子合同私有 Bucket 严格分离 |
| 支付/通知 | `alipay-sdk`、`nodemailer`；当前首发路径是纸质签约和全额预付 |
| 身份 | `@simplewebauthn/server` 与浏览器端 WebAuthn；可撤销服务器会话 |
| 反向代理/进程 | Nginx、systemd、journald、logrotate |
| CI | GitHub Actions：质量检查、Linux 构建发布包、四通道境外采集 |

主要目录：

- `app/`：公开页面、后台页面和 API Route Handlers。
- `lib/`：领域逻辑、存储适配、采集协议、安全、支付、OSS、Passkey 和健康检查。
- `lib/opc-orders/`：OPC 无账号订单的深模块；`model`、`checkout`、`signature`、`payment`、`refund`、`admin` 提供业务 interface，`internal-store` 是唯一持有 `opc-orders` 状态文档 schema 与迁移解析的内部持久化核心；`lib/opc-order-store.ts` 只保留兼容 facade。
- `collector/`：Python feed collector 与隔离的第三方采集能力。
- `migrations/`：版本化 PostgreSQL 迁移；历史迁移受 checksum 保护。
- `scripts/`：迁移、采集、worker、bootstrap、提供方探针、健康检查和运维命令。
- `deploy/`：Nginx、systemd 与 logrotate 的生产模板。
- `config/`：批准来源、运行时 source bundle 和来源健康快照。
- `data/bootstrap/`：可验证的非敏感首发基线；不是生产事实源。

## 3. 运行拓扑

```text
浏览器
  ├─ superones.top ───────────────┐
  └─ admin.superones.top ─────────┤
                                  v
                              Nginx :443
                                  |
                           127.0.0.1:3000
                                  |
                     Next.js / Node.js 24
                       /       |        \
              RDS PostgreSQL   |       OSS
                     TLS 私网   |    内网上传/公网媒体读
                               |
                 境内 systemd timers

GitHub Actions（境外）
  ├─ information / roadside / sic / rankings 公开采集
  ├─ HMAC POST /api/internal/acquisition
  └─ 凭证 GET /api/internal/frontier/tasks
```

Nginx 的公开主机只允许两个精确内部路由：

- `POST /api/internal/acquisition`：验证版本化 HMAC、时间窗、批次幂等、大小和来源快照后，只写入 PostgreSQL inbox，立即返回。
- `GET /api/internal/frontier/tasks`：使用独立只读秘密返回脱敏的公开仓库观察任务。

`/api/internal/acquisition/process`、`/api/internal/health`、Frontier tick、后台、数据库和 Node 3000 都不得暴露公网。管理主机只代理 `/admin`、`/api/admin/*`、`/pipeline` 和所需的 `/_next/*`。Nginx 自行生成的 `404/405` 也必须带 HSTS、禁止 MIME 探测、禁止嵌入和限制性 CSP，并隐藏具体版本号。

## 4. 内容与任务运行逻辑

### 4.1 统一境外采集

`.github/workflows/collect-content.yml` 是唯一生产采集 workflow。四通道独立运行：

| 通道 | 北京时间节奏 | 境内编辑 |
| --- | --- | --- |
| `information` | 08:05–22:05，每两小时 | `vault_editorial` |
| `roadside` | 08:55–22:55，每两小时 | `vault_editorial` |
| `sic` | 每日 08:25 | `sic_editorial` |
| `rankings` | 08:35、12:35、16:35、20:35 | 不使用模型 |

采集结果使用 `AcquisitionBatch v2`。签名正文携带 lane 的最小来源快照，因此仅增删或改名已支持 adapter 的来源时，不要求境内外 revision 完全一致；新增 adapter 或 schema 仍要先部署兼容代码。网络错误、`408/425/429` 和 `5xx` 使用同一正文与 `batchId` 有界重试，确定性错误不盲目重试；YouTube 官方 Atom feed 的瞬时 `404` 作为来源特例有界重试。Hugging Face 周论文仍以 arXiv 规范元数据为准，并在两个获批的 arXiv 官方 API origin 间顺序回退。每个批次在签名和境内投递前执行高置信凭据预检；公开来源中的普通邮箱与技术文档里的通用凭据示例不得被当作项目秘密误报，高置信提供方令牌、私钥、带口令 URL 等仍对包括公开正文在内的完整批次执行检查。归档校验只输出规则 ID 和文件路径，不输出命中值。

### 4.2 境内 inbox 与 worker

`vault2077-acquisition-worker.timer` 每五分钟运行 `npm run acquisition:work`。状态机为：

`received → processing → processed`，失败进入 `retryable` 或 `quarantined`。

worker 使用 claim token、租约和 PostgreSQL `SKIP LOCKED` 防止旧 worker 迟到提交；瞬时失败最多六次指数退避。成功记录保留 30 天，隔离记录保留 180 天。发布业务状态和批次完成状态在同一事务提交，避免页面读到半批结果。

### 4.3 编辑与公开状态

- `vault_editorial` 处理 information、roadside 和 Vault 事件编排。
- `sic_editorial` 独立处理 SiC 技术长文与研究材料。
- 两个 profile 分别配置主提供方、可选备用、并发、批量、超时和熔断，不随机分流，也不并行生成后择优。
- SiC 对提供方协议无效响应先在当前小批次内重试，再递归拆分定位；DNS、TLS、请求超时、额度和确定性 HTTP 错误等基础设施故障仍退出当前 worker，由 inbox 统一指数退避，避免一个偶发非 JSON 响应让整个大批次从头重做。
- rankings 与 Frontier 的确定性核验、观察、排行和结算不进入模型。
- information 保留最近 30 天；roadside、SiC 和平台榜按来源保留最近成功快照；事件保存不可变证据副本。

### 4.4 Frontier

报名先写入生产事实源。境内服务端用只读 GitHub token 对已知公开仓库进行短超时核验；失败时生成不含私人信息的公开任务，由 rankings 通道回传观察结果。`vault2077-frontier-tick.timer` 在北京时间 08:45–22:45 每两小时观察当前参赛仓库并推进结算。真实写入必须同时满足环境开关和后台已发布的当季真实奖励。

### 4.5 OPC

公开服务目录只读取后台发布的结构化快照。当前订单主路径是：确认在线订单及预付款协议完整快照 → 创建固定金额待付款订单 → 支付宝服务器证据核验 → `paid_pending_contract` → 后台纸质合同门禁 → `paid`；未完成合同时走稳定请求号的全额原路退款。

支付宝异步通知不等待邮件。首次真实到账在同一事务创建唯一付款凭证和 outbox；`vault2077-opc-order-maintenance.timer` 每分钟发送脱敏通知、重试稳定 Message-ID，并执行联系方式分层保留清理。e 签宝代码保留但当前纸质签约首发应保持关闭；未来启用时必须先验收独立私有合同 Bucket 和长期保留规则。

## 5. 数据与安全模型

生产状态有两种 PostgreSQL 形态：

- 专用关系表：迁移记录、采集 inbox、不可变审计、登录节流、持久限流和后台会话。
- `vault2077_state_documents` JSONB 文档：content、SiC、direct rankings、Frontier、公开任务、OPC 服务目录、OPC 订单、Passkey、纠错和 GitHub cache。写入使用行锁、版本递增和事务。

本地没有数据库 URL 时，开发环境使用 `data/*.json` 文件适配器。生产缺 RDS 时必须失败，不能静默回退文件或 bootstrap 演示数据。

敏感业务字段由版本化数据 keyring 加密。管线签名、订单恢复令牌和数据密钥均采用带 active key ID 的有限 keyring，轮换顺序是先重叠、再切换、验证读旧写新，最后撤旧。后台会话只存令牌摘要，Cookie 使用 `__Host-`、`HttpOnly`、`Secure`、`SameSite=Strict`，空闲 30 分钟、绝对 4 小时过期。

## 6. 部署与发布链路

当前 CI/CD 实际能力：

- `quality-check.yml`：PR、`main` push、每日北京时间 06:30 和手工触发；运行文档、Lint、TypeScript、Node 测试、构建、两套 E2E、Ruff 和 Python 测试。
- `build-release.yml`：仅手工触发；在 Ubuntu/Node 24 构建、裁剪开发依赖、产出 Linux x64 `tar.gz` 与 SHA-256，保留 14 天。
- `collect-content.yml`：定时/手工采集并可靠投递；产物和运行证据保留 30 天。

仓库目前没有自动部署 workflow，也没有在 push 后登录 VPS 的 CD。现行部署是：从 GitHub 构建并下载 Linux 发布包 → 核验 SHA-256 → 解压到 `/srv/vault2077/releases/<release-id>` → 保留并重用 root-only `/etc/vault2077/production.env` → 运行门禁、模型探针和迁移 → 切换 `/srv/vault2077/current` → 重启/回滚 systemd → 验证 health 与公网边界。

生产 systemd 单元：

- `vault2077-web.service`：启动前 `deploy:check` 和 `db:migrate`，只监听 `127.0.0.1:3000`。
- `vault2077-acquisition-worker.timer`：每 5 分钟。
- `vault2077-healthcheck.timer`：每 5 分钟。
- `vault2077-frontier-tick.timer`：白天每 2 小时。
- `vault2077-ranger-media-cleanup.timer`：每天 03:25。
- `vault2077-opc-order-maintenance.timer`：每分钟。

生产构建不能复用当前 Windows `node_modules` 或 Sharp 原生依赖，必须在与目标服务器同 CPU 架构的 Linux 环境完成。

## 7. 基础设施事实表

核验日期：2026-08-06。此处只保存适合进入公开版本库的稳定事实；精确实例 ID、私网地址、SSH 指纹、RAM 身份、备份 ID、实时 release 和告警保存在被 Git 忽略的 `.vault2077-operations-memory.local.md`。

| 项目 | 当前事实 | 状态/下一证据 |
| --- | --- | --- |
| GitHub | 仓库为 `code-lawyer/Superones`；质量、Linux 发布包与四通道采集 workflow 已定义 | 具体登录身份、权限、Secret 状态和运行编号只保存在本机私有记忆并在操作前重查 |
| 公开入口 | `superones.top`、`admin.superones.top` 与 `media.superones.top` 分别承担公开站、管理站和公开媒体 | 精确 DNS 记录、源站地址、证书状态和实时可达性只保存在本机私有记忆并在发布前重查 |
| VPS | 生产计算节点采用阿里云上海 ECS、Linux x86_64；Web 由 systemd 管理，Node 只监听回环 | 实例标识、规格、地址、SSH 身份、当前 release 和实时单元状态只保存在本机私有记忆 |
| RDS | 生产使用 PostgreSQL 17；当前实例控制面支持 SSL、自动快照、日志备份和本地时间点恢复区间 | 精确实例、网络、备份与保护状态只保存在本机私有记忆；隔离恢复证据仍按上线门禁核验 |
| OSS | 公开头像与未来电子合同使用相互隔离的 Bucket；头像只公开 `rangers/*`，电子合同保持私有长期保留 | 精确 Bucket、RAM 身份、版本/WORM 和实时证书状态只保存在本机私有记忆；按功能启用范围验收 |
| 生产配置 | 生产环境文件固定为 `/etc/vault2077/production.env`、`root:root`、`0600` | 文件存在性、字段完整性、轮换时间和功能开关只保存在本机私有记忆并在发布前重查 |
| Nginx/systemd | 仓库提供公开/管理双主机模板以及 Web、health、采集、Frontier、媒体清理和 OPC 维护单元 | 实际安装、启用、失败和告警状态属于实时运维事实，只保存在本机私有记忆 |

旧文档把“RDS PostgreSQL Basic 一律不支持日志备份/PITR”写成绝对事实。2026-08-06 的真实控制面显示，当前 Basic 实例已启用日志备份并返回有效的本地时间点恢复区间，因此该绝对表述已经过时。数据库门禁现在是：开启删除保护、确认恢复窗口符合 RPO，并真正恢复到隔离实例验证 RTO 与数据可读性；不能只凭 API 状态判定通过。

### 7.1 当前运行状态

实时 release、Actions run、健康降级项和 timer 状态变化频繁，只记录在本机私有生产记忆中。开始任何生产操作前必须从 GitHub Actions、systemd、health、RDS 和 OSS 重新获取当前证据，不能把公开文档中的历史快照当成健康证明。

## 8. 自主完成提交、同步和部署所需权限

凭证不得贴进聊天或提交到仓库。优先由负责人把它们配置到操作系统凭证存储、密码管理器、GitHub CLI、阿里云 CLI profile、GitHub Actions Secrets 和 VPS root-only 环境文件；协作时只提供 alias、资源标识和“已配置”状态。

### 8.1 Git 与 GitHub

最小需求：

- 对 `code-lawyer/Superones` 的 clone/fetch/push 权限，以及创建分支和 PR 的权限。
- 读取 Actions 运行和下载构建 artifact 的权限。
- 手工触发 `build-release.yml` 与 `collect-content.yml` 的 `workflow` 权限。
- 若由我接通跨境投递：管理 Actions Secrets 的权限；秘密应直接写入 GitHub，不经聊天中转。
- 分支保护、必需检查、是否允许直接推送 `main` 的明确规则。

推荐交付方式是已经登录并可验证仓库 scope 的 `gh`/Git credential，而不是发送 PAT 明文。

### 8.2 VPS 与阿里云控制面

自主安装、回滚和排障至少需要：

- SSH alias 或 Host、端口、独立运维用户名、已加入服务器的个人公钥、主机公钥指纹和应用目录。
- 对 Nginx、systemd、`/srv/vault2077`、`/etc/vault2077`、日志与证书所需的受控 `sudo` 权限。
- VPS 的真实产品类型、实例 ID、地域、可用区、VPC/vSwitch、安全组、私网 IP、OS 与 CPU 架构。
- 若需要我自主修改防火墙、RDS、OSS、DNS、证书和告警：一个最小权限阿里云 RAM/STS 或已配置好的阿里云 CLI profile；不要提供主账号密码或长期全局管理员 AccessKey。
- 当前和上一个可回滚 release、部署窗口、允许中断时长和回滚责任人。

### 8.3 RDS

需要以下非秘密标识和秘密配置：

- 实例 ID、PostgreSQL 版本与系列、地域/可用区、VPC/vSwitch、私网 DNS 端点、端口、数据库名。
- RDS 当前 CA 证书或受控下载权限；SSL、白名单、删除保护、自动备份、日志备份/PITR 和告警状态。
- 一次性管理/建库能力，以及长期最小权限应用账号。当前 Web 启动前执行迁移，因此应用账号需拥有本数据库 schema 的建表和改表权限，不能是实例级管理员。
- 目标 RPO、RTO、保留窗口，上线前手工备份 ID，以及从真实备份/时间点恢复到隔离实例的授权与容量。

### 8.4 OSS 与媒体域名

公开头像链路需要：

- `vault2077-public-media` 的 Bucket 控制权限或已配置的专用最小权限 RAM AccessKey/角色。
- region、内网 Endpoint、版本控制、public-read/替代公开读取方案、CNAME、HTTPS 证书、Referer/CORS、生命周期和费用告警的确认。
- RAM 权限仅覆盖目标 Bucket 的 `rangers/*`，满足 Put、Head、List、ListVersions、Delete 与版本删除；必须证明不能访问其他 Bucket。
- 一张无敏感信息的测试头像和测试 slug，用于上传、替换、公开读取、孤儿清理和永久撤回演练。

私有合同 Bucket 只有未来启用 e 签宝时才需要，届时必须使用完全独立的私有 Bucket、凭证、保留期和保留锁决定。

### 8.5 应用与第三方服务

完整生产环境需配置或确认：

- 应用内部：数据 keyring、OPC 恢复令牌 keyring、管理员会话、审计散列、管线签名、worker、Frontier tasks/tick、health 等彼此独立的随机秘密。这些可由我生成，但必须同时进入 VPS root-only 环境和负责人可恢复的安全密码库。
- GitHub：境内服务端只读 token；境外 workflow 使用自身 ephemeral token 和四个投递 Secrets。
- 编辑模型：DeepSeek Vault profile 的 base URL/key/model；MiMo SiC profile 的 base URL/key/model；主备、额度、限速、并发和预算边界。当前基线是 `api.deepseek.com/v1` + `deepseek-v4-flash`，以及 `api.xiaomimimo.com/v1` + `mimo-v2.5`。
- 支付宝：App ID、seller/PID、PKCS8 应用私钥、支付宝公钥、生产网关、异步通知配置、查询/退款权限，以及真实小额支付和全额退款授权。
- 邮件：SMTP host/port/user/password/from，并确认 owner 收件地址和测试发送授权。
- e 签宝：当前保持关闭；未来启用才需要 App ID/Secret、模板、印章、签署位置和回调配置。

### 8.6 必须由负责人提供或完成的业务数据

即使技术凭证齐全，以下内容也不能由开发代理自行决定：

- 真实 OPC 服务价格、范围、材料、成果、验收、周期、限制和可履约负责人；游骑兵本人授权与真实联系方式。
- 当前 Frontier 赛季的真实奖励文案、兑现主体、条件和发布授权。
- 真实支付测试的金额、付款账户、退款验收人和资金操作窗口。
- 生产告警主/备用联系人、通知渠道、值班边界和升级路径。
- RPO/RTO、数据保留、是否接受 RDS 基础系列风险的书面决定。
- 法律/隐私/备案/营业执照字段的最终逐字确认，以及最终 Go/No-Go 与 DNS 切流时间。
- 在真实 HTTPS 管理域名上注册至少两个独立 Passkey、离线保存恢复码并完成恢复演练；代理不能替代 owner 的实体设备与用户验证。

## 9. 当前接管结论与下一步

代码库已经具备生产适配、门禁、迁移、反向代理、systemd、可靠投递、业务状态机和自动测试，但这不等于全功能上线签字。仓库没有自动 CD；真实环境的 release、health、timer、生产配置与外部资源状态必须在每次发布前按本机私有生产记忆重新核验，不能固化在公开项目记忆中。

建议接管顺序：

1. 按本机私有记忆中的资源标识重新核验 SSH、GitHub、RDS、OSS、DNS、release 和实时健康状态。
2. 为 RDS 开启删除保护，并执行一次真实的隔离恢复演练；是否升级或迁移应以恢复证据、RPO/RTO、性能和预算决定，而不是仅凭实例系列名称。
3. 将云控制面操作身份收敛为最小权限 RAM/STS，统一秘密保管方式；核对 `/etc/vault2077/production.env` 时只报告字段状态。
4. 选择负责人批准的 commit，运行质量检查并生成可核验的 Linux 发布包。
5. 按备份、发布、迁移、health、四通道、OSS、Passkey、支付、Frontier 和浏览器矩阵顺序验收。
6. P0 证据和负责人签字齐全后再启用收款、Frontier 写入、timers 与公开切流。

## 10. 记忆维护协议

- 本文件记录“已验证事实、状态、未知项和证据来源”，不写秘密值。
- 每次生产部署后，在公开记忆中更新架构与流程变化；在本机私有记忆中更新 commit/tag、artifact hash、部署时间、精确资源标识、备份/恢复证据编号、功能开关状态、回滚 release 和遗留项。
- 项目代码、规格或外部资源出现冲突时，以真实代码/控制面证据提出问题，再按 `docs/README.md` 的权威层级修正规格和本文；不得用本文掩盖冲突。
- 时间敏感状态必须标注核验日期。开始新的部署或运维任务时先重新核验 Git、DNS、主机、RDS、OSS、证书和 Actions，不沿用旧快照作事实。
