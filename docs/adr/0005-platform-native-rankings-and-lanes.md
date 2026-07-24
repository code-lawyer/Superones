# ADR 0005：四通道调度与平台原生榜单

状态：Accepted
日期：2026-07-24

## 决策

信息管线拆为 `information`、`statements`、`sic`、`rankings` 四个独立通道。GitHub Actions 全局串行调度，境内 Worker 串行领取批次，内容处理共享并发为 2 的 LLM 池；排行榜不调用 LLM。

名人说只允许经过核验的自然人 X 账号。X 原生内容不得进入资讯瀑布，X status ID 是跨 RSS 与聚合入口的根源去重键。

所有技术榜单改为平台原生视图：GitHub Trending Today/This week/This month、Hugging Face Trending、OpenRouter top-weekly，以及 skills.sh All Time/Trending 24h/Hot。MCP 排行暂时删除。项目不得再以本地快照差或事件聚合结果冒充平台榜单。

`direct-rankings.json` 只保存每个视图最近一次成功抓取的原始顺序。每条记录必须包含 provider、providerView、providerRank、providerMetric、capturedAt 与 sourceUrl。

## 影响

本决策替代早期设计和调研文档中关于 GH Archive 24H/7D、新增下载差值、Skill/MCP 快照增量以及相关 Google Cloud、Smithery、Vercel OIDC 凭据的实施建议。旧调研文档只作为历史研究记录，不再代表生产架构。
