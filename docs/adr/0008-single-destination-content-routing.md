---
type: adr
status: accepted
updated: 2026-07-24
amends: ADR-0004, ADR-0005
amended-by: ADR-0017
---

# 公开内容实行单一主去向

机构新闻、公告和重大版本进入 Vault 资讯瀑布，机构深度研究、技术报告、系统卡、方法论和长篇工程材料进入 SiC 档案；同一原始内容不得重复采集或双重发布。边界混合且不能按固定入口稳定拆分的机构 Feed 保持待审，不把分类责任转嫁给境内 LLM。

Hacker News 与 Lobsters 曾按社区条目、排序和讨论入口的一手来源处理；ADR-0017 已将二者从生产运行来源退役。该历史规则仅用于解释既有事件证据，不再产生新内容。Follow Builders 的 X 补充按原作者和 canonical X URL 独立入 roadside，其播客与官方博客按 SiC 单一主去向处理。
