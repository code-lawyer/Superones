---
type: index
status: active
updated: 2026-07-24
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
- OPC：[OPC 设计规格](Vault2077-OPC-Design-Spec.md)
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

## 当前运行文档

- [统一采集运行手册](Vault2077-Unified-Acquisition-Runbook.md)
- [部署配置手册](Vault2077-Deployment-Configuration-Manual.md)
- [Content Pipeline Operations](Content-Pipeline-Operations.md) 已被统一采集手册取代，只保留迁移指引。

## 支持性方案

- [OPC 开发计划](Vault2077-OPC-Development-Plan.md)：内容已吸收到 OPC 规格，保留实施分解。
- [OPC 页面设计提案](Vault2077-OPC-Page-Design-Proposal.md)：已被 OPC 规格取代。
- [SiC 内容架构计划](Vault2077-SiC-Content-Architecture-Plan.md)：已被 SiC 规格取代。

## 调研、审计与证据

以下文档均不产生当前需求：

- 项目审计：[2026-07-24 深层次项目审计](Vault2077-Deep-Audit-2026-07-24.md)
- 信息与采集：[Information Pipeline Research](Vault2077-Information-Pipeline-Research.md)、[Collector Architecture Research](Vault2077-Collector-Architecture-Research.md)、[Collector Adoption Decision](Vault2077-Collector-Adoption-Decision.md)
- 来源治理：[Source Taxonomy Report](Vault2077-Source-Taxonomy-Report.md)、[Source Inventory](Vault2077-Source-Inventory.md)、[Current Source Inventory Report](Vault2077-Current-Source-Inventory-Report.md)、[Source Audit Research](Vault2077-Source-Audit-Research.md)、[Source Audit Report](Vault2077-Source-Audit-Report.md)、[Glance Source Absorption Audit](Vault2077-Glance-Source-Absorption-Audit.md)
- SiC 调研：[Source Candidates Batch 1](Vault2077-SiC-Source-Candidates-Batch-1.md)、[Official Sources Research](Vault2077-SiC-Official-Sources-Research.md)、[Papers and Official Archives Research](Vault2077-SiC-Papers-and-Official-Archives-Research.md)、[Frontier AI Resource Audit](Vault2077-SiC-Frontier-AI-Resource-Audit.md)、[GitHub Trending API Research](Vault2077-SiC-GitHub-Trending-API-Research.md)、[Hugging Face Ranking Research](Vault2077-SiC-Hugging-Face-Weekly-Model-Ranking-Research.md)、[OpenRouter Ranking Research](Vault2077-SiC-OpenRouter-Model-Ranking-Research.md)、[Skill Market Research](Vault2077-Skill-Market-Integration-Research.md)

## 维护规则

- 所有 `docs/` 下的 Markdown 必须有 `type`、`status`、`updated` 元数据并在本页登记。
- 规范正文不得引用已废止的接口、榜单或运行命令，除非明确写在迁移段落。
- 接受 ADR 时，必须同步更新总规格、受影响专项规格、系统规格、追踪矩阵与上线清单。
- 调研结论只有被吸收到规范文档后才生效。
- 每次文档修订必须运行 `npm run docs:check`。
