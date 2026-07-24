# Vault2077 境外采集架构研究：TrendRadar 与 Horizon

> 研究日期：2026-07-22
> 核查范围：仅使用两个项目的官方 GitHub 仓库、源代码、配置、工作流和许可证。
> 固定版本：TrendRadar `8ee26026ba6c11dec41a95fb3895a7162876caa1`；Horizon `1e2fdc7ccb177f33c59aef2082c4093e1e82b22c`。

## 1. 结论先行

当前 Vault2077 的采集实现已经出现“按 URL 和 connector 不断加分支”的趋势。它能运行，但边界偏浅：来源登记、协议适配、内容准入、归一化、去重、失败报告和批次发送都挤在同一条运行路径里。继续直接扩展数百个来源，会让每次新增来源都扩大系统复杂度。

建议不是二选一地“直接部署 TrendRadar 或 Horizon”，而是：

1. **不采用 TrendRadar 作为 Vault2077 的采集运行时。**它的主干是 NewsNow 热榜 ID 与 RSS 两条独立数据通路，核心数据模型是“标题、榜位、出现次数、榜位时间线”，默认热榜来源又以大陆平台为主，与 Vault2077 的“排除大陆来源平台、保留原始内容、境内事件归并”方向结构性不一致。
2. **借用 Horizon 的采集接口和选择性移植其 MIT adapter，不 fork 或部署 Horizon 整套产品。**境外首版运行在临时 GitHub Actions runner，完整 Horizon 的 AI、日报、通知、存储和 MCP 都是额外负担。保留 `fetch(since)`、统一内容对象、RSS/GitHub/HN/Reddit 等轻量实现思想即可。
3. **由 Vault2077 自己定义更深的采集模块接口。**Horizon 现有 `BaseScraper.fetch(since)` 是好起点，但它的 orchestrator 仍硬编码所有 source type，而且失败统计主要停留在“GitHub/RSS/Reddit 这一类”而非每个逻辑来源。Vault2077 应将其改造成“配置驱动的适配器注册表 + 每来源结果 + 统一准入策略 + 批次输出”。
4. **排除的是大陆来源平台，不是中文内容。**微信公众号、小红书、知乎、微博、小宇宙和大陆热榜及其代理出口不进入 active；X、GitHub 等境外平台上的中文内容正常采集。YouTube 另因视频处理超出产品范围而整体排除，与语言无关。来源准入必须识别原始发布平台，不能用原文语言或代理所在地代替。
5. **境外只做采集、确定性清洗和传输；境内做翻译、摘要和事件归并。**同 URL 的传输重复可以做确定性去重，但 Horizon 的 AI 主题去重不能在境外启用，因为 Vault2077 需要保留资讯证据并由境内 LLM 判断其是否归入近一个月事件。

推荐决策：**把现有采集脚本改造成独立、纯 Python、无状态的轻量采集器；采用 Horizon 的 adapter seam 并选择性移植必要 MIT 实现，不引入完整 Horizon；不复用 TrendRadar GPL 代码，只独立实现其中有价值的预期域名校验。**

> 当日修正状态：生产 bundle 已改为按原始平台过滤，不再按语言或发布者国籍过滤。当前为 201 个临时 active、255 个 pending；active 中保留了 7 个中文 X 通道，同时排除了 Wechat2RSS、NewsNow 大陆热榜和小宇宙代理路径。44 个 YouTube 频道已从注册表和候选池删除。直接网站的来源归属仍需继续核验。

## 2. 两个项目实际上如何抓取

### 2.1 TrendRadar：热榜代理与 RSS 是两条并行但分离的通路

TrendRadar 并不是一个通用的“数百发布方采集框架”。它的主通路如下：

```tex
平台 ID 列表
  -> NewsNow /api/s?id=<platform>&lates
  -> title + url + mobileUrl + 当前榜位
  -> 按 source_id + title 累积榜位和出现次数
  -> 关键词/AI 筛选、报告、通知

RSS 配置列表
  -> requests 串行抓取
  -> RSS / Atom / JSON Feed 解析
  -> 独立的 RSSItem / RSSData 存储
  -> 与热榜结果在报告阶段组合
```

证据：

