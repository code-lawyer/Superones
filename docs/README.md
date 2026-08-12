---
type: index
status: active
updated: 2026-08-12
---

# Vault2077 文档权威索引

“权威规格”是一套有明确职责、顺序和更新规则的文档体系，不是某一份永远压过其他文件的文档。被较高层决策改变的正文必须在同一次修订中同步更新，不允许长期保留“ADR 覆盖旧正文”的矛盾状态。

## 权威层级

1. [`CONTEXT.md`](../CONTEXT.md)：只定义统一语言，不规定页面或实现。
2. 产品规格：总规格定义跨频道体验，频道规格定义本频道产品行为。
3. 已接受 ADR：记录难以逆转的架构边界与取舍；接受后必须同步修改受影响规格。
4. [系统交付规格](Vault2077-System-Delivery-Spec.md)：把已接受产品与架构决定转为工程合同。
5. [上线清单](Vault2077-Launch-Checklist.md)：发布门禁，不创造新需求。
6. [实现追踪矩阵](Vault2077-Implementation-Traceability.md)：只记录状态与证据，不是需求来源。
7. 当前运行手册：只描述当前可执行操作。
8. 方案、调研、审计与历史材料：提供背景或证据，不具规范效力。

同层冲突时，专项规格优先于总规格；仍无法判断则暂停实现，先修正文档。

## 当前规范文档

- 全站：[总设计规格](Vault2077-Design-Spec.md)
- Vault：[信息流设计规格](Vault2077-Feed-Design-Spec.md)
- OPC：[OPC 设计规格](Vault2077-OPC-Design-Spec.md)、[OPC 服务清单](Vault2077-OPC-Service-Catalog.md)
- SiC：[SiC 设计规格](Vault2077-SiC-Design-Spec.md)、[SiC 来源目录](Vault2077-SiC-Source-Catalog.md)
- 边境计划：[边境计划设计规格](Vault2077-Frontier-Design-Spec.md)
- 运营：[后台运营规格](Vault2077-Admin-Operations-Spec.md)

## 已接受 ADR

- [ADR-0001：跨区域公开内容管线](adr/0001-cross-region-public-content-pipeline.md)
- [ADR-0002：无账户公开产品](adr/0002-accountless-public-product.md)
- [ADR-0003：独立无状态境外采集器](adr/0003-independent-stateless-overseas-collector.md)
- [ADR-0004：统一境外公开数据采集](adr/0004-unified-overseas-acquisition-pipeline.md)
- [ADR-0005：平台原生榜与四采集通道](adr/0005-platform-native-rankings-and-lanes.md)
- [ADR-0006：生产数据与公开任务边界](adr/0006-production-data-and-public-task-boundary.md)
- [ADR-0007：Frontier GitHub 混合访问](adr/0007-frontier-github-hybrid-access.md)
- [ADR-0008：公开内容单一主去向](adr/0008-single-destination-content-routing.md)
- [ADR-0009：内容频道采用独立编辑配置](adr/0009-channel-editorial-profiles.md)
- [ADR-0010：生产持久化与安全状态统一进入 PostgreSQL](adr/0010-production-persistence-and-security-seam.md)
- [ADR-0011：人工编辑只进入结构化服务目录](adr/0011-managed-service-catalog.md)
- [ADR-0012：生产后台采用原生 Passkey 与可撤销应用会话](adr/0012-production-admin-access.md)
- [ADR-0013：境外可靠投递与境内独立消费](adr/0013-reliable-delivery-and-domestic-worker.md)
- [ADR-0014：OPC 无账号签约订单与服务器端签署、到账核验](adr/0014-opc-accountless-orders-and-alipay.md)
- [ADR-0015：当前快照、永久事件证据与自动编辑边界](adr/0015-current-snapshots-and-automated-editorial.md)
- [ADR-0016：游骑兵公开头像媒体存储](adr/0016-ranger-avatar-media-storage.md)
- [ADR-0017：Follow Builders 补充来源与隔离失败策略](adr/0017-follow-builders-supplement-and-isolated-failure.md)
- [ADR-0018：OPC 已签合同私有归档](adr/0018-opc-signed-contract-private-archive.md)
- [ADR-0019：OPC 全额预付与纸质合同线上订单生命周期](adr/0019-opc-prepaid-paper-contract-checkout.md)
- [ADR-0020：OPC 在线确认协议与线下对公转账](adr/0020-opc-offline-bank-transfer-checkout.md)
- [ADR-0021：OPC 退款申请与签约身份信息](adr/0021-opc-refund-request-and-contract-identity.md)
- [ADR-0022：退役旧在线支付接入](adr/0022-retire-online-payment-integration.md)

