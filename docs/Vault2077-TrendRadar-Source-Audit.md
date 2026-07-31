---
type: source-audit
status: reference
updated: 2026-07-30
---

# Vault2077：TrendRadar 信源与管线审查

> 审查对象：[`sansan0/TrendRadar`](https://github.com/sansan0/TrendRadar)
> 审查日期：2026-07-30
> 准入原则：只使用 API、RSS、Atom、JSON Feed 等稳定结构化入口；不使用网页抓取、无头浏览器、详情页补抓；不使用中文发布者/平台；信息瀑布保存逐条原始资讯，事件簿只能消费信息瀑布。

## 结论

TrendRadar **不应作为 Vault2077 的采集运行时，也不应直接复制其代码**。它的核心产品模型是“热榜标题、排名和出现时间线”，默认热榜又全部来自中文平台，与 Vault2077 的英语来源、原始资讯瀑布和下游事件归并模型不匹配。

它的直接信源增量很小：

- 默认 11 个 NewsNow 热榜全部淘汰；
- Hacker News RSS 可用但与 Vault 已启用的官方 Firebase API 重复；
- 阮一峰 Atom 因中文发布者淘汰；
- Yahoo Finance RSS 是唯一值得保留的默认新增候选，但只能作为保留底层发布者的稀疏聚合条目；
- 沿 NewsNow 非默认目录继续追踪，可增加 Product Hunt 官方 Atom，归入“路边社”，不进入媒体资讯流。

它对 Vault2077 的主要价值在工程方法：聚合返回链接的预期域名校验、失败源隔离、GUID 优先去重、先落库后做新鲜度过滤，以及 current/daily/incremental 三种增量视图。

## 1. 默认信源逐项裁决

TrendRadar 当前默认配置见 [`config/config.yaml`](https://github.com/sansan0/TrendRadar/blob/master/config/config.yaml)。热榜经 NewsNow JSON 接口获取；RSS 是另一条独立通路。

| 来源 | 入口 | 裁决 | 原因 |
|---|---|---|---|
| 今日头条 | NewsNow API | 淘汰 | 中文平台 |
| 百度热搜 | NewsNow API | 淘汰 | 中文平台 |
| 华尔街见闻 | NewsNow API | 淘汰 | 中文发布者 |
| 澎湃新闻 | NewsNow API | 淘汰 | 中文发布者 |
| Bilibili 热搜 | NewsNow API | 淘汰 | 中文平台 |
| 财联社热门 | NewsNow API | 淘汰 | 中文发布者 |
| 凤凰网 | NewsNow API | 淘汰 | 中文发布者 |
| 百度贴吧 | NewsNow API | 淘汰 | 中文平台 |
| 微博 | NewsNow API | 淘汰 | 中文平台；上游还依赖网页适配 |
| 抖音 | NewsNow API | 淘汰 | 中文平台；上游还依赖 Cookie/网页适配 |
| 知乎 | NewsNow API | 淘汰 | 中文平台 |
| Hacker News | `https://hnrss.org/frontpage` | 不新增 | 2026-07-30 实测 HTTP 200、20 条；Vault 已启用官方 Firebase API，后者更直接 |
| 阮一峰的网络日志 | Atom，默认禁用 | 淘汰 | 中文发布者 |
| Yahoo Finance News | `https://finance.yahoo.com/news/rssindex` | 条件候选 | 2026-07-30 实测 HTTP 200、41 条；英语、结构化、保留底层发布者，但字段稀疏 |

现有项目状态：

- `config/source-registry.json` 已登记 TrendRadar 发现的 Hacker News RSS 和 11 个 NewsNow 热榜；
- 当前 active bundle 中 Hacker News 使用 `https://hacker-news.firebaseio.com/v0/topstories.json`；
- 11 个中文热榜没有 active；
- Yahoo Finance RSS 尚未进入现有注册表。

因此，TrendRadar 默认源的净新增上限是 **1 条条件候选：Yahoo Finance RSS**。

## 2. Yahoo Finance RSS 的正确接法

Yahoo Finance RSS 当前可稳定返回 XML，但它混合 Yahoo 自有内容和转载/联合发布内容。实测条目的 `<source>` 字段能区分 Reuters、TheStreet、FreightWaves、PitchBook、Barchart、Yahoo Personal Finance 等底层发布者；同时 feed 缺少稳定的作者和摘要字段。

建议：

1. 以 Yahoo Finance 作为 `transport/aggregator`，绝不把全部条目归为 Yahoo 的独立报道；
2. 保存 `<source>` 名称和 `source.url`，映射到底层 publisher；
3. 仅当底层 publisher 通过英语来源准入时进入信息瀑布；
4. 原样保存标题、链接、发布日期、GUID、底层发布者和采集时间；
5. 因禁止详情页补抓，不承诺正文或摘要；UI 应明确显示为“标题型聚合条目”；
6. 与 Reuters 等直接 API/RSS 来源按 canonical URL、GUID 和标题时间窗去重，避免把聚合转载算作独立证据。

结论：可登记为 `conditional`，不建议在首批核心源中给予高权重。

## 3. NewsNow 非默认目录的英语候选

TrendRadar 允许填写 NewsNow platform ID，但这不意味着 NewsNow 的所有来源都自动合规。聚合 API 只是传输层；仍须审查每个底层适配器。

| 候选 | 稳定入口 | 去向 | 裁决 |
|---|---|---|---|
| Product Hunt | `https://www.producthunt.com/feed` | 路边社 | 推荐新增候选；2026-07-30 实测 HTTP 200、Atom、50 条 |
| Product Hunt GraphQL | `https://api.producthunt.com/v2/api/graphql` | 路边社 | 有官方 API，但需要 token/配额治理；优先 Atom |
| Hacker News | 官方 Firebase API | 路边社 | 已覆盖，不新增 NewsNow 或第三方 RSS 通道 |
| GitHub Trending | 无官方 feed/API | — | 淘汰；不得采用 HTML 抓取 |
| Steam 热门/排行 | NewsNow 上游网页适配 | — | 淘汰；且不是本项目核心资讯来源 |

Product Hunt 是社区原生的产品发布流，不是新闻媒体；条目可以作为路边社信号，不能直接算作事件事实。事件簿若使用它，该原始条目必须先进入信息流页面的路边社原始条目集合，再与其他独立资讯交叉归并。

## 4. 值得吸收的工程设计

### 4.1 聚合链接的 `expected_domain` 校验

TrendRadar 对 NewsNow 返回的 `url/mobileUrl` 要求 HTTPS，并校验 hostname 等于或隶属于配置的预期主域名。实现见 [`trendradar/crawler/fetcher.py`](https://github.com/sansan0/TrendRadar/blob/master/trendradar/crawler/fetcher.py)。

Vault 应把它扩展为统一的聚合源安全门：

- 逐 publisher 配置允许域名；
- 使用解析后的 hostname，不能用字符串包含判断；
- 拒绝 HTTP、userinfo 欺骗、非标准端口和不匹配重定向；
- 保存 `transport_domain`、`declared_publisher_domain`、`final_item_domain` 三层归属。

### 4.2 RSS/Atom/JSON Feed 统一解析

TrendRadar 的 RSS parser 能统一提取 title、URL、published time、summary、author、GUID，并支持 RSS、Atom 和 JSON Feed。可借鉴字段规范，但不复制实现。

Vault 的统一原子条目至少应保存：

`source_id, publisher_id, transport_id, external_id/guid, canonical_url, title, published_at, author, summary/content, fetched_at, raw_payload_hash`

### 4.3 去重优先级

采用：

1. 稳定 GUID/external ID；
2. 规范化 canonical URL；
3. publisher + 标题指纹 + 发布时间窗；
4. 内容哈希。

不能只按标题去重，也不能把同一底层文章经不同聚合器出现当作多份独立证据。

### 4.4 先落原始数据，再过滤展示

TrendRadar 的 freshness filter 只影响推送，所有条目仍先存储。这符合 Vault 的证据链要求。抓取时应保存原始批次，语言、分类、时效、重要性和 UI 排序属于后续派生层。

### 4.5 失败隔离与增量视图

每个 feed 独立失败并形成 `failed_ids`，不阻断整批；`daily/current/incremental` 三种模式适合转化为：

- `raw_ingest_batch`：不可变采集批次；
- `current_view`：当前资讯瀑布；
- `delta_view`：自上次水位后的新增/变化；
- `daily_snapshot`：当日审计快照。

## 5. 明确不采用的部分

- 不部署 TrendRadar 作为 Vault2077 上游；
- 不把 NewsNow 当作 canonical publisher；
- 不接入任何 NewsNow 内部依赖 HTML、Cookie 或页面解析的来源；
- 不使用 TrendRadar/Jina 的 `read_article`、批量正文读取或其他详情页补抓能力；
- 不把热榜排名、关键词筛选、AI 翻译、情感或摘要写回“原始资讯”；
- 不让事件簿拥有独立抓取器；事件只能引用已入库原始条目；
- 不直接复制 TrendRadar 代码。其许可证为 [GPL-3.0](https://github.com/sansan0/TrendRadar/blob/master/LICENSE)，应只独立重写通用设计思想，除非 Vault 的许可证和分发方式经过专门评估。

## 6. 最终清单

### 推荐新增

- Product Hunt 官方 Atom：路边社，低到中权重。

### 条件登记

- Yahoo Finance News RSS：信息瀑布的稀疏聚合条目；必须保留底层 publisher 并做准入、去重。

### 已覆盖

- Hacker News：继续使用官方 Firebase API，不新增 `hnrss.org` 生产通道。

### 淘汰

- TrendRadar 默认 11 个中文热榜；
- 阮一峰 Atom；
- NewsNow 内部任何 HTML/Cookie/页面抓取源；
- GitHub Trending、Steam 网页榜单；
- Jina Reader 正文补抓链路。

最终建议是：**不引入 TrendRadar 运行时；吸收其安全校验、原始落库、失败隔离和增量视图设计；信源层只新增 Product Hunt Atom 候选，并将 Yahoo Finance RSS置于条件队列。**
