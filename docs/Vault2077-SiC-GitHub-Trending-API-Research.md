# Vault2077 SiC：GitHub Trending 与 Star 增长榜数据源研究

研究日期：2026-07-22

## 结论

截至研究日期，GitHub 没有公开、正式、结构化的 Trending REST API 或 GraphQL API。GitHub 官方只提供
`github.com/trending` 网页，支持 daily、weekly、monthly 参数，但没有公开榜单算法。

SiC 不需要自行开发通用网页解析器，可以采用两条不同的数据链：

1. **GitHub 官方 Trending（Today / All languages）**：读取
   [`isboyjc/github-trending-api`](https://github.com/isboyjc/github-trending-api)
   发布的 [`data/daily/all.json`](https://raw.githubusercontent.com/isboyjc/github-trending-api/main/data/daily/all.json)。
   该项目用 GitHub Actions 每日运行四次，把 GitHub 官方 Trending 网页的顺序、累计 Star 和
   `addStars` 转为 JSON；MIT 许可。它是第三方结构化镜像，不是 GitHub 官方 API。
2. **全站 24H / 7D 新增 Star 榜**：使用
   [GH Archive](https://www.gharchive.org/) 的 GitHub 公共事件归档，在其每小时更新的
   BigQuery 公共数据集中聚合 `WatchEvent`。这是数据查询和聚合，不需要解析 GitHub HTML，
   也不会把第三方“综合热度”误当成新增 Star。

## 官方 API 核验

### REST

GitHub 说明其 REST API 已完整描述在公开
[OpenAPI 规格](https://docs.github.com/en/rest/about-the-rest-api/about-the-openapi-description-for-the-rest-api)
中，并公开维护 [`github/rest-api-description`](https://github.com/github/rest-api-description)。
对当前公开规格、REST 参考目录和常见候选路径的核验，没有发现 Trending 或 Explore 榜单端点；
`api.github.com/trending` 不是有效端点。

官方 REST 能提供：

- 单个仓库当前的 `stargazers_count`；
- 单仓库 stargazer 列表及时间戳；
- 最多约 300 条、最长 30 天的公共 Events 时间线。

这些能力都不能直接发现“全站过去 24 小时或 7 天新增 Star 最多的仓库”。此外，GitHub 已宣布
[限制 stargazers 列表访问](https://github.blog/changelog/2026-06-30-upcoming-access-restrictions-to-public-api-endpoints-and-ui-views/)；
因此逐仓库枚举 stargazer 也不适合作为全站榜单方案。

### GraphQL

GitHub 的公开 GraphQL schema 中没有 `trending` 查询或对象。GraphQL 能查询已知仓库、搜索结果和
连接数据，但不能返回 GitHub 官方 Trending 顺序，也不能按过去 24H / 7D 新增 Star 对全站仓库排序。

### Trending 页面

[GitHub Trending](https://github.com/trending?since=daily) 是服务器返回的 HTML 页面。
它公开 daily、weekly、monthly 视图和每个仓库的当期新增 Star，但没有 JSON 内容协商接口，也没有
公开排序公式。官方文档只将其描述为浏览当日热门仓库的产品页面。

因此，任何声称提供“GitHub Trending API”的第三方项目，本质上都只能：

- 解析 GitHub Trending HTML；或
- 自己根据事件、快照或综合评分定义另一套“趋势”。

两者不能混为一谈。

## 候选方案评估

| 数据源 | 能解决什么 | 更新与字段 | 结论 |
| --- | --- | --- | --- |
| [`isboyjc/github-trending-api`](https://github.com/isboyjc/github-trending-api) | 保留 GitHub 官方 Trending 顺序 | 每日四次；JSON 含仓库、累计 Star、`addStars`；MIT | **Trending 主源** |
| [`mshibanami/GitHubTrendingRSS`](https://github.com/mshibanami/GitHubTrendingRSS) | GitHub Trending 的 RSS 镜像 | 每日；daily/weekly/monthly；MIT；2026 年仍运行 | **Trending 备源**，但当期 Star 字段不如主源完整 |
| [`NiklasTiede/Github-Trending-API`](https://github.com/NiklasTiede/Github-Trending-API) | 可自托管的 JSON API | Python/FastAPI；底层解析 HTML | 仅作灾备代码参考 |
| [`huchenme/github-trending-api`](https://github.com/huchenme/github-trending-api) | 老牌非官方 Trending API | 字段完整；MIT | 托管端点实测不稳定，不作生产主源 |
| [`vitalets/github-trending-repos`](https://github.com/vitalets/github-trending-repos) | 定时记录 daily/weekly Trending | 结果主要写入 GitHub Issues | 不适合作程序主接口 |
| [OSSInsight](https://github.com/pingcap/ossinsight) `/v1/trends/repos` | 开源项目综合活跃趋势 | 返回 stars、forks、PR、pushes、`total_score` | **不能直接作为纯新增 Star 榜** |
| [GH Archive](https://www.gharchive.org/) | 全站 GitHub 公共事件 | 小时归档；BigQuery 每小时更新 | **24H / 7D 新增 Star 主源** |

## OSSInsight 的关键边界

项目当前配置已经接入：

```text
https://api.ossinsight.io/v1/trends/repos?period=past_24_hours&language=All
```

实测该接口可用，也支持 `past_week`，但返回顺序由 `total_score` 决定。响应同时包含 stars、forks、
pull_requests 和 pushes。额外传入 `sort=stars` 或 `order_by=stars` 不会改变排序。

所以它适合作“综合活跃趋势”，不符合已经确认的：

- 全站 24H 新增 Star 最多；
- 全站 7D 新增 Star 最多。

即使在返回的前 100 条内再次按 `stars` 排序，也不能证明得到全站 Top 20，因为高 Star、低其他活跃度
的仓库可能根本没有进入这 100 条候选。

## 推荐数据契约

### 官方 Trending

主源：

```text
https://raw.githubusercontent.com/isboyjc/github-trending-api/main/data/daily/all.json
```

只消费：

- `pubDate`
- `items[].title`
- `items[].url`
- `items[].stars`
- `items[].addStars`
- 原始数组顺序

不对数组重新排序。若一次只返回 19 条，就展示 19 条，不补位、不伪造第 20 名。

上游计划时间是 UTC 01:00、07:00、13:00、19:00（北京时间 09:00、15:00、21:00、03:00）。
SiC 可以仍按自己的统一批次轮询，但公开数据截止时间必须取上游 `pubDate`，不能写成本地请求时间。

### 24H / 7D 新增 Star

在 GH Archive BigQuery 公共数据集中：

1. 限定滚动时间窗；
2. 只统计 `type = 'WatchEvent'` 且 `payload.action = 'started'`；
3. 按稳定的 `repo.id` 聚合，名称仅作展示；
4. `COUNT(*)` 作为窗口新增 Star；
5. 按计数降序，固定稳定的并列规则，取 Top 20；
6. 再通过 GitHub Repository REST API补充当前仓库地址、README 和许可证。

GH Archive 说明原始数据来自 GitHub Events API，按小时归档，BigQuery 数据集每小时更新。Google
[BigQuery 公共数据集](https://cloud.google.com/bigquery/public-data)由平台托管，查询方只承担查询；
首个 1 TB/月免费，但公共数据集没有 SLA。生产上应缓存每日榜单快照并保留最后成功结果。

## 最终建议

采用“**结构化镜像 + 公共事件聚合**”：

- 官方 Trending：`isboyjc/github-trending-api` JSON 主源，`GitHubTrendingRSS` 备源；
- 24H / 7D：GH Archive BigQuery 的 WatchEvent 聚合；
- OSSInsight 保留为研究或综合活跃度候选源，不进入这两个 Star 增长榜；
- 不依赖无法验证维护状态的免费公共 API；
- 不在 Vault2077 内维护通用 HTML 抓取器。

这样满足“不专门做解析器”，同时不会错误声称 GitHub 官方提供了并不存在的 Trending API。