## 当前运行文档

- [项目长期记忆与接管清单](Vault2077-Project-Memory.md)
- [阿里云中国大陆生产部署与迁移 Handoff](Vault2077-Aliyun-Mainland-Production-Handoff.md)
- [阿里云告警手动配置清单](Vault2077-Aliyun-Alert-Manual-Checklist.md)
- [统一采集运行手册](Vault2077-Unified-Acquisition-Runbook.md)
- [GitHub Actions 向阿里云生产环境投递操作手册](Vault2077-GitHub-Actions-Aliyun-Delivery-Operations-Manual.md)
- [境外采集运营交接](Vault2077-Overseas-Operator-Handoff.md)
- [部署配置手册](Vault2077-Deployment-Configuration-Manual.md)
- [阿里云轻量服务器与历史后台身份决策](Vault2077-Aliyun-Identity-Gateway-Decision.md)：保留已退役 OIDC 方案的历史背景，当前实现见 ADR-0012。
- [OPC 服务目录后台操作手册](Vault2077-OPC-Admin-Manual.md)
- [OPC 线下付款资料替换与启用手册](Vault2077-OPC-Offline-Payment-Operations-Manual.md)
- [Content Pipeline Operations](Content-Pipeline-Operations.md) 已被统一采集手册取代，只保留迁移指引。

## 支持性方案

- [容器化与跨服务器重布置远期目标](Vault2077-Containerized-Deployment-Portability-Plan.md)：记录 Docker 应用运行时、同域名换机、PostgreSQL 跨云迁移、单写割接与回滚的远期验收目标；尚未改变当前 tar.gz/systemd 部署合同。
- [OPC 开发计划](Vault2077-OPC-Development-Plan.md)：内容已吸收到 OPC 规格，保留实施分解。
- [OPC 全额预付与纸质合同线上实施方案](Vault2077-OPC-Prepaid-Paper-Contract-Implementation-Plan.md)：已被 ADR-0020 取代，只保留既有 ADR-0019 订单的历史实现背景。
- [负责人纸质结账启用手册](Vault2077-Owner-Paper-Checkout-Activation-Manual.md)：已被线下付款手册取代，只用于既有 ADR-0019 订单历史排障。
- [2026-07-31 生产部署执行方案](../Vault2077-Production-Deployment-Plan-2026-07-31.md)：已被当前阿里云生产 Handoff 与部署配置手册取代，只保留当时的基础设施决策背景。
- [OPC 页面设计提案](Vault2077-OPC-Page-Design-Proposal.md)：已被 OPC 规格取代。
- [SiC 内容架构计划](Vault2077-SiC-Content-Architecture-Plan.md)：已被 SiC 规格取代。

## 调研、审计与证据

以下文档均不产生当前需求：

