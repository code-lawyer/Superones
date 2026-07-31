---
type: adr
status: amended
updated: 2026-07-25
amends: ADR-0004
amended-by: ADR-0007, ADR-0008, ADR-0009
---

# 平台原生榜与四采集通道

SiC 直接转呈经 GitHub 官方 REST API 获取的 OpenGithubs 日/周/月聚合榜、Hugging Face Trending 与 OpenRouter `top-weekly`，不访问榜单网页，不再用本地快照计算增长，也不设 Skill 或 MCP 榜。统一境外采集仍由一个 workflow 文件和一种签名协议承担，但按 information、roadside、sic、rankings 四个通道独立调度、重试和观测，从而隔离职责而不复制系统。

rankings 通道每小时唤醒，处理到期的平台原生榜以及 Frontier 失败回退或批量核验产生的公开任务结果；Frontier 参赛仓库的即时核验和每小时主观察由境内业务服务依据当前参赛名单执行。其余通道的基准节奏为 information 北京时间偶数小时 `:05`、roadside 偶数小时 `:55`、sic 每日 `07:25` 与 `19:25`。

ADR-0008 约束 information、roadside 与 sic 的内容边界：同一原始内容只有一个主去向，Hacker News/Lobsters 的外链不产生跨通道晋升。

ADR-0009 约束三个内容通道的境内处理：information 与 roadside 共享 Vault 编辑配置，sic 使用独立 SiC 编辑配置；四通道的错峰采集节奏不等于同一时间集中调用一套编辑模型。
