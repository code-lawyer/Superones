# Vault2077 系统交付规格

> 状态：规范性文件。本文定义稳定模块接口、跨区数据契约、失败语义、部署和工程验收；具体云厂商、模型与采集适配器可以替换。

## 1. 架构目标

系统必须让公开阅读在采集、模型或 GitHub 短期失败时仍可用；让复杂的跨境采集、事件编排、趋势计算和竞赛规则分别封装在少数深模块中；让调用方只需要理解稳定输入、输出和错误模式。

## 2. 模块与接口

### 2.1 Source Registry

管理已批准来源组合、逻辑发布者和公开通道。外部接口只提供 `resolveApprovedChannels(revision)` 和运行状态；来源发现、去重、代理映射和暂停策略隐藏在模块内部。

每个通道必须记录稳定的发布实体、发布者性质、证据性质基线、内容语言、原始发布平台、平台归属以及分类依据和置信度。独立发布者按发布实体计算，不按域名、代理入口或载体计算。内容语言不参与准入；生产组合排除大陆来源平台及其代理出口，但允许 X、GitHub 等境外平台上的中文内容。

“YouTube 和其他视频专属通道从注册表生成阶段排除”只约束 Vault 新闻信息流的 `source-registry.json`。SiC 使用独立的 `sic-source-registry.json`，可以批准机构官方 YouTube channel feed 作为课程更新元数据源；它只读取频道 Feed 的标题、时间和原链，不下载、转录或分析视频媒体。

生产适配器使用 PostgreSQL，测试适配器使用内存注册表。具体 RSS、X 或聚合器不是该模块的外部接口。

### 2.2 Overseas Collector

生产目标只有一个境外采集深模块 `vault2077-collector`。它输入来源注册表修订、采集窗口和可选的公开数据任务，输出不可变 `AcquisitionBatch`；内部 adapter 覆盖 Vault 资讯、SiC 论文/档案/课程/播客、GitHub/Hugging Face/OpenRouter/Skill/MCP 排行状态，以及边境计划所需的公开 GitHub 仓库状态。调用方只理解统一批次、来源状态和投递结果，不逐连接器编排。

所有需要服务端访问境外网络的公开数据都必须在境外采集。境内 VPS 不直接刷新资讯、论文、README、模型榜、GitHub Trending、GH Archive、Hugging Face、OpenRouter、Skill/MCP 或边境排行榜外部状态。交互式边境验证也复用同一模块、记录类型和签名协议；任务只包含公开仓库定位与挑战文件路径，不包含邮箱、后台状态或其他用户隐私。迁移完成前保留现有 `ContentBatch`、`SicRawCollection` 和境内快照入口作为兼容 adapter，但不得继续扩展三套独立协议。

`AcquisitionBatch` 的公共字段至少包含 `schemaVersion`、`batchId`、`runId`、`registryRevision`、采集窗口、`collectedAt`、`records` 和 `sourceReports`。每条记录包含稳定 `kind`、`sourceId`、外部身份、规范 URL、`observedAt`、内容哈希和版本化 payload；记录类型可以扩展，认证、大小限制、幂等、状态报告和错误语义不得分叉。排名数值必须保留可复算原始观测，LLM 不得修改数值或排序。

统一批次 v1 契约及来源计数一致性校验位于 `lib/acquisition-contract.ts`，旧内容入口与新入口共享 `lib/batch-signing.ts` 的签名输入规则。统一接收路由与单实例文件收件箱已作为迁移窄腰落地；在 Worker、注册表修订白名单和兼容 adapter 完成前，不替换现有生产入口。

生产连接器只允许 RSS、Atom、JSON Feed、文档化 HTTP API、远程结构化协议或逐源批准的机器可读入口。SiC 可使用逐源批准的 sitemap、日期化版本页、官方课程目录和官方节目索引，并使用有界、来源专属的静态解析规则；不允许泛站扫描或 CSS/DOM 易碎选择器扩散到未批准路径。统一采集模块禁止 Playwright、Selenium、无头浏览器、Cookies 会话复刻和页面点击模拟。MCP 只有在提供无状态远程传输、稳定结构化输出且确实优于直接 API 时才接入。

境外采集器不处理视频媒体：不下载视频或音轨，不调用字幕抓取器和语音识别服务。Vault 信息流不登记 YouTube；SiC 仅登记已经批准的机构官方频道 Feed，将新视频当作课程/讲座发布事件并直达原页。视频描述中链接的官方文章、论文或仓库必须作为独立文本信源重新登记，不能把视频元数据冒充原文。

### 2.3 Ingest Gateway