- 项目审计：[2026-07-24 深层次项目审计](Vault2077-Deep-Audit-2026-07-24.md)
- 阿里云部署：[中国大陆阿里云部署官方事实底稿（2026-07-31）](research/Vault2077-Aliyun-Mainland-Deployment-Official-Facts-2026-07-31.md)
- 合规调研：[中国大陆互联网公司审批、许可与备案地图](research/china-internet-licenses.md)
- OPC 调研：[中国大陆 OPC 基础设施需求研究](Vault2077-OPC-Infrastructure-China-Needs-Research.md)、[上海及长三角起步审批、备案与市场报价研究](Vault2077-OPC-Shanghai-Startup-Approvals-Research.md)、[上海起步审批与备案适用范围审计](Vault2077-OPC-Shanghai-Startup-Approvals-Scope-Audit.md)、[审批备案之外的高普适标准服务研究](Vault2077-OPC-Standardizable-Services-Beyond-Filings-Research.md)、[OPC 证照与备案代办服务优先级研究（2026-08-07）](research/opc-license-service-priority-2026-08-07.md)、[中国主流云厂商互联网备案与许可证服务边界（2026-08-07）](research/cloud-provider-internet-filing-boundaries-2026-08-07.md)、[支付宝“网站风险较高、不能签约”官方事实与 Vault2077 核验清单（2026-08-10）](research/alipay-website-risk-signing-review-2026-08-10.md)、[中国大陆企业网站支付替代方案（2026-08-10）](research/china-website-payment-alternatives-2026-08-10.md)、[`superones.top` 同域事务邮件方案（2026-08-11）](research/domain-transactional-email-superones-2026-08-11.md)、[下单后、付款前电子服务协议签署可行性调研](research/opc-esign-feasibility.md)、[e签宝技术流程与操作责任清单](research/opc-esign-integration-operator-checklist.md)、[e签宝价格与低客量替代方案（2026-08-05）](research/esign-pricing-and-low-volume-options-2026-08-05.md)、[纸质合同与付款流程合规评估（2026-08-05）](research/opc-paper-contract-payment-compliance-2026-08-05.md)
- 媒体存储：[游骑兵头像存储决策](Vault2077-Ranger-Avatar-Storage-Decision-2026-07-31.md)
- 信息与采集：[Information Pipeline Research](Vault2077-Information-Pipeline-Research.md)、[Collector Architecture Research](Vault2077-Collector-Architecture-Research.md)、[Collector Adoption Decision](Vault2077-Collector-Adoption-Decision.md)
- 来源治理：[Source Taxonomy Report](Vault2077-Source-Taxonomy-Report.md)、[Source Inventory](Vault2077-Source-Inventory.md)、[Current Source Inventory Report](Vault2077-Current-Source-Inventory-Report.md)、[Source Audit Research](Vault2077-Source-Audit-Research.md)、[Source Audit Report](Vault2077-Source-Audit-Report.md)、[Glance Source Absorption Audit](Vault2077-Glance-Source-Absorption-Audit.md)、[Akta News Signals 信源审计](Vault2077-Akta-Source-Audit.md)、[Horizon 信息源审计](Vault2077-Horizon-Source-Audit.md)、[TrendRadar 信源与管线审查](Vault2077-TrendRadar-Source-Audit.md)、[Follow Builders 替换 HN/Lobsters 可行性研究](Vault2077-Follow-Builders-Roadside-Replacement-Research.md)、[Latent Space 信息源可信度审核](research/latent-space-source-audit-2026-08-02.md)
- SiC 调研：[Source Candidates Batch 1](Vault2077-SiC-Source-Candidates-Batch-1.md)、[Official Sources Research](Vault2077-SiC-Official-Sources-Research.md)、[Papers and Official Archives Research](Vault2077-SiC-Papers-and-Official-Archives-Research.md)、[Frontier AI Resource Audit](Vault2077-SiC-Frontier-AI-Resource-Audit.md)、[GitHub Trending API Research](Vault2077-SiC-GitHub-Trending-API-Research.md)、[Hugging Face Ranking Research](Vault2077-SiC-Hugging-Face-Weekly-Model-Ranking-Research.md)、[OpenRouter Ranking Research](Vault2077-SiC-OpenRouter-Model-Ranking-Research.md)、[DeepSeek V4 Flash 与 MiMo 2.5 思考模式评估](DeepSeek-V4-Flash-MiMo-2.5-Thinking-Mode-Assessment.md)、[Skill Market Research](Vault2077-Skill-Market-Integration-Research.md)、[`dukelyuu/skills-marketplace` Skill 收集机制研究](Vault2077-Skills-Marketplace-Collection-Research.md)、[Skill 推荐、热门榜与聚合源替代方案研究](Vault2077-Skill-Aggregator-Alternatives-Research.md)、[Code Agent Skill 市场 API 调研](Vault2077-Code-Agent-Skill-Market-API-Research.md)、[`anbeime/skill` 源码研究](anbeime-skill-research.md)、[VoltAgent 与 OpenAI Skill 来源研究](Vault2077-VoltAgent-OpenAI-Skill-Sources-Research.md)、[Skill 精选首批来源与候选证据](Vault2077-Skill-Collection-Source-Evidence.md)

## 历史产品提案

- SiC：[已废止的 Skill 精选集策划方案](Vault2077-SiC-Skill-Collection-Plan.md)

## 维护规则

- 所有 `docs/` 下的 Markdown 必须有 `type`、`status`、`updated` 元数据；除标注 `authority: process` 且以 `.local.md` 结尾的本地过程材料外，其余文档必须在本页登记。
- 产品规格、已接受 ADR、系统交付规格、当前运行手册与项目长期记忆才是项目文档。调研草稿、临时审计、中间方案和阶段记录不产生规范效力；本地保留时必须同时使用 `.local.md` 文件名和 `authority: process`，该命名已被 Git 忽略，不得加入本索引或提交。
- 规范正文不得引用已废止的接口、榜单或运行命令，除非明确写在迁移段落。
- 接受 ADR 时，必须同步更新总规格、受影响专项规格、系统规格、追踪矩阵与上线清单。
- 调研结论只有被吸收到规范文档后才生效。
- 每次文档修订必须运行 `npm run docs:check`。
