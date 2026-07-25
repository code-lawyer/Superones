---
type: audit
status: active
updated: 2026-07-25
---

# Vault2077 深层次项目审计（2026-07-24）

本报告记录新文档体系与当前实现的差距、已完成的安全清理和下一阶段方向。它不定义需求；需求以[文档权威索引](README.md)中的规范与 ADR 为准，逐项状态以[实现追踪矩阵](Vault2077-Implementation-Traceability.md)为准。

## 1. 总体判断

截至 2026-07-25 续审，项目已从 MVP 预览推进到准上线工程阶段，但仍不具备生产签字条件。

当前最主要的风险不再是新旧代码双轨，而是已实现能力尚未经过目标生产环境和真实业务输入验证：

1. PostgreSQL adapter 和迁移已实现，但尚无目标数据库迁移、备份恢复和容量证据。
2. 双编辑配置、Frontier 快速路径/公开回退和后台安全已实现，但缺目标提供方、真实限流和故障演练。
3. 境内 Frontier 可执行任务、systemd timer 模板和业务健康接口已实现，但目标服务器安装、告警平台和事故流程尚未演练。
4. OPC、Vault 和 Frontier 的部分公开产品合同仍缺真实业务/法律输入或冻结交互。

因此，下一阶段不应继续扩展频道或堆叠新页面，而应集中完成“可信写入边界”。

### 1.1 续审更新：来源主路由已收口

根据 ADR-0008，本轮已完成来源体系的结构性清理：资讯瀑布只接新闻型来源，SiC 档案只接长期深度材料；bundle 不再携带 documents 来源，SiC 档案改由 sic 通道实际采集。Hacker News/Lobsters 的外链发现—回源—晋升链路已删除，社区讨论页成为 canonical 记录。宽泛机构 Feed 默认进入待审，避免把来源路由交给境内 LLM。

这一项从架构风险转为已完成治理基础；下一阶段仍以生产数据库、统一 inbox 状态机与 Frontier 可靠回退为主，不扩张新的来源类别。

### 1.2 续审更新：频道编辑配置已实现、待生产演练

根据 ADR-0009，information、roadside 与 Vault 事件编排统一归入 `vault_editorial`，SiC 内容归入独立 `sic_editorial`；平台原生榜及 Frontier 确定性数据不使用编辑模型。目标设计要求两套配置分别拥有队列、并发、预算、主处理提供方和受控备用，同时共享事实、来源、统一语言和追溯标准。

当前实现已经按两套前缀读取独立主/备用提供方、并发、批大小、预算和超时；生产拒绝旧全局兼容配置，PostgreSQL inbox 支持并发 worker 领取。剩余门禁是目标提供方容量、持续积压、预算耗尽和切换审计演练，而不是继续复制一套 worker。

### 1.3 续审更新：上线基线代码已实现、生产作业尚未执行

采集合同、workflow 和采集器已经支持独立 `runMode=bootstrap`：SiC 每个 approved 来源取最近一条合格内容，Vault 只用最近 30 天真实新闻，按统一有界批次和幂等合同处理。尚未完成的是在目标生产修订执行作业、保存逐来源证据并补跑失败来源。

## 2. 上线阻断项

### P0-1 统一批次不是完整合同

四 lane、规范字段、来源修订白名单、`received/processing/processed/retryable/quarantined`、最大重试、租约恢复和 HTTP E2E 已实现；旧 content 接口、worker 和第二套 inbox 已删除。

lane-kind 合同会在写入前拒绝不支持记录；生产 inbox 使用专用 PostgreSQL 事务，业务聚合使用独立行锁事务。跨 inbox 完成标记和业务聚合仍是幂等重放而非一个分布式事务，需要真实 PostgreSQL 故障注入验证。

### P0-2 Frontier 混合访问可靠性未闭环

根据 ADR-0007，境内直读已实现短超时、有界并发、持久化限速、缓存/条件请求和审计；失败会生成不含邮箱的公开任务，由每小时 rankings 通道回传签名 observation。GitHub Actions 业务时钟已删除，改为 `npm run frontier:tick` 与 systemd timer 模板。剩余阻断是生产凭证、目标服务器启用/告警证据和真实网络故障演练。

### P0-3 生产持久化与预览边界缺失

根据 ADR-0010，内容、SiC、Frontier、平台榜、GitHub 缓存和回退任务已进入统一 PostgreSQL 聚合适配层，inbox/审计/限速使用专用表与版本迁移；生产缺数据库时 fail-closed，文件页面标识为预览。真实迁移、自动备份和恢复演练仍是上线门禁。

### P0-4 后台安全合同未完成

生产只接受 Argon2id 密码哈希；会话具 60 分钟空闲和 8 小时绝对过期，登录锁定与公开表单限速持久化到 PostgreSQL，后台写操作要求二次确认并写 append-only 审计表。

CSP、HSTS、MIME、frame、referrer、COOP/CORP 和 `/pipeline` 认证/noindex 已实现；可信代理默认关闭，仍需按目标代理验证其覆盖转发头的行为。

## 3. 产品与领域模型差距

### Vault

