---
title: Vault2077 信源分类调查报告
date: 2026-07-22
tags:
  - source-audit
  - taxonomy
  - vault2077
---

# Vault2077 信源分类调查报告

> [!abstract] 结论
> 当前注册表的 475 个频道已经回答“从哪里、以什么技术方式采集”，却还不能稳定回答“谁在发布、这条内容能证明什么”。分类法应把**载体类型、发布者性质、证据性质**拆成三条正交轴；聚合器和代理只属于采集路径，不能冒充发布者或第二份独立证据。

## 一、三条轴不能混用

**载体类型（channel type）**描述内容通过什么频道到达，例如 `article`、`x`、`podcast`、`github-release`。它服务于抓取器选择、标识规范化和去重，但不决定内容可信度：OpenAI 官方博客与媒体评论都可能是 `article`；公司公告与个人猜测也都可能出现在 `x`。视频专属通道已从当前注册表排除。

**发布者性质（publisher kind）**描述谁对内容负责，例如公司／研究机构、个人、新闻媒体、社区、平台或聚合服务。它与载体无关：同一机构可以同时拥有博客、X 和 GitHub 通道。现有 `publisherRole` 只有“媒体／评论／研究／官方”等默认标签，混合了组织身份、内容体裁和价值判断，不能作为可靠的发布者分类。

**证据性质（evidence nature）**描述一条材料在研究中能支持什么主张。官方发布可以证明“该机构说了什么”，未必证明说法客观成立；媒体报道可以提供采访和背景，社交帖子适合捕捉观点与线索，热榜只能证明某时点的注意力排序。证据性质应在条目级允许覆盖频道默认值。

上述区分也解释了为什么“经 RSSHub 抓到的公司博客”仍是公司一手源，而“GitHub Trending”即使直抓 GitHub，也只是发现入口。审计口径与去重规则见[上游信源审计研究](Vault2077-Source-Audit-Research.md)；机器清单见 [source-registry.json](../config/source-registry.json) 与 [source-bundle.json](../config/source-bundle.json)。

## 二、频道盘点与生产状态

`source-registry.json` 共 475 个频道、486 个端点。生产 bundle 按原始发布平台和媒介范围过滤：大陆来源平台及其代理出口不进入 active，X 等境外平台上的中文内容不受影响，视频专属通道不进入注册表。当前结果为 201 个 active、255 个 pending 和 19 个 excluded。

| channel type | 全量 | active | pending | excluded |
|---|---:|---:|---:|---:|
| article | 189 | 20 | 169 | 0 |
| x | 179 | 160 | 19 | 0 |
| podcast | 36 | 3 | 33 | 0 |
| reddit | 15 | 0 | 15 | 0 |
| github-release | 11 | 11 | 0 | 0 |
| hotlist | 11 | 0 | 11 | 0 |
| market (`market-data`) | 9 | 0 | 0 | 9 |
| github-trending | 6 | 3 | 3 | 0 |
| twitch | 6 | 0 | 0 | 6 |
| dynamic-list (`dynamic-aggregate-list`) | 4 | 0 | 0 | 4 |
| community | 2 | 2 | 0 | 0 |
| github-user-events | 2 | 2 | 0 | 0 |
| news-search | 2 | 0 | 2 | 0 |
| official-blog | 2 | 0 | 2 | 0 |
| telegram | 1 | 0 | 1 | 0 |
| **合计** | **475** | **201** | **255** | **19** |

Instagram 当前为 **0**：注册表中既没有 Instagram channel type，也没有 Instagram 域名或发布者记录。这个“零”应明确保留，避免把“尚未纳入”误读成“审计遗漏后默认存在”。

## 三、证据性质的五类口径

1. **原始一手源**：事实主体、产品所有者或研究／软件作者直接发布的材料。代表例子包括 Anthropic Engineering、Claude Blog、`astral-sh/uv` GitHub Release、项目维护者 GitHub events。适合确认版本、功能、政策和官方立场；仍需区分声明与外部验证。
2. **加工媒体／分析**：记者、编辑、分析师或专业作者对原始材料进行采访、筛选、解释和论证。代表例子包括 InfoQ、机器之心、量子位、Simon Willison's Weblog。它们能提供背景和反方信息，但引用关键事实时应回链原始文件。
3. **社交观点／社区**：个人或机构 X 帖子，以及 Hacker News、Lobsters、Reddit 等讨论。它适合发现观点、争议、用户体验与早期异常；点赞、排序和转述不能直接升级为事实证据。
4. **发现聚合**：热榜、GitHub Trending、OSS Insight、Google News、GDELT，以及 Folo List 等动态集合。它们回答“哪里可能有值得读的内容”，不回答“谁最先发布”或“多个入口是否构成多源验证”。应保存每个条目的 `original_url` 与实际发布者。
5. **非信息流数据**：行情代码、价格序列等数值数据，以及不在本 Vault 资讯流范围内的 Twitch 直播和不可静态展开的动态列表。Yahoo Finance 的 AAPL、NVDA、Bitcoin 等不是资讯发布者；需要公司事实时，应改接 IR、newsroom 或监管披露。它们被 excluded 是范围选择，不等于端点无效。

