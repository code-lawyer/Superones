---
type: adr
status: accepted
updated: 2026-07-24
amends: ADR-0004
---

# 平台原生榜与四采集通道

SiC 直接转呈 GitHub Trending、Hugging Face Trending、OpenRouter `top-weekly` 与 skills.sh 的平台原生视图，不再用本地快照计算增长，也不设 MCP 榜。统一境外采集仍由一个 workflow 文件和一种签名协议承担，但按 information、roadside、sic、rankings 四个通道独立调度、重试和观测，从而隔离职责而不复制系统。

rankings 通道每小时唤醒以处理边境计划公开任务与整点快照；SiC 平台榜只在各自到期时刷新。其余通道的基准节奏为 information 北京时间偶数小时 `:05`、roadside 偶数小时 `:55`、sic 每日 `07:25` 与 `19:25`。
