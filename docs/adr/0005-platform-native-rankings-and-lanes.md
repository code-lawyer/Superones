---
type: adr
status: amended
updated: 2026-07-31
amends: ADR-0004
amended-by: ADR-0007, ADR-0008, ADR-0009, ADR-0015, ADR-0017
---

# 平台原生榜与四采集通道

SiC 直接转呈经 GitHub 官方 REST API 获取的 OpenGithubs 日/周/月聚合榜、Hugging Face Trending 与 OpenRouter `top-weekly`，不访问榜单网页，不再用本地快照计算增长，也不设 Skill 或 MCP 榜。统一境外采集仍由一个 workflow 文件和一种签名协议承担，但按 information、roadside、sic、rankings 四个通道独立调度、重试和观测，从而隔离职责而不复制系统。

ADR-0015 将生产节奏修订为白天低频运行：information 为北京时间 `08:05–22:05` 每两小时，roadside 为 `08:55–22:55` 每两小时，sic 每日 `08:25`，rankings 为 `08:35/12:35/16:35/20:35`；00:00–08:00 不采集。Frontier 参赛仓库即时核验仍由境内业务服务执行，常规观察改为 `08:45–22:45` 每两小时。Hugging Face Weekly Papers 在 sic 通道内读取指定周全集和 upvotes，并在本地生成周排名，不归入独立 rankings 通道。

ADR-0008 约束 information、roadside 与 sic 的内容边界：同一原始内容只有一个主去向。ADR-0017 随后下架 Hacker News/Lobsters，并将 Follow Builders X/Blogs/Podcasts 三个可信中央 feed 分别路由到 roadside、SiC documents 与 SiC podcasts。

ADR-0009 约束三个内容通道的境内处理：information 与 roadside 共享 Vault 编辑配置，sic 使用独立 SiC 编辑配置；四通道的错峰采集节奏不等于同一时间集中调用一套编辑模型。
