# Vault2077 信息源与连接器拆解研究

> 状态修正（2026-07-22）：本文保留参考仓库原始内容的调查记录，因此仍会提到上游存在的 YouTube 配置；Vault2077 已决定不处理视频媒体，所有 YouTube 频道均已从当前注册表、CSV、pending 和运行 bundle 删除，文中的视频条目不得作为实施清单。

> 调查日期：2026-07-22
> 调查范围：TrendRadar、Horizon、follow-builders、BestBlogs、CloudFlare-AI-Insight-Daily／PrismFlowAgent、Glance。
> 状态：非规范性调研，尚未形成海外信源结论。口径：评估对象不是这些项目本身，而是它们已经整理或接入的上游信息源，以及可复用的连接器思路。来源组合的增删和版本升级需人工批准；具体上游来源由获批组合自动采用。

## 1. 结论

这些项目提供三类资产，应拆开使用：

1. **具体来源目录**：官方博客、人物账号、播客、社区、研究论文源等，可直接进入 Vault 来源注册表。
2. **通用连接器**：RSS/Atom、GitHub、Hacker News、Reddit、YouTube、X、Google News、GDELT 等，应由 Vault 自己实现并输出统一资讯信封。
3. **二级聚合入口**：NewsNow、Folo/Follow、BestBlogs、XGo、RSSHub 等只用于发现；它们不是事实发布者，也不能作为一条独立证据计数。

首发不应“部署七个项目”，而应建立 Vault 自有采集层，从这些项目的配置中抽取来源和连接器。每条资讯至少保留：`discovery_connector`、`aggregator_source`（如有）、`original_source_url`、`original_publisher`、`original_author`、`original_published_at` 和原始内容。

## 2. 分仓库来源拆解

### 2.1 TrendRadar

#### 默认具体来源