生产目标由单一 `POST /api/internal/acquisition` 接收统一 HMAC 签名批次，完成认证、大小限制、Schema 校验、注册表修订校验、重放保护、原始对象落盘和处理任务登记，随即返回批次 ID、各记录类型数量与接受状态。它不在 HTTP 请求中调用 LLM、不生成事件、不计算排名，也不直接修改公开读模型；境内 Worker 异步领取已持久化任务。

当前迁移实现已经完成 8 MB 有界读取、五分钟时间窗、HMAC、Schema、来源计数对账、同 ID 异文冲突、并发无覆盖持久化与重启后重复识别。原始批次写入 `VAULT2077_DATA_DIR/acquisition-inbox`；该文件 adapter 仅允许境内单写实例。Worker 领取、注册表修订白名单、PostgreSQL adapter 和旧协议转换仍是后续批次，尚未接入生产 Actions。

现有 `/api/internal/content`、`/api/internal/sic/content` 和 `/api/internal/sic/snapshot` 是迁移期兼容入口。兼容入口必须尽快转换为同一内部批次与状态机，完成调用方迁移后删除；不得把兼容入口继续发展成独立队列、认证或监控体系。

### 2.4 Content Compiler

输入一个已持久化批次，输出新的资讯记录、事件变更集和发布候选。模块内部完成归一化、去重、翻译、单条摘要、近一个月事件匹配和事件综合摘要；外部接口不暴露提示词或聚类中间步骤。

### 2.5 Trend Compiler

输入固定平台响应、累计量快照和仓库元数据，输出可复算的五项 SiC 平台指标，以及 Skill/MCP 优选和 24H 飙升视图。GitHub 24H/7D 来自 GH Archive `WatchEvent` 滚动聚合，Hugging Face 与扩展飙升来自历史快照差，OpenRouter保留官方周序。排名计算不依赖 LLM；仓库短介绍只对 README/Repository description 做受限文本清洗，失败不能改变排名。

### 2.6 OPC Catalog

输入服务修订和专业确认结果，输出可发布目录或结构化验证错误。列表页、详情页和后台共用同一读模型，不各自拼接价格与范围。

### 2.7 Frontier Competition

对外提供创建挑战、验证报名、获取榜单、记录每小时快照、提交奖品捐献、结算赛季和读取随机分配结果七类能力。季度结算必须重新检查仓库资格与挑战文件，并保证每赛季的随机分配只执行一次。GitHub 是外部依赖端口；测试使用确定性的内存适配器，生产使用 GitHub REST 适配器。

### 2.8 Public Content

只读接口返回当前已发布的首页、事件簿、资讯瀑布、SiC、OPC 和边境计划视图。发布以版本为单位原子切换；页面永远不会读到半个批次。

## 3. 跨区内容批次 v2

```text
ContentBatch
  version = 2
  batch_id
  source_bundle_revision
  collected_from
  collected_until
  generated_at
  information[]
  repositories[]
```

每条资讯：

```text
InformationEnvelope
  idempotency_key
  source_channel_id
  discovery_path
  original_publisher
  owner_entity
  publisher_kind
  evidence_nature
  classification_confidence
  original_author?
  source_role = 官方 | 媒体 | 测试 | 评论 | 研究
  original_url
  original_published_at?
  fetched_at
  original_language
  original_title
  original_content?
  content_completeness = metadata | excerpt | fulltext | transcript
  content_hash
```

每个仓库：

```text
RepositoryEnvelope
  github_id
  owner
  name
  canonical_url
  description?
  readme?
  readme_sha?
  license?
  primary_language?
  stars
  forks
  watchers
  created_at
  pushed_at
  fetched_at
```

境外字段不可被中文字段覆盖。批次不得包含用户数据、后台数据、Cookies、境内模型配置或任何写权限 GitHub Token。

## 4. 接收接口

首版保留 `POST /api/internal/content`，但生产契约升级为批次 v2。请求头包含：

```text
Content-Type: application/json
X-Vault2077-Batch-Id: <batch_id>
X-Vault2077-Timestamp: <unix-seconds>
X-Vault2077-Signature: sha256=<base64url-hmac>
```

签名输入固定为 `timestamp + "." + batch_id + "." + sha256(body)`。时间偏差超过五分钟、批次 ID 已成功接收、签名错误、Schema 错误或对象超限均拒绝。重复发送同一成功批次返回原结果，不重复处理。

HTTP 语义：`202` 已持久化等待处理，`200` 已存在且幂等成功，`400` Schema 错误，`401` 签名错误，`409` 同 ID 不同内容，`413` 超限，`429` 限速，`503` 无法安全持久化。