这五类不是 channel type 的别名。例如 `article` 可同时是一手源或加工分析，`x` 可同时是官方声明或社交观点，`github-trending` 则稳定属于发现聚合。

## 四、集中度与可审计性风险

端点层的代理集中度很高：XGo 160、Wechat2RSS 115、RSSHub 33、NewsNow 11、Folo 4、pod2txt 1，合计 324 个端点，占 486 个端点的约 66.7%。其中 XGo 的 token 不能替代标准化 `@handle`，Wechat2RSS／RSSHub 是传输代理，NewsNow 与 Folo 是发现／聚合入口，pod2txt 是播客转录包装层。任一服务故障会造成相关频道同时失联；而同一原文经两个代理出现，也不能算两份独立证据。固定上游证据包括 [BestBlogs 四类汇总 OPML](https://github.com/ginobefun/BestBlogs/blob/756ffbddf5cf4cd87e383a82b7c997563032e93f/BestBlogs_RSS_ALL.opml)、[TrendRadar 固定配置](https://github.com/sansan0/TrendRadar/blob/8ee26026ba6c11dec41a95fb3895a7162876caa1/config/config.yaml)、[NewsNow 固定来源实现](https://github.com/ourongxing/newsnow/tree/2173126f804bec0201769f59d933add6c4632d17/server/sources)、[follow-builders 固定来源](https://github.com/zarazhangrui/follow-builders/blob/d81cc5ca00b07905f88398cd1ed39fd5f4ac12a4/config/default-sources.json) 与 [CloudFlare Folo List 配置](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily/blob/287cde1f1614e90e6c2f5e39ce6621dd9f7b8d83/wrangler.toml)。

目录发现也高度集中：删除视频频道后，BestBlogs 仍发现了 **360/475（75.8%）** 的注册频道；生产 active 中 **180/201（89.6%）** 可追溯到 BestBlogs。这说明当前可用集合很大程度继承了同一目录的选源偏好，不能把 180 个频道等同于 180 个独立策展判断。BestBlogs 固定提交确实可审计，但其 OPML 目录、代理可用性和原始发布者身份仍应分层记录。

## 五、第一轮机器分类与字段边界

原始抽取字段 `language` 在 **475/475** 个通道上全部为 `unknown`，`publisherRole` 也是默认推断值，不能承担筛选、地域覆盖或证据分级。第一轮分类现已通过 `scripts/classify-source-registry.mjs` 和受控覆盖表补入以下字段：

| 字段 | 建议含义 |
|---|---|
| `publisher_kind` | `organization`、`person`、`media`、`community`、`platform`、`aggregator` 等主体类型 |
| `evidence_nature` | `primary`、`reported_analysis`、`social_community`、`discovery_aggregate`、`non_information_data`；允许条目级覆盖 |
| `owner_entity` | 跨载体统一的规范实体 ID，例如 Anthropic、Simon Willison、Latent Space |
| `primary_language` | 频道主要内容语言；另以条目级 `language` 处理多语内容 |
| `geography` | 发布者所在地或主要覆盖区域，并明确采用哪一种定义 |

同时增加 `classification_source`、`classification_confidence` 与 `classified_at`，区分人工覆盖、规则推断和上游声明。删除视频频道后的结果为：142 条高置信度、41 条中置信度、292 条低置信度；主要语言为英文 66、简体中文 149、仍未知 260。内容语言只用于保留、展示和翻译，不参与来源准入。生产准入根据原始发布平台判断：微信公众号、小红书、知乎、微博、小宇宙和大陆热榜等保持 pending；X、GitHub 等境外平台可承载中文内容。YouTube 因媒介处理范围被整体排除。直接博客和媒体网站仍需确认其来源平台归属后才能 active。采集层继续记录 `connector_endpoint`、`aggregator`、`discovered_from`、固定提交 SHA；内容层记录 `original_url`、原始发布者与证据性质。
