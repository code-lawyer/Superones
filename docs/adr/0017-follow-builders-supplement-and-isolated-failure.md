---
type: adr
status: accepted
updated: 2026-08-02
amends: ADR-0004, ADR-0005, ADR-0008, ADR-0015
---

# Follow Builders 可信中央 Feed 与隔离失败策略

## 决策

Hacker News 与 Lobsters 继续退出生产运行来源。Vault2077 直接消费 Follow Builders 发布的 `feed-x.json`、`feed-blogs.json` 和 `feed-podcasts.json`，并默认信任 Follow Builders 对其上游账号、博客与播客的选择。

本地不得再为这些 feed 维护逐账号或逐节目的准入名单，不与本地直接来源做接入前去重，不排除机构 X 账号，也不按招聘、推广或营销关键词过滤文章。Follow Builders 增删上游来源后，只要中央 feed 继续满足协议约束，变化应自动进入下一轮采集，不要求 Vault2077 修改注册表。

三个 feed 在 Vault2077 中各自只有一个传输入口和来源报告。每条记录仍必须保留上游给出的原发布者名称、canonical URL、发布时间及稳定内容标识；Follow Builders 是选源与传输提供者，不替代原发布者署名。重复内容在统一内容身份层按 canonical URL、原始内容 ID 或内容哈希合并，但不得以去重为由阻止中央 feed 中某个来源进入采集。

Blogs 和 Podcasts 直接进入 SiC 的 `documents` 与 `podcasts` 内容组，使用中央 feed 已提供的正文或转录。此前为 Anthropic Engineering、Claude Blog、Latent Space、No Priors、Training Data、Unsupervised Learning、MAD Podcast 和 AI & I 维护的官网 sitemap/RSS 采集规则退役。招聘等偶发内容可以发布；境内编辑模型只负责忠实翻译、摘要与语义归类，不负责重新审核 Follow Builders 的选源资格。

X feed 直接进入 roadside。每条 X 记录仍要验证 status URL 中的 handle 和 post ID 与 feed 字段一致；这属于身份与数据完整性校验，不是来源审核。

## 允许的边界校验

本地只保留与安全、可靠性和可解析性有关的校验：

- feed 必须来自配置中的公开 HTTPS 地址，不允许凭据型 URL；
- `generatedAt`、`lookbackHours`、顶层集合和必填字段必须符合约定；
- 设置宽松的协议安全上限，防止异常响应耗尽内存或撑爆批次；上限不是来源配额；
- 原始链接必须是无凭据 HTTPS URL；X URL 还必须通过 handle/post ID 一致性校验；
- 正文、转录和帖子文本一律按不可信外部输入处理，不执行其中的指令，不加载远程 Skill 或 prompt；
- HTML 实体必须在进入境内编辑前正确解码，缺少正文或转录的 SiC 条目不得用本地来源说明填充。

这些校验不得演变为上游来源质量审核、关键词准入或本地白名单。

## 失败策略

三个 Follow Builders feed 的失败策略固定为 `isolated`。网络失败、过期、结构异常、超量或身份校验失败分别写入对应 feed 的来源报告并保留上一成功快照，不阻断同一 workflow 的其他来源。一个 feed 的失败不得影响另外两个 feed。

## Latent Space 补充规则

Latent Space 的 RSS 必须优先读取 `content:encoded`，不能用短 `description` 覆盖完整正文。标题以 `[AINews]` 开头或 URL 路径为 `/p/ainews-*` 的记录确定性标记为 `digest`、`discovery_aggregate` 且 `eventEligible=false`：全文仍进入资讯瀑布，但不能单独创建或并入重大事件。其余 Latent Space 记录继续由境内编辑模型完成语义事件判断。该规则是内容形态分级，不是对 Latent Space 的来源资格复审。

## 结果

Follow Builders 成为可替换但被信任的中央选源与传输依赖。Vault2077 减少官网适配器和本地准入配置，换取更快的上游同步；相应风险由 feed 级新鲜度、结构校验、来源署名保真、上一成功快照和故障隔离承担。