TrendRadar 默认的热榜实际通过 NewsNow API 获取，配置了 11 个平台：今日头条、百度热搜、华尔街见闻、澎湃、Bilibili 热搜、财联社热门、凤凰网、贴吧、微博、抖音、知乎。它们主要覆盖中文舆情，不是国际 AI 首发核心。[默认平台配置](https://github.com/sansan0/TrendRadar/blob/master/config/config.yaml)

默认 RSS/Atom 配置包括：

- Hacker News：`https://hnrss.org/frontpage`，启用。
- 阮一峰网络日志：Atom 示例，默认禁用。
- Yahoo Finance News：`https://finance.yahoo.com/news/rssindex`，启用。

来源与开关见[默认 RSS 配置](https://github.com/sansan0/TrendRadar/blob/master/config/config.yaml)。

#### 可抽取连接器与限制

- 任意 NewsNow source ID，可替换为自托管 NewsNow 地址；默认 API 为 `https://newsnow.busiyi.world/api/s`。代码读取 `url/mobileUrl` 并做来源域名校验。[NewsNow 抓取代码](https://github.com/sansan0/TrendRadar/blob/master/trendradar/crawler/fetcher.py)
- 任意 RSS、Atom、JSON Feed。
- 核心 RSS 路径保存标题、URL、发布时间、作者、GUID 和摘要；摘要最多约 500 字，不等于原文全文。[RSS 解析与截断](https://github.com/sansan0/TrendRadar/blob/master/trendradar/crawler/rss/parser.py)
- 另有按需正文读取能力，但不属于默认批量资讯输出，因此不能把 TrendRadar 当作全文采集器。[项目说明](https://github.com/sansan0/TrendRadar/blob/master/README-EN.md)

**对 Vault 的用途**：采用 NewsNow 平台枚举方式和 RSS 适配方式；Hacker News 可进入首发，中文热榜作为第二层舆情补充。

### 2.2 Horizon

#### 示例配置中的具体来源

启用示例：

- GitHub：用户 `torvalds` 的公开事件、`astral-sh/uv` 的 releases。
- Hacker News：Top 20，最低分数 100。
- Simon Willison：`https://simonwillison.net/atom/everything/`。
- Reddit：`r/MachineLearning` 和用户 `iamthatis`。

禁用但已给出可用配置的示例：

- LWN 订阅全文 Feed（需要订阅密钥与相应授权）。
- X：`karpathy`、`ylecun`。
- OpenBB/yfinance：AAPL、MSFT、NVDA、GOOGL、AMZN、META、TSLA。
- OSS Insight：全语言、Python、TypeScript 趋势。
- GDELT：查询 `artificial intelligence`。
- Google News：英文/美国地区查询 `artificial intelligence`。

上述配置集中在[示例配置](https://github.com/Thysrael/Horizon/blob/main/data/config.example.json)。

#### 可抽取连接器与限制

Horizon 已覆盖 GitHub user events / releases、Hacker News、RSS/Atom、Reddit subreddit/user、公开 Telegram channel、X user（Apify）、OpenBB、OSS Insight、GDELT 和 Google News。[连接器配置说明](https://github.com/Thysrael/Horizon/blob/main/docs/configuration.md)

它为不同来源保存标题、原始 URL、作者与正文/摘要，但完整度不同：RSS 默认取 Feed 自带内容，只有配置 `content_extractor` 才跟随文章 URL 用 Trafilatura 抽正文；失败时回退 Feed 内容。[正文提取说明](https://github.com/Thysrael/Horizon/blob/main/docs/extractors.md) Hacker News、Reddit 评论及 self-text 存在截断，不应视为无损原文。[各抓取器字段说明](https://github.com/Thysrael/Horizon/blob/main/docs/scrapers.md)

**对 Vault 的用途**：其来源覆盖最接近 Vault 目标，可直接抽取 GitHub、HN、RSS、Reddit、Google News/GDELT 和人物账号的连接器设计；Google News、GDELT、OpenBB 仍按二级发现入口处理。

### 2.3 follow-builders

#### 完整默认来源

6 个播客：

- Latent Space：Substack podcast feed 经 `pod2txt` 包装。
- Training Data：Megaphone RSS。
- No Priors：Megaphone RSS。
- Unsupervised Learning：Simplecast RSS。
- The MAD Podcast with Matt Turck：Anchor RSS。
- AI & I by Every：Anchor RSS。

RSS 和节目主页详见[默认来源配置](https://github.com/zarazhangrui/follow-builders/blob/main/config/default-sources.json#L1-L34)。

26 个 X 账号：Andrej Karpathy、Swyx、Josh Woodward、Boris Cherny、Thibault Sottiaux、Peter Yang、Nan Yu、Madhu Guru、Amanda Askell、Cat Wu、Thariq、Google Labs、Amjad Masad、Guillermo Rauch、Alex Albert、Aaron Levie、Ryo Lu、Garry Tan、Matt Turck、Zara Zhang、Nikunj Kothari、Peter Steinberger、Dan Shipper、Aditya Agarwal、Sam Altman、Claude。账号 handle 见[默认来源配置](https://github.com/zarazhangrui/follow-builders/blob/main/config/default-sources.json#L48-L76)。

2 个官方博客：Anthropic Engineering 与 Claude Blog，通过文章目录页抓取。[默认博客配置](https://github.com/zarazhangrui/follow-builders/blob/main/config/default-sources.json#L36-L47)

#### 内容保真与限制

- 输出保留原始内容链接；博客 Feed 实际包含 `content` 正文。[博客数据样例](https://github.com/zarazhangrui/follow-builders/blob/main/feed-blogs.json)
- 播客 Feed 实际包含逐字稿字段 `transcript`。[播客数据样例](https://github.com/zarazhangrui/follow-builders/blob/main/feed-podcasts.json)
- X 输出保留账号、帖子与原始 URL。[X 数据样例](https://github.com/zarazhangrui/follow-builders/blob/main/feed-x.json)
- 中央 Feed 每日更新，博客靠网页抓取，X 依赖官方 API；README 仍写 Supadata，但当前采集脚本实际要求 `POD2TXT_API_KEY` 并调用 pod2txt 获取播客逐字稿，说明文档与代码之间存在版本差异。Vault 应将这些源迁入自有采集，不能把中央 Feed 当作唯一长期依赖。[采集说明](https://github.com/zarazhangrui/follow-builders#how-it-works)、[当前采集脚本](https://github.com/zarazhangrui/follow-builders/blob/main/scripts/generate-feed.js)

**对 Vault 的用途**：这是“核心人物观点 + AI 播客 + Anthropic 官方内容”的高价值来源清单；人物与官方账号需要标记不同来源角色。

### 2.4 BestBlogs

BestBlogs 的公开 OPML 是本次最丰富的来源目录。当前主目录包括 170 个文章源、30 个播客源、40 个视频源、160 个 X 源；仓库另公布更大规模的微信、小宇宙和 YouTube 整理计划。[仓库目录与计数](https://github.com/ginobefun/BestBlogs#bestblogs-%E7%B2%BE%E9%80%89%E6%B1%A0%E8%AE%A2%E9%98%85%E6%BA%90-opml)

完整机器可读入口：

- [文章 OPML（170）](https://github.com/ginobefun/BestBlogs/blob/main/BestBlogs_RSS_Articles.opml)
- [播客 OPML（30）](https://github.com/ginobefun/BestBlogs/blob/main/BestBlogs_RSS_Podcasts.opml)
- [视频 OPML（40）](https://github.com/ginobefun/BestBlogs/blob/main/BestBlogs_RSS_Videos.opml)
- [X OPML（160）](https://github.com/ginobefun/BestBlogs/blob/main/BestBlogs_RSS_Twitters.opml)

#### AI 首发高价值源

文章/官方博客优先抽取：OpenAI Blog、Google DeepMind Blog、Hugging Face Blog、LangChain Blog、LlamaIndex Blog、AWS Machine Learning Blog、Engineering at Meta、Microsoft Research Blog、Google Cloud Blog、Google Developers Blog、Anthropic News、AI at Meta Blog。[文章 OPML](https://github.com/ginobefun/BestBlogs/blob/main/BestBlogs_RSS_Articles.opml#L1-L178)

独立媒体与研究者优先抽取：Simon Willison、DeepLearning.AI/The Batch、Last Week in AI、Latent Space、AI Musings by Mu。[文章 OPML](https://github.com/ginobefun/BestBlogs/blob/main/BestBlogs_RSS_Articles.opml#L1-L178)

视频优先抽取：Anthropic、OpenAI、Google DeepMind、AI Engineer、No Priors、Andrej Karpathy、Last Week in AI、AI Explained、Two Minute Papers、LangChain。[视频 OPML](https://github.com/ginobefun/BestBlogs/blob/main/BestBlogs_RSS_Videos.opml#L1-L48)

X 优先抽取：OpenAI、OpenAI Developers、Sam Altman、Anthropic、Microsoft Research、Andrej Karpathy、Google AI、Yann LeCun、Hugging Face、DeepLearning.AI、Google DeepMind、NVIDIA AI、Berkeley AI Research、AI at Meta、Stanford AI Lab、Mistral AI、xAI、DeepSeek、Simon Willison、Claude 等。[X OPML](https://github.com/ginobefun/BestBlogs/blob/main/BestBlogs_RSS_Twitters.opml#L1-L168)

#### 代理依赖

BestBlogs 清单中混合了原始 RSS 与中间服务：部分源依赖 `rsshub.bestblogs.dev`、`wechat2rss.bestblogs.dev`、`api.xgo.ing`。这些 URL 可以作为首发发现入口，但 `original_publisher` 必须取其实际账号或网站，代理域名不得计作独立发布者。仓库公开 API 可以返回全文/Markdown，但 Vault 不需要依赖其加工层，优先直接消费 OPML 中的原始来源。[RSS/API 说明](https://github.com/ginobefun/BestBlogs#6-rss-%E8%AE%A2%E9%98%85)

### 2.5 CloudFlare-AI-Insight-Daily（旧版）与 PrismFlowAgen

旧版仓库已经明确迁移至 PrismFlowAgent，但其 `dataSources` 目录仍揭示了实际来源结构：[迁移说明](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily#ai-%E8%B5%84%E8%AE%AF%E6%97%A5%E6%8A%A5)、[数据源目录](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily/tree/main/src/dataSources)。

具体源包括：

- AIBase、机器之心、量子位、Xiaohu.AI、新智元：分别由 Folo `feedId` 获取，返回原始 URL、标题、内容、作者与发布时间。[AIBase](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily/blob/main/src/dataSources/aibase.js)、[机器之心](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily/blob/main/src/dataSources/jiqizhixin.js)、[量子位](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily/blob/main/src/dataSources/qbit.js)、[Xiaohu.AI](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily/blob/main/src/dataSources/xiaohu.js)、[新智元](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily/blob/main/src/dataSources/xinzhiyuan.js)
- Hugging Face Daily Papers：由 Folo Feed 获取，保留论文 URL、标题、正文、作者与时间。[Hugging Face Papers](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily/blob/main/src/dataSources/huggingface-papers.js)
- Reddit、X：以 Folo List ID 获取，具体成员由外部列表决定，仓库本身未固化清单。[Reddit](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily/blob/main/src/dataSources/reddit.js)、[X](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily/blob/main/src/dataSources/twitter.js)
- 聚合新闻与论文：同样通过 Folo List ID，仓库未公开列表成员。[新闻列表](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily/blob/main/src/dataSources/newsAggregator.js)、[论文列表](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily/blob/main/src/dataSources/papers.js)
- GitHub Trending：从可配置 `PROJECTS_API_URL` 接收项目列表，保留仓库 URL、owner、语言与 star/fork 数据。[GitHub Trending](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily/blob/main/src/dataSources/github-trending.js)

PrismFlowAgent 当前内置适配器只有四类：AI 搜索、Follow API、GitHub Trending、通用 RSS。[内置适配器目录](https://github.com/justlovemaki/PrismFlowAgent/tree/main/src/plugins/builtin/adapters)

- Follow API 支持任意 List ID 或 Feed ID，可请求 `withContent`，保留条目 URL 与内容。[Follow 适配器](https://github.com/justlovemaki/PrismFlowAgent/blob/main/src/plugins/builtin/adapters/follow/FollowApiAdapter.ts#L1-L207)
- GitHub Trending 直接抓取 `https://github.com/trending`，支持 daily/weekly/monthly 与语言参数，但只保存榜单描述和统计，不读取 README。[GitHub Trending 适配器](https://github.com/justlovemaki/PrismFlowAgent/blob/main/src/plugins/builtin/adapters/github/GitHubTrendingAdapter.ts#L1-L303)
- RSS 接受任意 RSS/Atom URL，保留链接和 Feed 内容字段，不跟随链接抓完整正文。[RSS 适配器](https://github.com/justlovemaki/PrismFlowAgent/blob/main/src/plugins/builtin/adapters/rss/RSSAdapter.ts#L1-L79)
- AI 搜索的内容和 URL 由模型/工作流生成，不是稳定的一手采集连接器，首发不应作为事件证据入口。[AI Search 适配器](https://github.com/justlovemaki/PrismFlowAgent/blob/main/src/plugins/builtin/adapters/ai/AISearchAdapter.ts#L1-L116)

**对 Vault 的用途**：抽取 Folo Feed/List、GitHub Trending、RSS 三类连接器思路，以及 AIBase、Hugging Face Papers 等来源；AI 搜索只用于候选发现。

### 2.6 Glance

Glance 的 `docs/glance.yml` 是示例配置而非不可变默认源，其中列出：

- RSS：selfh.st、Ciechanow.ski、Josh Comeau、Sam Who、Ahmad Shadeed。
- 社区：Hacker News、Lobsters。
- YouTube：Linus Tech Tips、Jeff Geerling、Fireship、Marques Brownlee、Veritasium。
- Reddit：`r/technology`、`r/selfhosted`。
- GitHub releases：`glanceapp/glance`、`go-gitea/gitea`、`immich-app/immich`、`syncthing/syncthing`。
- Twitch 示例：theprimeagen、j_blow、giantwaffle、cohhcarnage、christitustech、EJ_SA。

具体标识与 URL 见[官方示例配置](https://github.com/glanceapp/glance/blob/main/docs/glance.yml)。

Glance 可配置任意 RSS/Atom、YouTube channel/playlist、HN、Lobsters、Reddit、GitHub releases/repository、Twitch、JSON Custom API 和 Extension。[完整连接器文档](https://github.com/glanceapp/glance/blob/main/docs/configuration.md)

其 RSS 保留 item link 和 description，但不抓文章正文；程序只在页面加载时请求并内存缓存，不做后台持续采集。因此应抽取源清单与连接器思路，不把 Glance 当作 Vault 采集运行时。[抓取与缓存说明](https://github.com/glanceapp/glance)

## 3. 跨仓库去重

| 逻辑来源 | 出现位置 | Vault 处理 |
|---|---|---|
| Hacker News | TrendRadar、Horizon、Glance | 只建一个 HN 直接连接器，优先 Firebase/API；HN RSS 与 Glance 配置只作为来源发现依据。 |
| Simon Willison | Horizon、BestBlogs | 统一为同一个 Atom 源。 |
| `r/MachineLearning` | Horizon；其他项目还有通用 Reddit/Folo List | 统一 subreddit ID，原帖 URL 去重。 |
| Karpathy、LeCun、Sam Altman、Claude 等 X 账号 | Horizon、follow-builders、BestBlogs | 按标准化 handle 去重；多个采集器命中同一 post ID 只生成一条资讯。 |
| No Priors | follow-builders、BestBlogs 视频 | 播客 RSS 与 YouTube 是同一节目不同载体；用 episode GUID/标题/发布时间归并，保留双入口。 |
| Latent Space | follow-builders、BestBlogs | 统一节目/出版者实体，Substack Feed 为主，X 账号为观点源。 |
| Anthropic/Claude 内容 | follow-builders、BestBlogs、官方 YouTube/X | 官方博客、Engineering、视频、X 分别作为同一机构下的不同发布通道，不互相算独立发布者。 |
| GitHub Trending | Horizon OSS Insight、PrismFlow、旧 CloudFlare、Glance GitHub | Trending 与 releases 分开：Trending 是趋势信号，releases 是项目事实；同仓库不能因多个榜单入口重复计证据。 |
| Hugging Face | BestBlogs 博客/X、CloudFlare Papers | 官方博客与官方账号为机构资讯；Daily Papers 是论文发现入口，论文作者/ArXiv 才是原始发布者。 |
| Folo/Follow | CloudFlare、PrismFlow | 只记为中间聚合连接器；其 Feed/List 下的实际 `entries.url` 与 `feeds.title` 才用于来源归属。 |

## 4. 覆盖维度（不构成采集分档）

以下分组只说明来源在事件证据中的不同作用，不决定采集优先级、频率或资源配额。生产中每个已启用通道都应在每个采集周期遍历；具体来源全集仍需单独讨论后冻结。

### 官方事实

候选包括：OpenAI Blog/Developers/X/YouTube，Anthropic News/Engineering/Claude Blog/X/YouTube，Google DeepMind Blog/X/YouTube，Hugging Face Blog，LangChain、LlamaIndex，Meta AI/Engineering，Microsoft Research，NVIDIA AI，以及重点 GitHub 仓库 releases。

用途：产品发布、模型能力、API/价格/可用性、官方研究与项目版本事实。官方同机构多通道只算一个独立发布者。

### 独立观察与验证

候选包括：Simon Willison、Hacker News、`r/MachineLearning`、Latent Space、No Priors、AI Engineer、DeepLearning.AI/The Batch、Last Week in AI、Andrej Karpathy、Yann LeCun，以及 follow-builders 中的其余核心建设者。

用途：测试、观点、行业采用和社区反应；不能覆盖或替代官方事实。

### 研究与开源趋势

候选包括 GitHub Trending、GitHub releases、OSS Insight、Hugging Face Daily Papers；是否补建论文原始链接解析，应在海外信源专项讨论中决定。

### 广覆盖发现

Google News、GDELT、NewsNow、BestBlogs OPML、Folo/Follow List、XGo、RSSHub/Wechat2RSS 用于发现候选。只有条目带明确原始 URL、且一跳校验成功时才进入资讯层；这些聚合器永远不算独立事实来源。

### 中国舆情补充

量子位、机器之心、新智元、AIBase、Xiaohu.AI，以及 TrendRadar 的中文热榜。它们有助于观察国内传播与解读；是否纳入来源组合另行决定，一旦启用则与其他通道遵守相同批次要求。

## 5. 当前缺口

1. **政策监管源缺失**：现有清单几乎没有美国、欧盟、英国及其他主要司法辖区的政府、监管机构和 AI 安全机构公告。
2. **公司公告体系不完整**：需要补充 AI 公司 newsroom、release notes、changelog、status、model card、security/safety report 与投资者关系公告，而不只依赖博客和 X。
3. **研究一手源不足**：Hugging Face Daily Papers 是发现层；仍需 ArXiv/OpenReview/机构论文页连接器和论文版本去重。
4. **正文能力不统一**：多数 RSS 只给摘要；Vault 境外节点必须实现受控的一跳正文提取，并标记 `content_completeness`，失败时不得把摘要伪装成全文。
5. **播客转录依赖外部服务**：只有 follow-builders 明确提供转录；其他 RSS/YouTube 只保证元数据，需要独立字幕/转录策略和版权规则。
6. **X 代理脆弱**：Apify、XGo、Folo 与官方 API 各有费用、认证或稳定性依赖；同一账号应至少保留可切换连接器，但只生成一个逻辑来源。
7. **来源角色需要固化**：机构官方、创始人/员工、研究者、媒体、测试者、评论者、社区帖和二级聚合器必须分开，避免 LLM 把评论写成官方事实。

## 6. 建议落库结构

来源注册表以“逻辑发布者 + 通道”组织，而不是以开源项目组织：

```tex
publisher_id
publisher_name
publisher_role
channel_type            # blog/rss/x/youtube/podcast/github/community/paper/aggregator
channel_identifier      # URL、handle、channel_id、subreddit、repo 等
connector_type
discovered_from         # TrendRadar/Horizon/BestBlogs/...
is_aggregator
evidence_eligible
content_capability      # metadata/summary/fulltext/transcrip
enabled
```

这样未来更换采集实现时，来源本身不会被某个开源项目绑定；人工审批的是连接器代码与版本，日常来源内容进入、去重和事件归并仍由系统自动完成。
