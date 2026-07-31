---
type: source-audit
status: reference
updated: 2026-07-30
---

# Vault2077：Thysrael/Horizon 信息源审计

> 审计对象：[Thysrael/Horizon](https://github.com/Thysrael/Horizon)
> 审计基线：`main` 分支提交 [`1e2fdc7`](https://github.com/Thysrael/Horizon/commit/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c)（2026-07-17）
> 审计时间：2026-07-30
> 证据范围：Horizon 的 README、配置、预置源、采集器源码、测试和上游服务官方文档。
> Vault 当前口径：允许第三方聚合源，但生产采集只能使用稳定 API、RSS 或 Atom；禁止网页抓取、DOM 解析、无头浏览器和文章详情页补抓；不使用中文信息源，判定依据是出版商/频道身份而不是单条内容语言；资讯瀑布保存文章级原始记录；事件簿只消费资讯瀑布中的记录。

## 1. 结论

**Horizon 值得作为“信源发现清单”和“适配器设计样本”，不适合作为 Vault2077 的整套采集实现直接接入。**

它在当前代码中注册了 10 类采集适配器：

1. Hacker News
2. GitHub
3. RSS / Atom
4. Reddit
5. Telegram
6. Twitter / X
7. OpenBB
8. OSS Insight
9. GDELT
10. Google News RSS

Horizon 还有一个运行时优先读取的公开 Source Hub JSON API：

```text
GET https://horizon1123.top/api/presets
```

2026-07-30 的现场响应包含 84 条来源：52 条 RSS、21 个 subreddit、7 个 GitHub 仓库、2 个 GitHub 用户、1 个 Hacker News 和 1 个 Telegram 频道。它显著大于仓库内的 30 条本地 fallback preset，因此只审查 `data/presets.json` 会漏掉大量候选源。

综合本地预置和实时目录，它可以为 Vault 带来四组实质性增量：

- **一批英语/国际出版商的原生 RSS/Atom**：本地 preset 中有 9 个，实时 Source Hub 还增加了 36 个真实的 endpoint 级新条目，其中一部分已通过现场可用性验证。
- **4 个预置 GitHub 仓库 release 源**：可通过 GitHub 官方 API进入资讯瀑布。
- **Hacker News 和 OSS Insight 趋势**：可作为路边社信号；GitHub 用户活动只保留作 identity discovery，不进入发布流。
- **GDELT、Google News RSS、OpenBB**：可以作为第三方聚合传输层候选，但必须在 Vault 侧恢复并校验原始出版商身份。

以下部分不应照搬：

- Reddit 适配器优先抓取 `old.reddit.com` HTML；
- Telegram 适配器解析 `t.me/s/...` 公共网页；
- X/Twitter 使用 Apify 的 Scweet 抓取器或 Playwright；
- RSS 的 Trafilatura 全文抽取会访问文章网页；
- enrichment 使用 DDGS 搜索补充网页背景；
- Hacker News、Reddit 把评论拼入原始正文；
- Horizon 会把跨源重复故事合并，而 Vault 的资讯瀑布应保留每篇原始文章，再由事件簿聚类。

因此建议把 Horizon 定位为：

```text
可复用：信源名单、官方 API/RSS 端点、并发拉取和统一字段的思路
需重写：准入过滤、原始记录模型、来源身份、幂等增量、事件聚类边界
禁止采用：HTML/DOM/Playwright/Trafilatura/DDGS 补抓链路
```

## 2. 项目成熟度、许可证和维护状态

| 项目项 | 审计结果 |
| --- | --- |
| 许可证 | MIT；可复用代码，但需保留版权和许可证声明 |
| 最新提交 | 2026-07-17 |
| 近期活跃度 | 活跃；2026 年 6–7 月持续有采集器、RSS 全文抽取、Telegram、GDELT 和 Google News 等变更 |
| 仓库规模 | GitHub 页面显示 211 次提交 |
| 发布成熟度 | `pyproject.toml` 版本仍为 `0.1.0`，README 也把正式 release / PyPI 发布列为计划项 |
| 内容权利 | MIT 只覆盖 Horizon 代码，不覆盖 RSS 文章、社交内容、聚合商数据或下游公开展示权 |

项目活跃是优点，但也意味着信源层仍在快速变化。尤其 GDELT 和 Google News 适配器是 2026-06-29 才加入，RSS 网页全文抽取是 2026-07-13 加入，不宜把当前字段和行为直接当成稳定生产契约。证据见[提交历史](https://github.com/Thysrael/Horizon/commits/main/)和[`pyproject.toml`](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/pyproject.toml)。

### 2.1 实时 Source Hub API

Horizon 的 [`src/setup/presets.py`](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/src/setup/presets.py)明确规定：

```text
优先：GET https://horizon1123.top/api/presets
失败：回退到 data/presets.json
```

因此实时 API 才是设置向导当前实际使用的首选来源目录。现场统计如下：

| 类型 | 数量 |
| --- | ---: |
| RSS / Atom | 52 |
| Reddit subreddit | 21 |
| GitHub repo | 7 |
| GitHub user | 2 |
| Hacker News | 1 |
| Telegram | 1 |
| 合计 | 84 |

这组 API 数据只能视为**候选目录**，不能视为经过验证的信源注册表。现场发现：

- GitHub Trending URL 被写成 `mshibanern.github.io`，本地 preset 的正确域名是 `mshibanami.github.io`；
- `AIHUb` 的 `repo` 字段错误地填入完整 GitHub URL，和 `owner` 组合后不能被 Horizon 的 GitHub adapter 正确使用；
- Anthropic Research 的 `/research/rss` 当前返回 404；
- Microsoft AI Blog feed 当前返回 410；
- Ars Technica AI 的目录 URL当前返回 404；
- Google Blog `/feed/` 返回 HTML 而不是 RSS；
- DeepLearning.AI The Batch 的 `/the-batch/feed/` 当前经 308 跳转后落到 404；
- Source Hub 仍包含 V2EX、阮一峰、IT之家、InfoQ 中文站、量子位、新智元和中文 Telegram 频道。

这说明 Source Hub 的价值是“发现”，Vault 必须继续执行 endpoint 验证、来源身份准入和中文源过滤。

### 2.2 与当前 Vault registry / bundle 的重合

与本项目当前 [`config/source-registry.json`](../config/source-registry.json) 和 [`config/source-bundle.json`](../config/source-bundle.json) 比较：

| 比较项 | 结果 |
| --- | ---: |
| registry 中带 `Thysrael/Horizon` provenance 的 channel | 51 |
| production bundle 中由 Horizon 直接贡献的 active source | 11 |
| 实时 52 个 RSS 中，endpoint 已存在 registry | 15 |
| 实时 52 个 RSS 中，endpoint 已在当前 bundle active | 4 |
| 实时 RSS 对 registry 的精确 URL 净新增 | 37 |
| 扣除拼错的 GitHub Trending URL后的真实净新增 endpoint | 36 |

当前 bundle 中 Horizon 直接贡献的 11 个 active source 是：

```text
资讯瀑布：
  astral-sh/uv releases
  neovim/neovim releases
  rust-lang/rust releases
  sgl-project/sglang releases
  triton-lang/triton releases
  vllm-project/vllm releases
  ziglang/zig releases

路边社：
  Hacker News
  Simon Willison Atom
  Andrej Karpathy RSS bridge
  Yann LeCun RSS bridge
```

实时 Source Hub 的 RSS 中，当前 bundle 已按相同 endpoint 启用 4 条：

1. Simon Willison；
2. Latent Space；
3. Last Week in AI；
4. OpenAI News。

实时 RSS 中已有 15 个 endpoint 出现在 registry：量子位、新智元、Simon Willison、Latent Space、LWN、Brendan Gregg、Schneier、Krebs、CSS-Tricks、Hugging Face Blog、OpenAI News、GitHub Blog、Nature、Quanta 和 Hackaday。前两个因中文出版商身份继续禁用；“已在 registry”也不等于已经进入 production bundle。

### 2.3 可净新增的英语 RSS

以下 16 个 endpoint 是本次从实时 Source Hub 发现、当前 registry 没有、现场又确认能够返回 HTTP 200 且包含 RSS/Atom entry 的英语候选：

| 候选源 | Endpoint | 建议 |
| --- | --- | --- |
| BAIR Blog | `https://bair.berkeley.edu/blog/feed.xml` | 官方研究机构；SiC documents 候选 |
| MIT News - AI | `https://news.mit.edu/topic/mitartificial-intelligence2-rss.xml` | 官方大学新闻；资讯瀑布候选 |
| Stanford AI Lab Blog | `https://ai.stanford.edu/blog/feed.xml` | 官方研究实验室；SiC documents 候选 |
| GitHub Changelog | `https://github.blog/changelog/feed/` | 官方产品变更；资讯瀑布候选 |
| Ahead of AI | `https://magazine.sebastianraschka.com/feed` | 英语个人专业出版物；路边社或 SiC 候选 |
| Sebastian Raschka | `https://sebastianraschka.com/rss_feed.xml` | 英语个人技术博客；路边社或深度文章候选 |
| Chip Huyen | `https://huyenchip.com/feed.xml` | 英语个人技术博客；路边社或深度文章候选 |
| Jay Alammar | `https://jalammar.github.io/feed.xml` | 英语个人技术博客；路边社或深度文章候选 |
| Lilian Weng | `https://lilianweng.github.io/index.xml` | 英语个人研究博客；路边社或深度文章候选 |
| Interconnects | `https://www.interconnects.ai/feed` | 英语 AI 分析出版物；资讯瀑布候选 |
| Machine Learning Mastery | `https://machinelearningmastery.com/feed/` | 英语教程出版物；低优先级候选 |
| The Gradient | `https://thegradient.pub/rss/` | 英语 AI 出版物；资讯瀑布候选 |
| The Pragmatic Engineer | `https://newsletter.pragmaticengineer.com/feed` | 英语工程出版物；资讯瀑布候选 |
| The Economist | `https://www.economist.com/latest/rss.xml` | 英语媒体；资讯瀑布候选，需处理付费墙与展示权 |
| AI Weekly | `https://aiweekly.co/issues.rss` | 英语聚合 newsletter；资讯瀑布候选，按底层链接归因 |
| AINews (Buttondown) | `https://buttondown.com/ainews/rss` | 英语聚合 newsletter；迁移提示明显，只能试运行 |

其中 MIT News 和 GitHub Changelog 可作为资讯瀑布第一优先级；BAIR 与 Stanford SAIL 应进入 SiC documents。个人博客应按 Vault 当前分类规则进入路边社或 SiC，不能仅因 RSS 稳定就自动归入资讯。

另外现场确认 Product Hunt 和 Lobsters RSS 当前返回 200：

- Product Hunt 可作为产品发布的路边社候选；
- Lobsters 已有 `https://lobste.rs/hottest.json` 结构化连接器，无需重复加入 RSS。

实时目录中其余几个 endpoint 的处理：

- `https://openai.com/blog/rss.xml` 当前 307 跳转到已经 active 的 `https://openai.com/news/rss.xml`，不是 canonical 净新增；
- Last Week in AI 已在 production bundle；
- BBC Learning English 虽是英语 RSS，但不属于当前科技资讯范围；
- Anavem.com 和 navanem.com 的出版商身份、编辑责任和稳定性证据不足，保持 quarantine，不列入推荐清单。

### 2.4 不应重复加入资讯瀑布的官方研究 feed

Source Hub 还提供以下可用的英语官方 RSS：

- Google Research Blog；
- Microsoft Research；
- AWS Machine Learning Blog；
- NVIDIA Developer Blog。

现场均返回 200，但这些深度研究/工程出版物已经由项目的 SiC 边界覆盖。按照“同一来源不跨 information 和 documents 重复”的现有 policy，不应再次加入资讯瀑布。可以保留为 Source Hub 与 SiC registry 的一致性检查。

### 2.5 实时目录中的排除项

| 来源 | 原因 |
| --- | --- |
| V2EX | 中文社区身份；排除 |
| 阮一峰 | 中文个人信息源；排除 |
| IT之家 | 中文媒体；排除 |
| InfoQ 中文站 | 中文媒体；排除 |
| 量子位、新智元 | 中文媒体；排除 |
| `@zaihuapd` | 中文频道，且 Horizon 通过 HTML 抓取；排除 |
| Anthropic Research `/research/rss` | 当前 404；不要恢复 sitemap 抓取 |
| Microsoft AI Blog | 当前 410 |
| Ars Technica AI 目录 URL | 当前 404；需找到出版商当前正式 feed 后重新审查 |
| Google Blog `/feed/` | 返回 HTML，不是可用 RSS |
| The Batch `/the-batch/feed/` | 308 后 404 |
| GitHub Trending `mshibanern` | 域名拼写错误；排除该 endpoint |

## 3. 十类采集渠道的准入判断

| Horizon 渠道 | 实际传输方式 | 密钥 | 输出粒度 | Vault 判断 | 建议角色 |
| --- | --- | --- | --- | --- | --- |
| RSS / Atom | `feedparser` 读取配置中的 feed URL | 多数不需要；LWN 全文 feed 可带 key | 文章/帖子级 | **通过**，但禁止启用 `content_extractor` | 资讯瀑布 |
| GitHub repo releases | GitHub REST API `GET /repos/{owner}/{repo}/releases` | Token 可选，生产建议配置 | release 级原始记录 | **通过** | 资讯瀑布 |
| GitHub user events | GitHub REST API `GET /users/{user}/events/public` | Token 可选 | push/create/star/release 等活动 | **传输通过，但不是公开言论/文章** | identity discovery / pending |
| Hacker News | 官方 Firebase API `/topstories` + `/item/{id}` | 不需要 | HN 帖子级；代码还拼接评论 | **传输通过，模型需改造** | 路边社 |
| GDELT | GDELT 2.0 DOC JSON API | 不需要 | 原始出版商文章索引 | **有条件通过** | 资讯瀑布候选 |
| Google News | `news.google.com/rss/search` RSS | 不需要 | 聚合文章条目 | **有条件通过** | 资讯瀑布候选 |
| OpenBB | `obb.news.company()` SDK，实际由选定 provider 提供数据 | provider 相关 | 公司新闻文章 | **有条件通过** | 资讯瀑布候选 |
| OSS Insight | `api.ossinsight.io/v1/trends/repos` JSON API | 不需要 | GitHub 仓库趋势排名 | **通过，但为派生趋势** | 路边社 |
| Reddit | **优先抓取 Old Reddit HTML**，失败后再走无鉴权 JSON/RSS | 当前无密钥 | 帖子并拼接评论 | **当前实现拒绝** | 重写后可进路边社 |
| Telegram | 抓取 `telegram.me/s`、`telegram.dog/s`、`t.me/s` HTML | 不需要 | 频道消息 | **拒绝** | 不接入 |
| Twitter / X | Apify Scweet 抓取服务，或 Playwright + Cookie | Apify token 或用户 Cookie | tweet / reply | **拒绝** | 不接入 |

Horizon 自己的[采集器说明](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/docs/scrapers.md)、[配置指南](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/docs/configuration.md)、[适配器注册表](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/src/models.py)和[并发调度代码](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/src/orchestrator.py)共同确认了以上行为。

### 3.1 Hacker News

Horizon 使用的是 Hacker News 官方 Firebase API。官方项目说明 `/v0/topstories.json` 最多返回 500 个 top/new story ID，`/v0/item/{id}.json` 返回 story 和 comment，当前没有公开速率限制：[HackerNews/API](https://github.com/HackerNews/API)。

Vault 可以吸收：

- `topstories`、`newstories` 或 `beststories` 的官方 API；
- HN item ID、标题、用户、时间、得分、外链和 discussion URL；
- HN 作为技术社区的早期线索价值。

Vault 不应照搬：

- Horizon 把前 5 条评论直接拼到 `ContentItem.content`；
- 对外链帖子，`url` 指向外部文章，但作者仍是 HN 提交者，容易混淆“文章作者”和“提交者”；
- HN 排名是社区派生信号，不应作为独立原始出版商文章。

**决策：路边社启用候选。** 原始 HN 帖子和评论分别保存；外部文章只有通过自己的 RSS/API 进入资讯瀑布后，才可进入事件簿。

### 3.2 GitHub

Horizon 使用 GitHub 官方 REST API。GitHub 官方说明 Events API 支持 ETag 和 `X-Poll-Interval`，但事件最多保留最近 30 天，延迟可在 30 秒到 6 小时之间：[Events API](https://docs.github.com/en/rest/activity/events)。仓库 releases 也是正式 REST API。

Vault 应拆成两类：

- **仓库 release**：项目自身的正式发布记录，属于结构化原始信息，可进资讯瀑布。
- **用户 public events**：push、create、star 等行为不是公开言论或文章，只能用于 identity discovery / pending，不进入资讯瀑布、路边社或事件簿。

生产适配时应补上：

- `GITHUB_TOKEN`；
- API version header；
- ETag / `If-None-Match`；
- `X-Poll-Interval` 遵从；
- 分页和重叠时间窗口；
- repo/org allowlist；
- release 的 stable ID、tag、prerelease 和原始 body。

### 3.3 GDELT

Horizon 调用正式的 [GDELT 2.0 DOC API](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/)：

```text
https://api.gdeltproject.org/api/v2/doc/doc
```

它返回文章标题、原文 URL、域名、来源国家、语言和发现时间；Horizon 不获取正文。它是第三方聚合/搜索 API，而不是出版商。

准入条件：

1. `mode=ArtList`，只接收文章级记录；
2. 查询中加入 `sourcelang:english` 可减少噪声，但不能代替出版商身份白名单；
3. 从 `url` 提取原始域名，按 Vault 的英语/国际出版商登记表准入；
4. GDELT 的 `domain` 只能作为上游提示，不能自动成为 canonical publisher；
5. 使用重叠时间窗口和 URL 幂等去重；
6. 未识别域名、短链和聚合页进入隔离区；
7. GDELT 不能被计为一个独立媒体来源，事件簿的来源数量按底层出版商计算。

**决策：资讯瀑布的条件候选。**

### 3.4 Google News RSS

Horizon 使用：

```text
https://news.google.com/rss/search
```

并通过 `q`、`hl`、`gl`、`ceid` 和 `when:` / `after:` 构造查询。它是 RSS 聚合搜索，不需要 API key。

主要风险：

- Google 没有为这个端点提供面向开发者的正式 SLA 或版本契约；
- feed 中的 URL 通常是 Google News 链接，不一定是最终 canonical publisher URL；
- `hl=en&gl=US` 只控制结果区域/界面语言，不能证明底层出版商属于英语信息源；
- Horizon 仅保存 `entry.source.title`，没有建立可信的出版商域名映射；
- 最大约 100 条且无正式 cursor，不能承担完整回溯。

**决策：隔离候选，不作为核心源。** 只有在不抓取详情页的前提下能够从 RSS 本身稳定取得或解析原始出版商 URL，且出版商通过 allowlist 时，才可进入资讯瀑布；否则只用于发现候选主题。

### 3.5 OpenBB

Horizon 通过 `obb.news.company()` 按股票 watchlist 拉取公司新闻。OpenBB 官方当前为 `news.company` 列出的 provider 包括 Benzinga、FMP、Intrinio、Tiingo、TMX 和 yfinance，并统一返回日期、标题、作者、摘要/正文和 URL：[OpenBB company news](https://docs.openbb.co/odp/python/reference/news/company)。

需要逐 provider 判断，不能把“OpenBB”视为单一出版商：

| Provider | 性质 | Vault 建议 |
| --- | --- | --- |
| Benzinga | 有明确 provider API/扩展，通常需付费凭证 | 资讯瀑布候选，需核验公开展示权 |
| FMP | 第三方金融数据 API | 资讯瀑布候选，需核验许可和原始 URL |
| Intrinio | 第三方金融数据 API | 资讯瀑布候选，需核验许可和原始 URL |
| Tiingo | 第三方金融数据 API | 资讯瀑布候选，需核验许可和原始 URL |
| TMX | 交易所/市场数据 provider | 候选，需核验 endpoint 和使用权 |
| yfinance | 非 Yahoo 官方 API 的社区连接器 | 不建议生产；稳定性和条款风险较高 |

Horizon 的本地配置只预装 `openbb` 和 `openbb-benzinga`，默认示例却使用 `yfinance`。这说明“代码能填 provider 名”不等于对应 connector 已安装或获得授权。OpenBB 官方 provider 页面也明确说明第三方扩展的数据可用性随 provider 和订阅而变化：[Providers](https://docs.openbb.co/odp/python/extensions/providers)。

另外，Horizon 模型中虽然存在 `fetch_filings` 和 `filings_provider=sec`，当前 `OpenBBScraper` 实际只调用 `news.company()`，没有实现 filings 拉取。因此不能把 SEC filings 算作 Horizon 已提供的信息源。

**决策：按 provider 单独准入；优先有正式 API 和明确许可的 provider，排除 yfinance。**

### 3.6 OSS Insight

Horizon 调用：

```text
https://api.ossinsight.io/v1/trends/repos
```

OSS Insight 是基于 GitHub event 数据生成的开源趋势和排名系统：[官方仓库](https://github.com/pingcap/ossinsight)。它返回 repo、描述、star 增量、语言和集合标签，Horizon 把抓取时间当作 `published_at`。

这不是文章，也不是项目官方发布内容，而是第三方计算出的趋势指标。项目文档还承认 `past_7_days` 上游当前损坏。

**决策：路边社候选。** 可用于发现突然升温的仓库；不要进入资讯瀑布，不要直接形成事件。

### 3.7 Reddit

Horizon 的当前顺序是：

```text
old.reddit.com HTML
→ 无鉴权 .json
→ subreddit RSS fallback
```

评论同样优先解析 Old Reddit HTML。该实现明确使用 BeautifulSoup 和浏览器式请求头；因此即使后面有 JSON/RSS fallback，整个适配器仍不符合 Vault 原则。Reddit 官方开发资料也表明正式 API 访问围绕授权 API/Devvit，而旧的公共 JSON 访问不能视为稳定生产契约：[Reddit API Overview](https://developers.reddit.com/docs/capabilities/server/reddit-api)。

可保留的仅是来源目标名单。后续若有稳定、合规的官方 OAuth API，或经长期验证的 RSS-only 模式，可单独重写：

- 禁止 HTML fallback；
- 禁止抓取详情页和评论 DOM；
- Reddit 帖子、评论、得分必须分别存储；
- 全部进入路边社；
- 帖子外链若需进入资讯瀑布，必须由对应出版商 RSS/API 单独拉取。

### 3.8 Telegram

Horizon 访问 `telegram.me/s`、`telegram.dog/s` 和 `t.me/s` 的公共频道网页并解析 DOM。它没有使用 Telegram Bot API 或 MTProto API。Telegram 官方确实提供 HTTP Bot API，但 Horizon 当前没有使用：[Telegram Bot API](https://core.telegram.org/bots/api)。

**决策：当前适配器拒绝。** 即使未来改为官方 API，也需按频道身份单独准入；示例频道 `@zaihuapd` 是中文科技频道，仍因“中文信息源”规则被排除。

### 3.9 Twitter / X

Horizon 有两种模式：

- Apify REST API 调用 `altimis~scweet` actor；
- Playwright + Cookie 登录并访问 X 页面。

Apify API 只是对抓取任务的控制接口，底层仍是第三方 X/Twitter 网页抓取；Scweet actor 自身也被描述为 Twitter/X scraper：[Apify actor](https://apify.com/altimis/scweet)。Playwright 模式更是明确的无头浏览器采集。

**决策：全部拒绝。** `@karpathy` 和 `@ylecun` 这两个目标账号可以保留在候选观察清单，但只有未来使用 X 官方 API 时才考虑加入路边社。

### 3.10 RSS 全文抽取和网页 enrichment

Horizon 的 RSS 正常模式只读取 feed，符合规则；但可选的 `content_extractor=trafilatura` 会访问文章 URL、下载 HTML 并抽取正文。[Extractor 文档](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/docs/extractors.md)明确说明了这一点。

`src/ai/enricher.py` 还使用 DDGS 搜索网页来补充背景。两者都不能进入 Vault 的生产信息管线。

固定边界：

```text
RSS/Atom feed 自带的 title/link/author/date/summary/content：允许
订阅源自带的 publisher-authorized full content：允许
访问 entry.link 抓文章 HTML：禁止
Trafilatura/Readability/DOM 正文抽取：禁止
DDGS/网页搜索补背景：禁止
```

## 4. Horizon 本地 30 条预置信源逐项筛选

预置库见固定提交下的 [`data/presets.json`](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/data/presets.json)。共 30 条：

- 12 条 RSS；
- 12 个 subreddit；
- 2 个 GitHub 用户；
- 4 个 GitHub 仓库。

### 4.1 RSS / Atom：12 条

| 预置源 | Feed | 出版商属性 | 准入 | 角色 |
| --- | --- | --- | --- | --- |
| Simon Willison | [Atom](https://simonwillison.net/atom/everything/) | 英语独立技术作者 | **候选通过** | 路边社 |
| LWN.net | [RSS](https://lwn.net/headlines/rss) | 英语 Linux 专业媒体 | **候选通过** | 资讯瀑布 |
| Brendan Gregg | [RSS](https://www.brendangregg.com/blog/rss.xml) | 英语系统性能专家博客 | **候选通过** | 路边社或 SiC |
| Krebs on Security | [RSS](https://krebsonsecurity.com/feed/) | 英语安全调查媒体 | **候选通过** | 资讯瀑布 |
| Schneier on Security | [Atom](https://www.schneier.com/feed/atom/) | 英语安全分析博客 | **候选通过** | 路边社 |
| CSS-Tricks | [RSS](https://css-tricks.com/feed/) | 英语前端出版物 | **候选通过**，需实测 403/限流 | 资讯瀑布 |
| Hackaday | [RSS](https://hackaday.com/feed/) | 英语硬件媒体 | **候选通过** | 资讯瀑布 |
| Nature | [RSS](https://www.nature.com/nature.rss) | 国际英语科学期刊 | **候选通过**，需实测访问和授权边界 | SiC documents |
| Quanta Magazine | [RSS](https://api.quantamagazine.org/feed/) | 英语科学媒体 | **候选通过** | 资讯瀑布 |
| GitHub Trending RSS | [第三方 RSS](https://mshibanami.github.io/GitHubTrendingRSS/daily/all.xml) | 非官方 GitHub Trending 聚合器 | **观察候选** | 路边社 |
| 量子位 | `wechat2rss.xlab.app` 第三方 RSS | 中文 AI 媒体 | **拒绝** | 无 |
| 新智元 | `wechat2rss.xlab.app` 第三方 RSS | 中文 AI 媒体 | **拒绝** | 无 |

说明：

- 前 9 条是本地 preset 中最值得保留的合格传输端点，但它们已进入当前 registry，且应按“媒体资讯 / 个人路边社 / 深研 SiC”分别路由，不属于 endpoint 净新增。
- GitHub Trending RSS 本身是规范 RSS，但它是第三方生成的非官方趋势榜。其项目被描述为 “Unofficial RSS feed generator for GitHub Trending”，因此最多进入路边社；已有 OSS Insight API 时，优先使用 OSS Insight。
- 量子位和新智元即使通过 RSS 传输，也因出版商身份是中文媒体而排除；传输语言或作者个体不改变来源身份。
- LWN 的另一个 `headlines/full_text?key=...` feed 需要 `LWN_KEY`。若使用，必须确认订阅条款是否允许服务器缓存和公开展示全文；否则只用公开 headlines RSS。

### 4.2 GitHub 仓库 releases：4 条

| 仓库 | 内容 | 准入 | 角色 |
| --- | --- | --- | --- |
| `vllm-project/vllm` | vLLM release notes | **通过** | 资讯瀑布 |
| `rust-lang/rust` | Rust release notes | **通过** | 资讯瀑布 |
| `ziglang/zig` | Zig release notes | **通过** | 资讯瀑布 |
| `neovim/neovim` | Neovim release notes | **通过** | 资讯瀑布 |

这些记录是项目维护者通过 GitHub Releases 发布的原始信息。出版商身份应登记为具体项目/组织，而不是笼统的 `github.com`。

配置和文档中另有两个值得保留的示例：

- `astral-sh/uv` releases；
- `python/cpython` releases。

二者没有进入本地预置库，但同样符合官方 API + 原始 release 的准入逻辑，可列为候选。

### 4.3 GitHub 用户活动：2 条

| 用户 | 预置关注点 | 准入 | 角色 |
| --- | --- | --- | --- |
| `karpathy` | AI 教育、研究和开源活动 | 传输通过 | identity discovery / pending |
| `torvalds` | Linux 开发活动 | 传输通过 | identity discovery / pending |

文档还用 `gvanrossum` 作为例子。GitHub user events 会混合 push、创建、release、公开仓库和 star 行为，不能等同于用户的正式公告，也不属于“published speech”。这些记录只用于发现身份或仓库，不进入任何公开内容流。

### 4.4 Reddit 社区：12 个

Horizon 预置了：

```text
r/MachineLearning
r/LocalLLaMA
r/linux
r/netsec
r/webdev
r/javascript
r/ProgrammingLanguages
r/rust
r/robotics
r/embedded
r/commandline
r/science
```

这些社区的来源身份属于英语/国际社区，没有触发中文源排除规则；但 Horizon 当前 HTML-first 的采集方式不合格。

**统一决策：暂不接入；未来只有重写为稳定 API/RSS-only 后才作为路边社候选。**

配置示例中的 Reddit 用户 `iamthatis` 也只应视为示例，不应未经单独人物准入就加入生产。

## 5. 配置和文档中的其他来源目标

| 目标 | 出现位置 | 当前判断 |
| --- | --- | --- |
| Hacker News top stories | 默认配置 | 官方 API；路边社候选 |
| `@karpathy`、`@ylecun` on X | 配置/文档示例 | 账号可观察，但 Horizon 传输实现拒绝 |
| Telegram `@zaihuapd` | 配置文档示例 | 中文频道 + HTML 抓取，双重拒绝 |
| OpenBB megacaps：AAPL、MSFT、NVDA、GOOGL、AMZN、META、TSLA | 示例 watchlist | 股票名单可复用；需更换为合格 provider |
| GDELT query `artificial intelligence` | 示例配置 | 查询只作示例；应改为 Vault 主题词，并执行 publisher allowlist |
| Google News query `artificial intelligence`, `en-US` | 示例配置 | 只能作为隔离候选，不因 `en-US` 自动准入 |
| Reddit 用户 `iamthatis` | 示例配置 | 未完成身份准入；不直接采用 |

AI 模型提供商、SMTP/IMAP、Feishu/Lark、DingTalk、Slack、Discord、webhook 和 MCP 属于处理或交付渠道，不是信息源，不纳入信源清单。

## 6. 对 Vault 信息瀑布与事件簿边界的影响

Horizon 的统一 `ContentItem` 同时放置原始字段和 AI 派生字段：

```text
id / source_type / title / url / content / author / published_at
+ ai_score / ai_reason / ai_summary / ai_tags
```

这个模型适合日报摘要，但不适合 Vault 的证据链。Vault 应拆为：

```text
RawSourceItem
  原始标题、URL、作者、发布时间、feed/API payload、publisher、transport

SourceEnrichment
  AI 分数、标签、实体、摘要、翻译、情绪

Event
  只引用已准入 RawSourceItem 的 ID 集合
```

具体规则：

1. 资讯瀑布保留每篇文章/每个 release，不做破坏性跨源合并。
2. 原始 payload 和派生分析分表或至少分命名空间。
3. HN/Reddit 评论不能拼入文章正文。
4. GDELT、Google News、OpenBB、Akta 等聚合器只是 `transport_provider`。
5. `canonical_publisher` 必须来自底层出版商登记表。
6. 事件簿的“独立来源数”按底层出版商域名计算。
7. OSS Insight 趋势和 HN/Reddit 社区讨论只能提供事件候选信号，不能直接生成事件；GitHub 用户事件连路边社也不进入，只用于 identity discovery。
8. 任何上游的 AI summary、趋势排名或聚类都不是原始事实。

## 7. 四层信源清单

### A. 已在 Vault 覆盖

当前 production bundle 已经包含 Horizon 直接贡献的 11 个 active source：

- 资讯瀑布：`astral-sh/uv`、`neovim/neovim`、`rust-lang/rust`、`sgl-project/sglang`、`triton-lang/triton`、`vllm-project/vllm`、`ziglang/zig` releases；
- 路边社：Hacker News、Simon Willison；
- 路边社中的人物 RSS bridge：Andrej Karpathy、Yann LeCun。

当前 bundle 还已通过其他 provenance 覆盖 Latent Space、Last Week in AI 和 OpenAI News。Lobsters 已使用结构化 JSON connector，无需采用 Source Hub 的 RSS 版本。

registry 已登记但尚未 active 的 Horizon RSS 包括：LWN、Brendan Gregg、Schneier、Krebs、CSS-Tricks、Hugging Face Blog、GitHub Blog、Nature、Quanta 和 Hackaday。这些不是 endpoint 净新增；是否激活应继续按角色、质量和展示授权审核。

特别说明：

- Simon Willison、Brendan Gregg、Schneier 等个人/作者博客属于路边社或 SiC，不因 RSS 合格就进入资讯瀑布。
- GitHub 用户 activity 不是公开言论或文章。`karpathy`、`torvalds`、`gvanrossum` 的 Events API 只能做 identity discovery；人物公开内容应继续依赖获准的 RSS/API 发布源。

### B. 净新增建议

#### 资讯瀑布

这些 endpoint 不在当前 registry，且已现场确认返回有效 RSS/Atom：

1. MIT News - AI；
2. GitHub Changelog；
3. Interconnects；
4. The Gradient；
5. The Pragmatic Engineer；
6. The Economist。

进入生产前仍需 7–14 天稳定性、条目粒度、付费墙、摘要展示权和 canonical URL 验证。

#### 路边社

这些英语个人/作者 feed 已现场可用：

1. Ahead of AI；
2. Sebastian Raschka personal feed；
3. Chip Huyen；
4. Jay Alammar；
5. Lilian Weng。

如单篇内容属于完整深度研究，可由分类流程路由到 SiC；源身份本身仍按个人/作者处理。

#### SiC documents

1. BAIR Blog；
2. Stanford AI Lab Blog。

Google Research、Microsoft Research、AWS Machine Learning Blog 和 NVIDIA Developer Blog 的 feed 也现场可用，但已经属于当前 SiC 覆盖范围，不应重复进入资讯瀑布。

#### 新增 GitHub Releases 候选

- `python/cpython` releases：Horizon 文档示例，适合资讯瀑布；
- live API 中的 `rapidly-tech/rapidly`：需先确认是否有稳定 release 记录；
- live API 中 `AIHUb` 的 repo 配置格式错误，不能按现值接入。

### C. 条件候选

| 候选 | 条件与角色 |
| --- | --- |
| GDELT DOC API | 资讯瀑布 transport；底层 publisher allowlist、文章级记录、重叠窗口 |
| Google News RSS search | 仅当无需网页抓取即可取得可信 canonical publisher URL |
| OpenBB | 逐个准入 Benzinga/FMP/Intrinio/Tiingo/TMX；检查许可和原始 URL |
| Product Hunt RSS | 当前 200；产品发布路边社候选 |
| OSS Insight | 路边社趋势信号；不能直接形成事件 |
| GitHub Trending RSS | 只用正确的 `mshibanami` endpoint；低优先级路边社，对照 OSS Insight |
| Reddit 英语社区 | 必须重写为正式 API 或严格 RSS-only，禁用 HTML 和评论页补抓 |
| X 人物账号 | 必须改用正式 X API；Horizon 当前实现不可用 |
| AI Weekly | 英语聚合 newsletter；需按底层链接归因 |
| AINews (Buttondown) | 当前 feed 可用但描述提示已迁移；仅隔离试跑 |
| Machine Learning Mastery | feed 可用但偏教程；低优先级 SiC/路边社候选 |
| LWN subscriber full-text | 需要 `LWN_KEY` 和明确的缓存/公开展示授权 |

### D. 拒绝

1. 量子位、新智元；
2. V2EX、阮一峰、IT之家、InfoQ 中文站；
3. Telegram `@zaihuapd`；
4. Horizon Telegram HTML scraper；
5. Horizon Reddit HTML-first scraper；
6. Apify Scweet；
7. Twitter Playwright + Cookie；
8. Trafilatura 文章网页全文抽取；
9. DDGS 网页搜索 enrichment；
10. yfinance 作为生产新闻 provider；
11. Anthropic Research `/research/rss`（404）；
12. Microsoft AI Blog feed（410）；
13. Ars Technica AI 当前目录 URL（404）；
14. Google Blog `/feed/`（返回 HTML）；
15. The Batch `/the-batch/feed/`（308 后 404）；
16. 拼错的 GitHub Trending `mshibanern` endpoint；
17. live API 中格式错误的 `AIHUb` GitHub repo 配置。

## 8. 密钥和部署要求

| 来源 | 凭证 |
| --- | --- |
| 普通 RSS/Atom | 通常无 |
| LWN subscriber full-text | `LWN_KEY` |
| Hacker News API | 无 |
| GitHub API | `GITHUB_TOKEN` 可选；生产强烈建议 |
| GDELT | 无 |
| Google News RSS | 无 |
| OSS Insight | 无 |
| OpenBB | 按 provider 配置；Benzinga/FMP/Intrinio/Tiingo 等通常需要各自凭证 |
| Reddit 合规重写 | 取决于 Reddit 官方 API 授权方式 |
| X 官方 API 重写 | X API 凭证 |

密钥只应存在于服务端 secret manager 或部署环境，不进入浏览器、日志、生成页面和仓库配置。

## 9. 上线前验收门槛

每个候选源至少检查：

- 7–14 天请求成功率；
- feed/API 最近发布时间与本地抓取时间差；
- `title`、`url`、`published_at`、publisher 的非空率；
- GUID/API ID 和 canonical URL 的稳定性；
- 条目更新、删除、撤稿和重复的行为；
- ETag、Last-Modified、cursor 或可替代的重叠窗口；
- 429、5xx、超时、格式错误和 schema drift；
- 英语/国际出版商 allowlist 命中率；
- 公开展示标题、摘要、作者和链接的许可；
- 禁止任何故障后降级到网页抓取。

对于聚合器，还需额外验收：

- 原始出版商是否可恢复；
- 聚合 URL 是否能在不抓网页的情况下得到 canonical URL；
- 是否混入中文出版商；
- 是否提供文章级记录而不是事件级代表项；
- 是否会把一个 transport provider 错算成多个独立来源；
- 是否存在合法的公开展示和历史保存权。

## 10. 最终决策

| 问题 | 回答 |
| --- | --- |
| Horizon 能否作为 Vault 的整套信源管线直接部署？ | **不能** |
| 是否有值得直接吸收的信息源？ | **有；本地 preset、实时 52 个 RSS 和 GitHub Releases 中均有增量，详见“四层信源清单”** |
| 是否有值得吸收的第三方聚合源？ | **有：GDELT、Google News RSS、OpenBB，均需条件准入** |
| 是否有适合路边社的来源？ | **有：HN、英语个人/作者 RSS、OSS Insight、Product Hunt 和 GitHub Trending RSS；GitHub 用户 activity 不进入路边社** |
| 是否可采用 Horizon 的 Reddit/Telegram/X 适配器？ | **不可；包含 HTML、抓取服务或 Playwright** |
| 是否可采用它的全文抽取和网页 enrichment？ | **不可** |
| 中文信源是否已排除？ | **是：量子位、新智元、V2EX、阮一峰、IT之家、InfoQ 中文站和 `@zaihuapd` 明确排除** |
| 是否允许英语来源中的中文作者/中文单篇内容？ | **允许；准入按出版商/频道身份判断，不按作者姓名或单条语言机械排除** |

一句话概括：**Horizon 最有价值的不是它的“全能采集器”，而是它暴露出的一组可机器读取的来源候选；Vault 应吸收其中的原生 RSS 和官方 API 目标，同时彻底切断所有 HTML、浏览器和文章详情页补抓路径，并把资讯瀑布的原始文章与事件簿的综合结果严格分层。**
