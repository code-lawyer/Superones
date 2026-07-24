# Vault2077 境外采集器采用决策

> 状态：非规范性技术调研，供后续 ADR 与实施计划确认
> 调研日期：2026-07-22
> 证据范围：仅使用六个候选项目的官方 GitHub README、配置、工作流和采集代码
> 目标：回答“继续自行连接全部信源，还是直接采用现有开源收集器”

## 1. 结论

Vault2077 不应继续把当前自写采集器扩展成另一套通用资讯框架。当前实现适合验证签名传输和境内接收契约，不足以证明数百信源的真实采集质量。

建议采用以下组合：

1. **以 Horizon 的 fetch/scraper 层作为境外主采集底座。**固定上游 commit，直接采用其 `BaseScraper`、统一 `ContentItem`、共享异步 HTTP client，以及 RSS、Hacker News、GitHub 等已有 adapter。境外增加一个 Vault2077 `raw-export` 出口，将抓取后的原始记录映射为 Vault 批次并发送境内。
2. **不运行 Horizon 的完整成品管线。**关闭或绕开 AI 评分、主题去重、网页研究、双语摘要、日报、邮件、MCP 与 GitHub Pages；这些职责与 Vault2077 的“境外只采集，境内处理”边界冲突。
3. **把 Follow Builders 与 BestBlogs 的公开 Feed/API 当作补充聚合输入，而不是主采集运行时。**它们可以低成本补充 X、博客和策展内容，但必须保留每条内容的原始 URL、作者、原文和发现路径；不能只消费已经失去出处的摘要。
4. **TrendRadar、CloudFlare-AI-Insight-Daily 和 Glance 不作为 Vault2077 的采集运行时。**它们分别更接近热榜监控、耦合第三方聚合与 AI 的日报流水线、按页面请求抓取的展示仪表盘。可借鉴配置或来源线索，但直接部署会引入错误的数据模型或多余职责。

因此这不是“全部自己写”与“整套照搬”之间的二选一。正确边界是：

```tex
Horizon 成熟采集层
  + Vault2077 来源准入、批次契约、HMAC 发送
  + Follow Builders / BestBlogs 等补充聚合输入
  - 境外 AI、日报、通知、网页展示
```

## 2. 为什么主底座选择 Horizon

Horizon 是六个项目中唯一同时具备以下条件的候选：