- 事件、资讯、路边社基础阅读链路可用。
- 事件判断未强制绑定证据引用。
- 事件详情已默认显示 20 条相关资讯并通过 URL 分批加载到全部。
- 匿名纠错已支持三类报告、原始依据、可选加密邮箱、持久化限速和后台审计关闭；实际拆分/移入/隐藏操作仍待补。
- 本轮已禁止生产存储故障静默回退示例数据，改为显式 degraded 空态。

### OPC

- 三入口、五个专项专业领域和十种游骑兵身份已经实现。
- 十项基础设施已迁移到冻结名称与能力模型；价格、周期和正式材料继续等待业务确认。
- 服务缺独立排除项、生效时间、统一联系和修订历史。
- 游骑兵档案缺验证日期、更新时间、授权和撤销状态。
- 本轮已删除旧六类服务入口、旧动态详情页和无引用假数据，首页改为三入口。

### SiC

- 固定来源采集、四组结构和四个平台原生榜的基础实现存在。
- `documents` 仍应迁移为规范中的“档案”。
- 榜单保留 last-success，并在超过时限后明确显示 stale。
- 来源计数和 active/retired 状态已纳入文档自动校验。
- 本轮已删除两个无调用的旧 SiC 写接口、旧采集脚本、无站内入口的仓库详情页及对应环境变量。

### Frontier

- 报名、挑战、排名、奖品和结算模块存在，领域测试覆盖基础算法。
- 赛季结算已持久化 `settling/failed/settled`、30 分钟租约、尝试次数和幂等结果。
- 重复已验证仓库会返回可恢复的当前状态，不再要求重新生成挑战文件。
- 公开页面已把文件适配器明确标识为本地非生产预览。

## 4. 复杂度与冗余判断

### 已安全清理

- 旧 OPC 六类服务入口、旧详情路由、旧假 Frontier/奖品/历史数据。
- 无调用的旧 SiC content/snapshot 接口和采集脚本。
- 无站内入口的 SiC GitHub 仓库详情路由及唯一 helper。
- 生产 `/pipeline` 公开暴露和生产 demo fallback。

### 暂不删除

- Frontier internal tick 和直接 GitHub refresh：它们属于正式快速路径；CLI scheduler、HTTP 手工入口、短超时和回退是同一业务能力的不同触发/恢复边界，不应再增加第二套实现。
- `content-contract.ts` 与 `content-pipeline.ts`：虽然名称偏旧，但当前统一 processor 仍复用其核心转换和处理能力。

### 结构性复杂度

- `sic-collector.ts` 同时承担抓取、解析、来源特例、标准化和报告，需按 adapter/normalizer/reporter 拆出深模块。
- acquisition inbox/worker 已成为唯一运行状态机；后续只需围绕该接口补监控与故障注入。
- 全局 CSS 和 institutional CSS 存在大量重复选择器。没有视觉回归基线前不宜机械删除；应先建立四宽度截图，再按频道拆分和去重。

## 5. 下一阶段：可信写入边界

下一阶段的唯一主目标是：任何进入生产公开面的数据，都经过一个可验证、可重放、可隔离、可事务提交、可审计的统一边界。

### Gate A：统一合同

- 冻结四 lane 和规范字段。
- 接收端执行 lane-kind 约束与来源修订白名单。
- 引入 retryable/quarantined、最大重试和死信处理。
- 保证预校验无副作用，并为事务提交准备存储接口。

### Gate B：Frontier GitHub 混合访问

- 境内交互核验和每小时观察只读取当前参赛名单中的公开仓库。
- 直读增加服务端只读凭证、短超时、限流、缓存/条件请求和来源审计。
- 暂时不可达时保持待验证或上一成功值，由境外 collector 执行公开回退任务并签名回传 observation。
- rankings 改为每小时处理到期平台榜和 Frontier 回退；业务时钟迁移到境内受监控 scheduler，保留境内 GitHub 直连。

### Gate C：生产数据与安全

- 建立 PostgreSQL schema、迁移、事务和适配器契约测试。
- 文件适配器仅保留本地预览，并在 UI 明示。
- 完成后台强哈希、空闲过期、分布式锁定、二次确认和不可变审计。
- 建立备份恢复、积压、新鲜度和失败告警。

### Gate D：产品合同收口

- 迁移 OPC 冻结模型。
- 补齐 Vault 引用、分页和纠错。
- 补齐 SiC stale/last-success。
- 把 Frontier 赛季和结算改为可恢复状态机。

Gate A-C 的代码主体已完成；只有生产数据库/恢复、目标提供方/网络、scheduler 与监控证据全部通过后，项目才适合进入真实运营数据和小流量生产试运行。Gate D 可与真实内容录入并行，但不得再扩展新的频道。

## 6. 本轮验证

- `npm run docs:check`：44 份 Markdown 通过元数据、索引和本地链接校验。
- `npm run typecheck`：通过。
- `npm test`：108 项通过。
- PostgreSQL 17 迁移、幂等重跑、并发聚合、`SKIP LOCKED`、隔离、限速和不可变审计集成测试：通过。
- `npm run build`：通过。
- `npm run test:pipeline:e2e`：通过。
- `npm run test:acquisition:e2e`：通过。
- Python 采集器测试：17 项通过（`collector/tests`）。