## 5. 内容处理顺序

```text
验签并持久化原始批次
  → 归一化与 canonical URL
  → 内容指纹与跨来源去重
  → 生成资讯中文标题、摘要和处理结果
  → 与近 30 天活跃事件的标题和摘要比较
  → 加入现有事件 / 保持独立 / 与其他独立资讯形成新事件
  → 重算受影响事件的标题、判断、综合摘要和引用
  → Schema、证据、版权与长度校验
  → 原子发布新读模型版本
```

新事件至少需要三条资讯、两个独立发布者和两种来源角色，并且方向一致；有官方一手来源时必须纳入。一个事件连续 30 天没有新资讯后退出匹配候选，但历史页面继续存在。

资讯先独立存在于资讯瀑布。不能因为单条资讯进入批次就自动创建事件。历史误合并只由人工纠错，不由 LLM 定期重审。

## 6. 模型输出与发布

翻译、资讯摘要、事件匹配、事件摘要和项目说明使用分别版本化的 JSON Schema。每一步失败自动重试一次；仍失败的记录进入隔离状态，不产生降级公开文本，不阻塞同批其他记录。

发布候选必须满足：原始来源可达或明确标记失效、必填原始字段存在、模型输出通过 Schema、引用只能指向事件内资讯、公开全文符合许可策略。发布完成后缓存按读模型版本失效。

模型适配器的接口只接受任务类型、Schema 版本和受限输入，返回结构化结果或稳定错误；业务模块不依赖具体供应商的请求格式。

## 7. 存储与一致性

- 首版以境内 PostgreSQL 同时保存不可变原始批次、处理任务、结构化记录、状态、关联、快照和操作日志；四批次规模不需要为队列单独引入 Redis。
- 境内 Worker 通过数据库任务表领取批次；领取、重试和完成状态必须是事务性的，同一批次只能产生一次公开版本。
- S3 兼容大陆对象存储是原始文本增长后的归档适配器，不是首版运行前置条件。Redis 仅在实际吞吐或多 Worker 协调需要时引入，不作为事实来源。
- 每次公开发布生成单调递增 `publication_version`；列表与详情在一次请求中读取同一版本。
- 原始内容、结构化记录和发布版本通过 batch ID 与 content hash 可追溯。

本地加密 JSON 文件只允许单实例 MVP；生产迁移必须在开放真实报名或自动内容发布前完成。

截至 2026-07-23，已实现的 MVP 仍使用 `VAULT2077_DATA_DIR` 下的文件适配器，而不是本节目标 PostgreSQL：Vault 使用不可变入站文件和发布库，SiC 使用四个原子替换 JSON 文件。所有部署必须保持一个写入实例；本节其余数据库、事务、发布版本和对象存储要求是正式生产迁移目标，不能在交接时写成已完成。

## 8. 任务状态与重试

任务状态固定为 `queued`、`running`、`succeeded`、`retryable_failed`、`quarantined`、`cancelled`。重试采用指数退避和随机抖动；幂等键保证重复执行不产生重复公开记录。

外部不可用、限流和超时属于可重试失败；Schema、权限、超限和内容安全问题进入隔离。死信记录必须包含稳定错误码和安全摘要，不保存密钥或完整敏感响应。

## 9. 调度

生产目标由境外采集器仓库的单一 GitHub Actions 工作流在每小时固定分钟触发。每次运行读取同一注册表和公开任务清单，在一个有界时间窗内完成资讯、论文、排行榜及其他到期 adapter 的采集、统一打包、签名和发送；境外模块内部不实现常驻调度器。默认生产频率为每小时一次，确需降低上游调用频率的来源只能通过注册表声明整数小时 cadence，由同一小时工作流判断是否到期，不得新增第二套 cron 或投递协议。

GitHub Actions runner 是临时环境：境外采集器不依赖本地历史、数据库或跨运行缓存。一个批次完成组装后，其 ID 和正文即固定；网络发送失败时以完全相同的批次重试，并把批次 JSON 保存为工作流 artifact 供恢复。重新采集同一时间窗可以形成新批次，资讯级幂等键负责去重。

失败 adapter 不阻止其他成功记录形成批次，但必须产生 `sourceReports` 失败状态并使工作流进入可告警的部分失败结果。境内接收成功不等于发布成功；GitHub Actions、境内队列、LLM 处理和公开版本四段状态必须通过同一 `runId`、`batchId` 和记录 ID 关联。赛季结算需要最终强制快照时，仍调用同一个 collector 工作流和记录类型，只把任务优先级标记为 `settlement`。