- 所有 scraper 继承统一 `BaseScraper`，共享异步 HTTP client，并实现 `fetch(since) -> list[ContentItem]`；来源由 `asyncio.gather` 并发获取。[Horizon scraper 文档](https://github.com/Thysrael/Horizon/blob/main/docs/scrapers.md)
- 已有 RSS/Atom、Hacker News、GitHub、Reddit、Telegram、X 和 OpenBB adapter；其中 RSS 使用 `feedparser`，HN 使用官方 Firebase API，GitHub 使用官方 REST API。[Horizon scraper 文档](https://github.com/Thysrael/Horizon/blob/main/docs/scrapers.md)
- README 明确提供可运行的 GitHub Actions 定时工作流，说明其依赖和运行形态已经在临时 runner 场景中被项目自身采用。[Horizon README](https://github.com/Thysrael/Horizon#4-automate-optional)、[官方工作流](https://github.com/Thysrael/Horizon/blob/main/.github/workflows/daily-summary.yml)
- RSS、HN、GitHub adapter 不需要浏览器。Reddit 会请求 HTML/JSON/RSS 并使用浏览器式请求头，但不启动浏览器；X 通过 Apify REST API 运行远程 actor，也不要求 GitHub Actions runner 启动浏览器。[Horizon scraper 文档](https://github.com/Thysrael/Horizon/blob/main/docs/scrapers.md)
- 项目为 MIT 许可证，允许在保留许可证声明的前提下选择性采用代码。[Horizon LICENSE](https://github.com/Thysrael/Horizon/blob/main/LICENSE)

Horizon 当前的问题不在采集层，而在完整产品边界过宽。它在抓取后继续做 AI 评分、跨平台去重、网页研究、评论摘要、双语日报和多渠道发布。[Horizon README](https://github.com/Thysrael/Horizon#how-it-works) Vault2077 若直接运行完整 Horizon，会在境外提前筛掉或改写资讯证据，并重复建设境内已经承担的处理能力。

### 直接采用的准确含义

“直接采用 Horizon fetch 层”不是把 Horizon 的最终日报作为 Vault 输入，也不是长期跟随其 `main` 分支：

- 固定一个已审核 commit；
- vendor 或维护一个窄 fork，只保留 `models`、`scrapers`、HTTP client 及必要配置加载；
- 保持 `fetch(since)` 和 `ContentItem` 作为上游接口；
- 新增 `RawInformation` 映射与 Vault 批次发送器；
- 禁用 article extractor，除非某个来源单独批准；
- 默认启用 RSS、HN、GitHub；Reddit、X、Telegram 按凭证与稳定性逐项开启；
- 上游升级只通过 adapter contract tests 后合入。

这比继续维护当前“一种 URL/connector 加一段分支”的实现更稳，也比 fork 整个 Horizon 产品更轻。

## 3. 六个候选项目逐项核对

| 项目 | 实际定位 | 输入与采集方式 | 浏览器依赖 | GitHub Actions | 原始资讯输出 | 自定义海外信源成本 | Vault2077 处理 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Horizon** | 通用采集 + AI 处理 + 日报发布流水线 | RSS/Atom、HN Firebase API、GitHub REST、Reddit HTML/JSON/RSS、Telegram、X/Apify、OpenBB | 本地无需浏览器；部分 adapter 依赖 HTML 或远程 Apify | 官方提供完整 workflow | `ContentItem` 位于 AI 处理之前，可增加 raw exporter | 同类协议只改配置；新协议实现 `BaseScraper`，成本中等 | **直接采用采集层；不采用完整成品管线** |
| **TrendRadar** | 热榜追踪、关键词筛选与通知系统；RSS 是平行通道 | NewsNow `/api/s?id=...&latest` 热榜代理；另有 RSS/Atom/JSON Feed | 无浏览器 | 官方支持 Actions/Docker | 热榜主要是标题、链接、榜位和出现次数，不是完整原始资讯正文 | RSS 较低；新增热榜平台受 NewsNow platform ID 约束 | 不作运行时；仅参考来源配置、失败隔离和域名校验思想 |
| **Follow Builders** | 面向 AI 人物的中央 Feed + Agent 摘要工作流 | X 官方 API v2；播客 RSS + pod2txt；博客 HTTP HTML 抓取；还含 YouTube Atom/页面解析 | 无本地浏览器，但博客/YouTube 含脆弱 HTML 解析 | 官方每日 workflow 写回三个 JSON Feed | `feed-x.json`、`feed-blogs.json` 等保留原文/原链；可直接 HTTP 获取 | 新增 X 账号低；博客实现针对少数站点，新增网站常需代码 | 公开 Feed 作补充聚合输入；可参考 X 官方 API 请求与状态去重 |
| **BestBlogs** | AI + 编辑策展产品、阅读 API 与来源目录 | 产品宣称支持 RSS、Newsletter、Twitter、YouTube、Podcast；仓库公开 OPML、RSS 输出、OpenAPI/CLI，未公开完整后端采集器 | 消费 RSS/OpenAPI 无浏览器 | 不适用：采集后端由 BestBlogs 服务运行 | 公共 RSS/OpenAPI 主要是其策展和处理后结果；原始源目录可用 | 使用其 Feed/API 低；无法基于本仓库直接扩展其未公开采集后端 | RSS/OpenAPI 作二级聚合输入；OPML 只作来源发现，不作运行时 |
| **CloudFlare-AI-Insight-Daily** | Cloudflare Worker 上的聚合、翻译、日报与 GitHub Pages 发布；README 已说明后端迁移到 PrismFlowAgent | 新闻/论文/X/Reddit 主要通过 Folo list ID、Cookie 与 `/entries`；GitHub Trending 经独立代理；随后调用 LLM | 无浏览器 | 仓库 Actions 主要构建日报站点，不是轻量采集 CLI | adapter 内有统一对象，但正常流程直接进入翻译与日报，没有独立原始批次出口 | 新增 Folo list 较低，但依赖 Cookie、私有 list ID 与第三方接口；新类型需改代码 | 不作运行时；不依赖其 Folo Cookie/聚合出口 |
| **Glance** | 自托管展示仪表盘 | RSS、HN、Lobsters、Reddit、releases、custom API 等 widget 在页面加载时抓取并缓存 | 无浏览器 | 不适用：设计为常驻 Go 服务/Docker | 数据进入 widget 内存模型后直接渲染，没有批次持久化或通用 raw export | 新增 RSS 配置低；新 widget 需 Go 代码 | 不作运行时；仅借鉴 RSS/HN/Reddit/release 的协议实现和配置设计 |

### 3.1 TrendRadar

TrendRadar 的主要数据模型是“标题在热榜中的排名、出现次数和时间线”，并非 Vault 所需的“原始资讯正文及来源证据”。热榜配置依赖 NewsNow 的 platform ID；RSS 虽然可以配置，但与热榜是两条独立通道。[TrendRadar 配置](https://github.com/sansan0/TrendRadar/blob/master/config/config.yaml)、[TrendRadar RSS fetcher](https://github.com/sansan0/TrendRadar/blob/master/trendradar/crawler/rss/fetcher.py)

它适合回答“今天哪些标题在榜上”，不适合作为数百个海外发布者的统一原始采集层。项目使用 GPL-3.0；Vault 不应为了少量通用 HTTP/RSS 能力把其代码引入运行时。[TrendRadar LICENSE](https://github.com/sansan0/TrendRadar/blob/master/LICENSE)

### 3.2 Follow Builders

Follow Builders 的中央生成器已经证明 GitHub Actions 可执行：官方 workflow 在 Node 20 上每日运行，将 `feed-x.json`、`feed-podcasts.json`、`feed-blogs.json` 和去重状态写回仓库。[generate-feed workflow](https://github.com/zarazhangrui/follow-builders/blob/main/.github/workflows/generate-feed.yml)

采集代码的真实边界是：

- X 使用官方 API v2、Bearer Token、按账号拉取最近推文，并保留长推文正文和互动数据；
- 播客先读取 RSS，再调用 pod2txt 取得 transcript；
- 博客使用直接 HTTP 和站点特定 HTML 规则；
- YouTube 同时使用 Atom Feed 与 HTML 页面回退解析。

证据见 [generate-feed.js](https://github.com/zarazhangrui/follow-builders/blob/main/scripts/generate-feed.js) 与 [default-sources.json](https://github.com/zarazhangrui/follow-builders/blob/main/config/default-sources.json)。

Vault2077 已排除 YouTube，因此不应运行该项目的完整默认任务。但可直接把其公开 X/博客 Feed 作为一个“聚合发现路径”；若未来自行持有 X API 凭证，可参考其 X adapter，而无需自创 X 抓取协议。

### 3.3 BestBlogs

BestBlogs 仓库公开了数百来源的 OPML、公共 RSS 输出、OpenAPI 文档和 CLI，但没有公开其宣称支持的完整采集后端。README 还明确说明公共质量池包含 AI 初评和编辑精审，因此 BestBlogs 输出属于“已加工的策展输入”，不是原始网络镜像。[BestBlogs README](https://github.com/ginobefun/BestBlogs#2-%E6%98%AF%E4%BB%80%E4%B9%88)

它最适合两种用途：

- 从其 OPML 中发现值得单独接入的海外原始 RSS；
- 将 BestBlogs 公共 RSS/OpenAPI 作为一个二级聚合来源，同时保留文章原链。

不能根据这个仓库直接复用一套不存在于开源代码中的采集器。[BestBlogs RSS 与 OPML](https://github.com/ginobefun/BestBlogs#6-rss-%E8%AE%A2%E9%98%85)、[BestBlogs OpenAPI](https://github.com/ginobefun/BestBlogs#7-%E5%BC%80%E6%94%BE-apiv2)

### 3.4 CloudFlare-AI-Insight-Daily

这个项目虽然有 `fetch()` / `transform()` 形式的 adapter，但新闻、论文、X 和 Reddit 主要从 Folo 的 `/entries` 接口读取，需要 list ID、Cookie 和模拟 Web 客户端请求头；GitHub Trending 又依赖单独代理。配置随后继续引入 Gemini/OpenAI、KV、GitHub 仓库和日报发布。[dataFetchers.js](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily/blob/main/src/dataFetchers.js)、[newsAggregator.js](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily/blob/main/src/dataSources/newsAggregator.js)、[twitter.js](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily/blob/main/src/dataSources/twitter.js)、[wrangler.toml](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily/blob/main/wrangler.toml)

这套实现能生成日报，但不能作为 Vault 的稳定、可审计、无状态原始采集层。README 还说明后端已经迁移至另一个项目，继续采用旧仓库会承担额外迁移风险。[项目 README](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily)

### 3.5 Glance

Glance 是一个轻量自托管 dashboard。其 widget 支持 RSS、HN、Reddit、GitHub/GitLab/Codeberg/Docker releases 和 custom API，但 README 明确说明数据在页面请求时获取并按 widget cache 缓存；它不是定时批量采集和导出系统。[Glance README](https://github.com/glanceapp/glance)、[Glance configuration](https://github.com/glanceapp/glance/blob/main/docs/configuration.md)

如果把 Glance 直接部署到 Actions，需要额外改造成一次性任务、建立统一输出模型、持久化和失败报告，改造成本接近重新写 orchestrator。可参考其 Go adapter 对协议细节的处理，但无需采用整个展示应用。

## 4. 两类“直接使用”必须区分

### 4.1 直接使用开源项目的采集代码

适用于 Horizon。Vault 掌握运行时、凭证、调度和原始输出，能逐 adapter 测试并固定版本。这是主路线。

### 4.2 直接消费项目公开的成品 Feed/API

适用于 Follow Builders、BestBlogs，也可以用于未来其他明确保留原链的聚合服务。优点是接入快、无需维护上游协议；缺点是：

- 上游可能停更、限流或修改格式；
- 上游已经筛选过内容，无法证明覆盖率；
- 同一内容可能经多个聚合器重复出现；
- 若没有原始 URL、作者、发布时间和原文，不能成为事件证据。

因此聚合输出只能是 `discovery_path`，不能替代 `canonical_url` 与原始来源身份。

## 5. 实施建议

### 阶段一：用真实 Horizon fetch 层替换当前采集实现

1. 固定 Horizon 审核 commit 与 MIT notice。
2. 先启用 RSS/Atom、HN Firebase API、GitHub REST 三类无浏览器 adapter。
3. 新增 Vault `raw-export`：不调用任何 LLM，不进行主题去重，只做确定性字段清洗、批内 URL 去重、Schema 校验、HMAC 和 POST。
4. 每条记录至少输出：
   - `source_channel_id`
   - `discovery_path`
   - `canonical_url`
   - `original_title`
   - `original_content`
   - `original_author`
   - `original_published_at`
   - `fetched_at`
   - `raw_payload_hash`
5. GitHub Actions 每六小时运行一次，单 adapter 失败不阻断其他 adapter；失败报告作为 artifact。

### 阶段二：增加包装好的聚合输入

1. 接入 Follow Builders 的 X/博客 JSON Feed，不接 YouTube/播客视频处理。
2. 接入 BestBlogs 的公共 RSS 或 OpenAPI 作为策展通道。
3. 对聚合条目解析最终原始 URL；无法识别原始发布者或原文的记录只进入观察日志，不发布。
4. 由境内 URL/内容指纹去重，保留全部发现路径。

### 阶段三：再决定高成本平台

- X：在 Follow Builders 聚合输入、X 官方 API 和 Horizon/Apify 三者间，用真实成功率、成本和原文完整度比较后选择。
- Reddit：先验证 Horizon HTML/JSON/RSS fallback 在 GitHub Actions IP 上的七天成功率。
- Telegram/OpenBB：只有业务确认进入来源范围后再启用。
- 任何需要 Playwright、Selenium 或 runner 内浏览器的来源继续拒绝。

## 6. 验收门槛

“采集成功”必须同时满足：

- 请求的是真实上游，不是 fixture、`example.com` 或模拟 Feed；
- 原始 URL 可打开且发布者身份可判定；
- 原始标题和正文未被翻译文本覆盖；
- 每条记录可追溯到 adapter、来源配置和抓取时间；
- 同一真实窗口重复运行不会重复发布，但会保留多个发现路径；
- 至少连续运行 7 天，按来源统计成功率、条目数、延迟、空正文率和格式错误；
- 随机抽样至少 50 条，人工核对网页与采集字段；
- 完整管线再验证境内翻译、摘要、事件归并和公开页面。

只有接口返回 `202`、页面出现记录，不能证明信息采集成功。

## 7. 最终决策建议

建议项目确认以下架构决策：

> Vault2077 境外采集器采用 Horizon 的成熟采集层作为上游内核，并增加 Vault 专属的原始批次出口；Follow Builders 与 BestBlogs 作为可替换的二级聚合输入。Vault2077 不直接运行 Horizon 的 AI/日报管线，不采用 TrendRadar、CloudFlare-AI-Insight-Daily 或 Glance 作为采集运行时，也不继续独立重写 Horizon 已覆盖的通用 adapter。

这条路线承认现有开源项目在真实网络适配上的积累，同时把 Vault2077 必须拥有的来源准入、原始证据、跨境批次和境内事件沉淀保留在自己的控制范围内。