- 官方配置明确说明热榜数据来自 NewsNow，配置项本质是 `platform id`、别名和预期域名；默认清单包含头条、百度、华尔街见闻、澎湃、B 站、微博、抖音、知乎等中国平台。[TrendRadar `config.en.yaml`](https://github.com/sansan0/TrendRadar/blob/8ee26026ba6c11dec41a95fb3895a7162876caa1/config/config.en.yaml#L47-L103)
- `DataFetcher` 对每个 ID 请求 `${api_url}?id=${id}&latest`，逐个重试并把返回项压缩为“标题 -> 榜位列表、URL、移动 URL”；它不是一个可以任意挂载 API/RSS/社媒协议的 adapter registry。[TrendRadar `crawler/fetcher.py`](https://github.com/sansan0/TrendRadar/blob/8ee26026ba6c11dec41a95fb3895a7162876caa1/trendradar/crawler/fetcher.py)
- RSS 通路支持 RSS、Atom 与 JSON Feed，保存标题、URL、GUID、时间、摘要和作者，但 `fetch_all()` 按 feed 串行遍历；每个 feed 的异常被记录为 `failed_ids`，不阻断其余 feed。[TrendRadar `rss/fetcher.py`](https://github.com/sansan0/TrendRadar/blob/8ee26026ba6c11dec41a95fb3895a7162876caa1/trendradar/crawler/rss/fetcher.py)；[RSS parser](https://github.com/sansan0/TrendRadar/blob/8ee26026ba6c11dec41a95fb3895a7162876caa1/trendradar/crawler/rss/parser.py)
- 热榜使用 `NewsItem/NewsData`，RSS 使用另一套 `RSSItem/RSSData`；前者围绕 rank、count、first/last time 和 rank timeline，后者才包含摘要、作者和发布时间。两类数据并未归一为同一个原子资讯模型。[TrendRadar `storage/base.py`](https://github.com/sansan0/TrendRadar/blob/8ee26026ba6c11dec41a95fb3895a7162876caa1/trendradar/storage/base.py#L13-L228)
- 主程序先抓热榜、再抓 RSS、再进入筛选、分析、报告和通知；采集层与产品输出层耦合在一个 `NewsAnalyzer` 中。[TrendRadar `__main__.py`](https://github.com/sansan0/TrendRadar/blob/8ee26026ba6c11dec41a95fb3895a7162876caa1/trendradar/__main__.py#L947-L1088)；[主流程](https://github.com/sansan0/TrendRadar/blob/8ee26026ba6c11dec41a95fb3895a7162876caa1/trendradar/__main__.py#L1609-L1636)
- 它有较成熟的时间段调度语义与 SQLite/S3 风格存储抽象；GitHub Actions 示例默认每小时触发一次，再由 timeline 决定 collect/analyze/push。[timeline](https://github.com/sansan0/TrendRadar/blob/8ee26026ba6c11dec41a95fb3895a7162876caa1/config/timeline.en.yaml)；[crawler workflow](https://github.com/sansan0/TrendRadar/blob/8ee26026ba6c11dec41a95fb3895a7162876caa1/.github/workflows/crawler.yml)

#### 对 Vault2077 的适配判断

| 维度 | 判断 |
| --- | --- |
| 新增普通 RSS | 可以通过配置完成，语言不限 |
| 新增 GitHub、Reddit、X、API 等协议 | 没有统一 adapter seam，需要另写通路并接入庞大的主流程 |
| 原文保留 | RSS 可保留 feed 摘要；热榜只保留标题与链接，无法满足统一原始资讯契约 |
| 数百源并发 | 热榜与 RSS 都偏串行，不适合直接承载数百独立来源 |
| 失败隔离 | 单平台或单 feed 失败不会停止其余项，但没有统一的每来源 `SourceResult` |
| Vault 事件沉淀 | 排名/频率模型不是事件簿模型，也不是境内事件归并所需的证据模型 |
| 排除大陆来源平台 | 默认热榜通路应整体关闭；RSS 仍需逐个识别原始发布平台 |
| 许可证 | GPL-3.0；复制或发布衍生代码有 copyleft 义务，需由法务按实际部署/分发方式确认。[LICENSE](https://github.com/sansan0/TrendRadar/blob/8ee26026ba6c11dec41a95fb3895a7162876caa1/LICENSE) |

因此，TrendRadar 适合作为“热榜监控产品”的参考，不适合作为 Vault2077 的底层采集内核。可以独立重写两个观念：

- 对聚合 API 返回的每条链接执行 `https + expected publisher domain` 校验；
- 调度器只负责决定本轮是否采集，来源配置不因单次失败自动变更。

不建议复制其 GPL 实现代码进入 Vault2077 主仓库。

### 2.2 Horizon：多源 scraper 归一为同一个内容对象

Horizon 的采集主干更接近 Vault2077：

```tex
Pydantic SourcesConfig
  -> GitHub / HN / RSS / Reddit / Telegram / X / OpenBB / OSSInsight / GDELT / Google News scraper
  -> asyncio 并发运行各 source type
  -> ContentItem
  -> URL 级跨来源去重
  -> AI 打分 / AI 主题去重 / 增强 / 摘要 / 发布
```

证据：

- 所有 scraper 继承 `BaseScraper`，共享 `httpx.AsyncClient`，对外只有 `async fetch(since) -> List[ContentItem]`。[Horizon `scrapers/base.py`](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/src/scrapers/base.py)
- `ContentItem` 统一了 ID、source type、标题、URL、content、author、published/fetched time 和 metadata，后面再附加 AI 结果字段。[Horizon `models.py`](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/src/models.py#L10-L64)
- 已有 GitHub、Hacker News、RSS、Reddit、Telegram、X、OpenBB、OSSInsight、GDELT 和 Google News 类型；配置由 Pydantic 模型校验。[source configuration models](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/src/models.py#L162-L386)
- orchestrator 为每类 scraper 建任务并用 `asyncio.gather` 并发；每类结果包装为 success/empty/failure，只有全部类型失败才令完整运行失败。[Horizon `orchestrator.py`](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/src/orchestrator.py#L355-L479)
- RSS 逐 feed 抓取，读取 feed 自带摘要/正文；可选 Trafilatura 抓全文。单 feed 异常被吞掉并记录日志，但该 feed 的失败不会进入顶层 `FetchReport`，因此运维粒度不足。[Horizon `rss.py`](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/src/scrapers/rss.py)
- GitHub adapter 直接访问官方 REST API，支持用户公开事件和仓库 releases。[Horizon `github.py`](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/src/scrapers/github.py)
- URL 去重会移除常见追踪参数、按规范化 URL 分组，保留内容最丰富的项并合并 metadata/content；另有 AI 主题去重，但两者是不同阶段。[deterministic URL dedup](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/src/orchestrator.py#L34-L75)；[merge implementation](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/src/orchestrator.py#L505-L567)
- 默认 CLI 是 fetch -> URL dedup -> AI analyze -> AI filter/topic dedup -> enrich -> bilingual summary -> delivery，说明采集与内容产品仍在同一 orchestrator 中，但 `fetch_all_sources()` 已经是可单独调用的稳定阶段入口。[full pipeline](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/src/orchestrator.py#L185-L264)
- 普通 CLI 只持久化配置和日报；MCP 模式另有按 run 保存 raw/scored/filtered/enriched JSON 的 `RunStore`，并不是面向长期增量采集的来源状态库。[StorageManager](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/src/storage/manager.py)；[RunStore](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/src/mcp/run_store.py)
- 示例调度是每天一次 GitHub Action，运行窗口 24 小时；没有内建 Vault2077 所需的北京时间 06:00、12:00、18:00、24:00 四批次调度。[daily workflow](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/.github/workflows/daily-summary.yml)
- 许可证是 MIT，允许复制、修改、分发和再许可，但须保留版权和许可声明。[LICENSE](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/LICENSE)

#### Horizon 不是现成答案的原因

Horizon 的方向正确，但仍需改造：

1. **适配器注册仍是硬编码。**新增一个真正的新协议，要修改 `SourceType`、配置模型、imports 和 `fetch_all_sources()`；这还不是插件式 registry。
2. **并发粒度是 source type，不是逻辑来源。**各 source type 并发，但 RSS 内部按 feed 串行。数百 RSS 源需要有界并发。
3. **失败报告粒度不够。**某个 RSS feed 失败通常只写日志，顶层仍可能把整个 “RSS Feeds” 记为 success。
4. **没有 Vault 的来源身份与证据字段。**`ContentItem.metadata` 太自由，缺少 `sourceChannelId`、original publisher、owner entity、publisher country、原始语言、discovery path、content completeness、bundle revision 等强约束。
5. **没有原始平台准入。**GDELT、Google News 等发现型来源可能返回任意发布平台，不能仅凭查询语言、聚合器域名或发布者国籍决定是否属于大陆来源。
6. **默认会进一步抓网页全文。**Vault2077 已决定不无限深入寻找原始网页；因此 Trafilatura 等 extractor 默认必须关闭，只保留信源明确提供的原文正文/摘要和来源 URL。
7. **AI 阶段部署位置错误。**Horizon 默认在同一实例完成 AI 打分、去重和摘要；Vault 必须在境内完成翻译、摘要和事件归并。

## 3. 推荐的 Vault2077 采集模块

### 3.1 一个深接口，隐藏所有来源差异

境外运行时对外只暴露一个接口：

```python
async def collect_batch(
    bundle: ApprovedSourceBundle,
    window: CollectionWindow,
) -> CollectionBatch
```

调用方不应知道 RSS、GitHub、HN、Reddit 或聚合发现 API 的差异。内部组件如下：

```tex
ApprovedSourceBundle
        |
        v
AdapterRegistry --按 connector 找适配器--> SourceAdapter.collect(source, window)
        |                                      |
        |                                      v
        |                                SourceResul
        |                         success / empty / failure
        v
Normalizer -> AdmissionPolicy -> DeterministicDeduplicator -> BatchAssembler
                       |                                   |
                       v                                   v
                  rejected items                    签名并传送境内
                  + reason codes
```

建议的模块契约：

```python
class SourceAdapter(Protocol):
    async def collect(
        self,
        source: ApprovedSource,
        window: CollectionWindow,
    ) -> SourceResult: ...

class SourceResult(BaseModel):
    source_id: str
    status: Literal["success", "empty", "failure"]
    items: list[RawInformation]
    error_code: str | None
    error_detail: str | None
    started_at: datetime
    finished_at: datetime

class RawInformation(BaseModel):
    source_channel_id: str
    original_publisher: str
    origin_platform: str
    origin_jurisdiction: str
    original_language: str
    discovery_path: str
    original_url: str
    original_title: str
    original_content: str | None
    original_author: str | None
    original_published_at: datetime | None
    fetched_at: datetime
    content_completeness: Literal["full", "feed-content", "excerpt", "metadata"]
```

这条 seam 允许我们直接复用 Horizon adapter 的内部实现，又不把 Horizon 的 AI、日报、通知和 MCP 概念泄露给 Vault 的其余模块。

### 3.2 原始发布平台门禁

系统排除大陆来源平台，但不排除中文内容：

#### Gate A：来源进入运行清单前

只有满足以下条件的来源才可进入 `ApprovedSourceBundle.sources`：

- 能识别原始发布平台，而不是只有一个无法回溯的聚合 URL；
- 原始平台不属于微信公众号、小红书、知乎、微博、小宇宙、头条、抖音、B 站或大陆媒体热榜；
- 直接博客或媒体网站已经核实来源归属；
- 人工批准状态为 active。

X、GitHub、Reddit、Telegram 和境外播客平台上的内容不因中文、作者国籍或机构国籍被拒绝。`primaryLanguage` 只描述内容，不参与准入。YouTube 不参与这项语言准入判断，因为视频专属通道已在更早的范围门禁中整体排除。

#### Gate B：每条资讯发送前

- 对最终原始 URL 重新解析发布平台。Google News、GDELT、HN 等只是发现路径，真正准入判断针对最终落地页面；
- 若跳转后落到已登记的大陆来源平台或与来源登记不一致的域名，拒绝并记录 reason code；
- 检测并记录实际语言，但不据此丢弃内容；中文原文可以直接进入境内批次；
- 原始标题和内容必须原样保留。清洗只能去除不可执行标记、压缩多余空白和限制大小，不得以翻译文本覆盖；
- 不使用境外 LLM 做语言、价值或事件判断。

这套规则会排除公众号、小宇宙等即使已经被转换成 RSS 的来源，同时保留 DeepSeek 官方 X 等中文或中国机构在境外平台上的公开内容。

### 3.3 哪些 Horizon 阶段保留，哪些删除

| Horizon 能力 | Vault2077 处理 |
| --- | --- |
| `BaseScraper` + async `fetch(since)` | 保留并改名为 Vault `SourceAdapter.collect()` |
| `ContentItem` | 作为起点，替换为有强来源字段的 `RawInformation` |
| RSS/GitHub/HN/Reddit 等 scraper | 选择性复用，保留 MIT 声明 |
| 共享 `httpx.AsyncClient` | 保留，增加按 host 并发、超时和重试策略 |
| URL 跟踪参数清理 | 保留思路；合并时保留所有 discovery paths |
| Trafilatura 网页全文提取 | 默认关闭；只对未来明确批准的来源单独开启 |
| AI score/filter | 删除，境外不做价值判断 |
| AI topic dedup | 删除，不能提前抹去事件证据 |
| AI enrich / web research | 删除，避免无限追溯网页 |
| bilingual summary | 删除，境内 LLM 负责 |
| email/webhook/GitHub Pages | 删除，Vault 批次发送器负责输出 |
| GitHub Action daily schedule | 替换为外部 cron，在北京时间 06:00/12:00/18:00/24:00 触发 |
| MCP run artifact store | 不作为生产状态库；可借鉴其分阶段调试文件 |

### 3.4 GitHub Actions 复杂度预算

境外采集器必须围绕临时 runner 设计，而不是把它当小型服务器：

- 一个 Python 3.12 CLI 完成读取 bundle、并发抓取、归一化、组包、HMAC 和 POST；不再串联 Python 与 Node.js 两套运行时。
- 首版依赖控制在 `httpx`、`feedparser` 和数据校验库这一量级；不安装 LLM SDK、数据库驱动、Playwright、Trafilatura、MCP 或通知库。
- workflow 只做 checkout、安装 Python、安装采集器、运行一次 CLI 和在失败时上传批次／报告 artifact；不启动 Docker 或常驻进程。
- 全局运行预算小于 GitHub job 的 10 分钟限制，连接器使用有界并发、单请求超时和有限重试；单来源失败只写入 `SourceResult`。
- X 等反爬强的平台优先使用获准 HTTP API 或外部抓取 adapter；需要在 runner 中启动浏览器的连接器不进入首版。
- 采集器没有跨运行状态。来源修订保存在仓库，内容幂等由批次内稳定资讯键和境内数据库负责。

独立采集器对外只有一个操作接口：

```tex
vault-collector run --bundle sources.json --ingest <url>
  -> exit 0：批次已被境内接受
  -> exit 2：有单源失败但批次已接受
  -> exit 1：无法组包或无法把批次安全送达
```

境内的 seam 同样保持很小：`POST /api/internal/content` 只验签、持久化和登记任务并返回 `202`；内容 Worker 在请求结束后执行 LLM、事件编排和发布。

## 4. 采用方式比较

| 方案 | 上线速度 | 长期可控性 | 风险 | 结论 |
| --- | ---: | ---: | --- | --- |
| 直接运行 TrendRadar | 中 | 低 | NewsNow/中国热榜模型不匹配；双数据模型；GPL；主流程耦合 | 拒绝 |
| Fork TrendRadar | 低 | 低 | 大量代码要绕过，最后只剩通用 RSS 能力 | 拒绝 |
| 直接把 Horizon 当 Git 依赖 | 高 | 低 | 尚未发布稳定包；包与内部 API 变化会穿透 Vault；完整 AI/发布管线多余 | 不推荐 |
| 直接部署 Horizon 完整应用 | 中 | 低 | 部署职责错误，境外发生 AI 处理；调度和输出契约不符 | 拒绝 |
| 完整 fork/vendor Horizon 采集层 | 中 | 中 | GitHub Actions 中仍携带过多模型、配置与上游结构 | 不推荐 |
| 轻量重构现有采集器，选择性移植 Horizon adapter | 高 | 高 | 需要维护少量 MIT notices 与 adapter 测试 | **推荐** |
| 完全重写所有 adapter | 低 | 高 | 重复实现成熟协议，首发周期更长 | 仅在必要协议没有可复用实现时采用 |

“选择性移植”具体表示：

- 固定上游 commit，不跟随 `main` 自动升级；
- 只移植必要的 RSS/GitHub/HN/Reddit adapter 和对应测试，不复制 Horizon orchestrator、AI、日报、邮件、MCP、存储或前端；
- 在第三方 notices 中保留 Horizon 的 MIT 版权与许可；
- 每次升级都通过 adapter contract tests、大陆来源平台排除测试和批次契约测试；
- 上游 source preset 不能自动进入 Vault 运行清单，所有来源增减仍由 Vault2077 的人工批准清单控制。

## 5. 对当前 Vault2077 实现的落点

> 实施状态更新（2026-07-22）：本节提出的运行时合并已经完成。`scripts/overseas-collector.mjs` 已删除，当前生产入口只有 `collector/feed_collector.py`；它一次完成采集、规范化、分包、HMAC 签名、发送和失败 artifact 报告。境内 ingest 已改为持久化后返回 `202`，由独立 process route 调用 OpenAI 兼容 LLM。尚未执行的只有把 `collector/` 从当前仓库物理提取为单独 GitHub 仓库，该步骤不影响其独立部署。

实施后的边界为：

- `config/source-bundle.json` 可以继续作为冻结后的来源输入，但必须记录 `originPlatform` 和平台归属；
- HMAC、正式截止时间窗、受控公网 HTTPS 抓取和境内 ingest 契约均已合并到 Python CLI；
- `collector/feed_collector.py` 是唯一境外运行入口，不依赖网站运行时；
- 正式发布可把 `collector/`、冻结 bundle 与对应 workflow 物理提取为独立 `vault2077-collector` 仓库；网站仓库只需要保留接收契约与境内处理；
- 境内翻译、摘要、事件归并和近一个月事件匹配逻辑不受本次替换影响。

最关键的职责变化是：

```tex
当前：
collection_runtime = 调度适配器、准入、去重、结果报告
adapters/*        = 各协议细节
source_policy     = 大陆来源平台排除，语言只记录不拦截
collector_cli     = 一次完成采集、组包、签名、发送
GitHub Actions    = 只负责四次 cron 和失败 artifac
```

## 6. 分阶段迁移方案

### 阶段 0：先停止错误来源继续扩张

1. 将当前注册表视为审计库存，不把在线可达等同于可上线来源。
2. 补齐 `originPlatform`、平台归属和代理到原始平台的映射；内容语言继续保留但不参与准入。
3. 生成排除大陆来源平台和视频专属通道的新 bundle；当前临时结果为 201 active、255 pending。

### 阶段 1：冻结 Vault 采集契约

为 `RawInformation`、`SourceResult`、`CollectionBatch` 写 schema 和 contract tests，覆盖：

- 原文不会被翻译覆盖；
- 大陆来源平台及其 RSS/聚合代理被拒绝；海外平台的中文条目被保留；
- 一个来源失败不会影响其余来源；
- 同 URL 的多个 discovery path 不丢失；
- 重跑同一时间窗保持 idempotency key 稳定。

### 阶段 2：建立轻量独立采集器

按优先顺序迁移 adapter：

1. RSS/Atom；
2. GitHub releases/user events；
3. Hacker News；
4. Reddit；
5. 经过单独批准的 X 或其他需凭证渠道。

所有 adapter 都接收同一个 `ApprovedSource`，返回同一个 `SourceResult`；每一轮遍历清单内全部来源，不按内容价值分 P0/P1/P2。CLI 在同一 Python 进程内完成采集、组包、HMAC 和 HTTP 发送，不需要 Node.js、Docker、数据库或境外 LLM。

### 阶段 3：影子运行

旧 collector 与新 runtime 对同一获准来源集并行运行至少 7 天，对比：

- 每源成功率与延迟；
- 条目数量、发布时间和正文完整度；
- 重复率；
- 被准入策略拒绝的原因；
- 六小时批次是否准时、是否可安全重放。

### 阶段 4：切换与收敛

新 runtime 达到合同测试与影子运行门槛后，切换境外采集入口；保留旧实现一个可回滚版本，不再双写。此后新增来源只改获批 bundle，新增协议才改 adapter 代码。

## 7. 最终架构决策建议

建议项目正式记录以下决策：

- **ADR：Vault2077 境外采集器是独立、无状态、纯采集的 GitHub Actions 项目。**
- **ADR：采用 Horizon 的 adapter seam 并选择性移植必要 MIT 代码，不 fork 完整项目。**
- **ADR：TrendRadar 不作为运行时依赖，GPL 代码不进入 Vault2077；仅独立实现其域名校验等通用思想。**
- **ADR：来源准入排除大陆来源平台，但不按内容语言、作者或机构国籍过滤。**
- **ADR：境外不做 AI 评分、AI 主题去重、翻译、摘要或事件归并。**
- **ADR：外部调度在北京时间 06:00、12:00、18:00、24:00 运行，每轮遍历全部获批且到期的来源。**
- **ADR：事件价值只在境内产生；境外层只输出可追溯的原始资讯证据。**

这条路线既利用 Horizon 已经写好的协议适配能力，也把 Vault2077 真正独有、且以后最难替换的部分——来源准入、原始证据契约、境内事件沉淀——牢牢掌握在自己的模块边界内。