## 10. 安全与隐私

- 境外网络访问只允许来源注册表中的协议和主机，解析后再次校验目标 IP，阻止 SSRF 与内网地址。
- 限制重定向、正文长度、压缩比、文件类型和总批次大小。
- HTML、README、Feed 和模型输出均按不可信数据处理；公开渲染前转为受控文本结构。
- 所有密钥来自秘密管理或环境注入，具有最小权限并支持轮换。
- 报名邮箱使用字段级加密；日志和分析不记录邮箱、挑战码、完整 IP 或内容正文。
- 生产响应使用安全头、严格 CSP 和 HTTPS；后台与内部接口禁止索引。

## 11. 可观测性与服务目标

必须记录：境外运行成功率、批次签名与投递成功率、各 adapter 和来源最后成功时间、采集条数/字节数/耗时、境内批次接收成功率、队列等待、LLM 处理延迟与失败、隔离数量、事件发布数量、SiC 快照新鲜度、GitHub 限额、边境快照和公开读模型版本。任何一次运行都必须能按 `runId` 从 GitHub Actions 追踪到公开版本或明确的隔离/死信终态。

首发服务目标：

- 公开站月可用性目标 99.5%；
- 成功接收批次后 30 分钟内发布可处理内容；
- 公开页面始终保留上一成功版本；
- 普通页面服务端响应 P95 小于 1 秒，不含用户到境外站点的外链时间；
- 数据库每日备份，目标 RPO 24 小时、RTO 4 小时；赛季结算和获奖记录另做不可变导出。

服务目标是首发运维目标，不构成对外承诺；真实运行一个月后校准。

## 12. 部署拓扑

- 境外：当前网站仓库的 GitHub Actions 仍临时运行 Python Vault collector 与 Node.js SiC collector；生产目标是提取为单一 `vault2077-collector` 仓库和一个小时工作流。它只持有来源配置、公开任务、只读上游凭证、境内统一接收地址和一枚可轮换 HMAC 密钥，不持有数据库、后台或境内 LLM 凭据。
- 境内：当前单个 Node.js 22/Next.js 实例运行公共站与后台、多个兼容接收入口、内容 Worker 和部分榜单外部刷新；生产目标是只接收境外统一批次，在境内持久化后调用境内 LLM 完成翻译、摘要、分类和事件编排，再原子发布。排名原始数值只做确定性校验与计算，LLM 可以生成中文说明但不得改变数值和排序。PostgreSQL、Redis 与对象存储是多实例和正式生产迁移目标，不是当前已经存在的运行依赖。
- 公共站、后台和 Worker 使用不同运行身份；内部接收接口只允许受控入口访问。
- 数据库、对象存储和密钥不挂载到境外节点。

生产发布采用向前迁移：先部署兼容旧读路径的数据库变更，再部署写入方，最后启用新功能。不得在部署脚本中删除生产数据。

## 13. 测试与质量门槛

测试以模块接口为表面：

- Source Registry：来源组合展开、重复逻辑来源、暂停与恢复；
- Ingest Gateway：签名、重放、超限、同 ID 不同正文；
- Content Compiler：去重、独立资讯、新事件门槛、加入事件、30 天退出、模型失败隔离；
- Trend Compiler：缺失快照、负增长、仓库改名、稳定排序；
- OPC Catalog：字段完整性、修订、停售和联系渠道原子切换；
- Frontier Competition：挑战绑定、一次使用、基线不可变、重参赛限制、结算与同分；
- Public Content：发布版本一致性和失败时保留上一版本。

合并门槛为类型检查、格式检查、模块测试、关键路由集成测试、生产构建和无高优先级安全问题。上线前另执行 360px、768px、1280px、1440px 视觉与键盘验收。

## 14. 配置与上线阻断

生产启动必须验证当前所选存储适配器、会话密钥、数据加密密钥、管道密钥、GitHub 只读 Token、正式域名和公开基础 URL。启用自动内容编辑时还必须验证 LLM 配置；启用完整 SiC 时必须验证两个 Actions URL、SiC Bearer、BigQuery 项目/令牌、境内 `GITHUB_TOKEN`、Smithery 密钥以及 Vercel 场景下的 OIDC。缺失安全配置时应拒绝启动，而不是使用开发默认值；功能型凭据缺失时必须明确使对应榜单空置并触发运维告警。

任何示例 OPC 服务、示例联系方式、示例奖池、示例备案、`DEMO DATA` 或本地默认共享密码存在时，发布流程必须阻止生产上线。
