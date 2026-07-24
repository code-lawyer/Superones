# Vault2077 上游信源审计研究

> 状态修正（2026-07-22）：本文逐仓记录固定提交中实际存在的配置，因此仍保留上游 YouTube 清单作为证据。Vault2077 已将视频专属通道从产品范围中删除；这些条目不进入当前注册表、CSV、pending 或运行 bundle，也不得据此恢复视频处理链路。

> 审计日期：2026-07-22
> 范围：TrendRadar、Horizon、follow-builders、BestBlogs、CloudFlare-AI-Insight-Daily／PrismFlowAgent、Glance。
> 口径：只记录仓库随版本分发的来源声明与采集入口；不评价项目本身。来源分组只描述身份，不代表采集优先级或频率。

## 1. 审计结论

七个仓库并不都提供可直接复制的“固定信源全集”。按可复现性分成四类：

1. **固定具体来源**：仓库明确保存发布者、账号、Feed URL、频道 ID、仓库名或查询词，可以逐项迁入 Vault 注册表。
2. **固定聚合入口**：仓库固定了 NewsNow、Folo/Follow、XGo、RSSHub、Wechat2RSS 等入口，但它们不是原始发布者。
3. **通用连接器**：仓库只提供 RSS、GitHub、Reddit、YouTube、Telegram、Google News、GDELT 等能力，没有固定成员全集。
4. **运行态列表／私有配置**：成员存在于外部服务、环境变量或用户配置中；仓库不能证明列表内有哪些来源，也不能据此声称已经穷举。

本次从仓库固定版本中确认：TrendRadar 14 个声明项（11 个热榜平台、3 个 RSS，其中 1 个默认禁用）；Horizon 在示例、GitHub 部署配置与向导预设中共有一套可静态展开的目标库；follow-builders 34 个固定来源；BestBlogs 400 个 OPML 频道；Glance 预配置中有 24 个内容目标，另有 5 个 Yahoo Finance 行情代码。CloudFlare 旧版当前实际注册的是 4 个 Folo List 和 1 个 GitHub Trending 接口；另有 6 个具名但未注册且缺 Feed ID 的适配器。PrismFlowAgent 有 4 类适配器，并随仓库给出 5 个启用任务和 1 个禁用任务，其中 AI Search 的实际网页来源是动态的。

因此，**仓库可穷举清单已经穷举；外部动态列表不能仅凭仓库穷举**。Vault 自建信源时应直接登记原始发布者和频道；聚合器只保留在 `discovered_from`／`connector_type`，不能充当发布者或独立证据。

## 2. 固定审计版本

| 仓库 | 审计提交 | 时间（UTC） |
|---|---|---|
| `sansan0/TrendRadar` | [`8ee2602`](https://github.com/sansan0/TrendRadar/tree/8ee26026ba6c11dec41a95fb3895a7162876caa1) | 2026-07-17 |
| `Thysrael/Horizon` | [`1e2fdc7`](https://github.com/Thysrael/Horizon/tree/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c) | 2026-07-17 |
| `zarazhangrui/follow-builders` | [`d81cc5c`](https://github.com/zarazhangrui/follow-builders/tree/d81cc5ca00b07905f88398cd1ed39fd5f4ac12a4) | 2026-07-22 |
| `ginobefun/BestBlogs` | [`756ffbd`](https://github.com/ginobefun/BestBlogs/tree/756ffbddf5cf4cd87e383a82b7c997563032e93f) | 2026-07-08 |
| `justlovemaki/CloudFlare-AI-Insight-Daily` | [`287cde1`](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily/tree/287cde1f1614e90e6c2f5e39ce6621dd9f7b8d83) | 2026-06-07 |
| `justlovemaki/PrismFlowAgent` | [`6421449`](https://github.com/justlovemaki/PrismFlowAgent/tree/64214497bbf3b16ab15fd2981500bfd525f8bbdd) | 2026-07-22 |
| `glanceapp/glance` | [`91324e8`](https://github.com/glanceapp/glance/tree/91324e8de762702e97b0ac5c8e36271d644d8642) | 2026-05-30 |
| `ourongxing/newsnow`（TrendRadar 二级依赖） | [`2173126`](https://github.com/ourongxing/newsnow/tree/2173126f804bec0201769f59d933add6c4632d17) | 2026-06-30 |

这些提交是本次审计的固定证据点。后续仓库更新不会自动改变 Vault 的已批准清单；升级时需要重新生成差异并人工确认来源增减。

## 3. 分仓库审计

### 3.1 TrendRadar

#### 随仓库分发的固定来源

| 类型 | 具体来源／标识 | 直接入口或聚合路径 | 状态 |
|---|---|---|---|
| 热榜 | 今日头条 `toutiao` | NewsNow `/api/s?id=toutiao`，校验 `toutiao.com` | 启用 |
| 热榜 | 百度热搜 `baidu` | NewsNow，校验 `baidu.com` | 启用 |
| 热榜 | 华尔街见闻 `wallstreetcn-hot` | NewsNow，校验 `wallstreetcn.com` | 启用 |
| 热榜 | 澎湃新闻 `thepaper` | NewsNow，校验 `thepaper.cn` | 启用 |
| 热榜 | Bilibili 热搜 `bilibili-hot-search` | NewsNow，校验 `bilibili.com` | 启用 |
| 热榜 | 财联社热门 `cls-hot` | NewsNow，校验 `cls.cn` | 启用 |
| 热榜 | 凤凰网 `ifeng` | NewsNow，校验 `ifeng.com` | 启用 |
| 热榜 | 百度贴吧 `tieba` | NewsNow，校验 `baidu.com` | 启用 |
| 热榜 | 微博 `weibo` | NewsNow，校验 `weibo.com` | 启用 |
| 热榜 | 抖音 `douyin` | NewsNow，校验 `douyin.com` | 启用 |
| 热榜 | 知乎 `zhihu` | NewsNow，校验 `zhihu.com` | 启用 |
| RSS | Hacker News | `https://hnrss.org/frontpage` | 启用 |
| Atom | 阮一峰的网络日志 | `http://www.ruanyifeng.com/blog/atom.xml` | 默认禁用 |
| RSS | Yahoo Finance News | `https://finance.yahoo.com/news/rssindex` | 启用 |

证据：[固定配置](https://github.com/sansan0/TrendRadar/blob/8ee26026ba6c11dec41a95fb3895a7162876caa1/config/config.yaml)。抓取器默认请求 `https://newsnow.busiyi.world/api/s`，证明 11 个热榜是经 NewsNow 发现而不是 TrendRadar 直接抓取各平台；返回链接仍要按配置中的原站域名校验。[抓取器源码](https://github.com/sansan0/TrendRadar/blob/8ee26026ba6c11dec41a95fb3895a7162876caa1/trendradar/crawler/fetcher.py)

继续追踪 TrendRadar 所依赖的 [NewsNow 来源实现](https://github.com/ourongxing/newsnow/tree/2173126f804bec0201769f59d933add6c4632d17/server/sources) 后，11 个 source ID 的实际原站端点是：今日头条 `toutiao.com/hot-event/hot-board/`、百度 `top.baidu.com/board?tab=realtime`、华尔街见闻 `api-one.wallstcn.com/apiv1/content/articles/hot?period=all`、澎湃 `cache.thepaper.cn/contentapi/wwwIndex/rightSidebar`、Bilibili `s.search.bilibili.com/main/hotword?limit=30`、财联社 `cls.cn/v2/article/hot/list`、凤凰网首页内嵌 `allData.hotNews1`、贴吧 `tieba.baidu.com/hottopic/browse/topicList`、微博 `s.weibo.com/top/summary?cate=realtimehot`、抖音 `douyin.com/aweme/v1/web/hot/search/list/`、知乎 `zhihu.com/api/v3/feed/topstory/hot-list-web`。其中微博依赖 HTML/Cookie，抖音先获取登录站 Cookie，属于需要持续维护的网页适配器；Vault 若不采用 NewsNow，应按这些源码实现自有原站适配器，而不是把 NewsNow 当作发布者。

#### 不能从仓库穷举的部分

配置允许添加任意 NewsNow source ID 和任意 RSS/Atom/JSON Feed。它们是通用连接器能力，不是默认来源。NewsNow 自身还可能增加平台，但未写入上述固定配置的项目不属于本次可复现清单。

### 3.2 Horizon

#### 仓库配置与预设内的具体目标

| 连接器 | 具体目标 | 状态／参数 |
|---|---|---|
| GitHub user events | `torvalds` | 启用 |
| GitHub releases | `astral-sh/uv` | 启用 |
| Hacker News | Top stories | 启用；20 条、最低 100 分 |
| RSS | Simon Willison `https://simonwillison.net/atom/everything/` | 启用 |
| RSS | LWN subscriber full-text `https://lwn.net/headlines/full_text?key=${LWN_KEY}` | 禁用；需要订阅密钥 |
| Reddit subreddit | `r/MachineLearning` | 启用；hot/day、15 条、最低 50 分 |
| Reddit user | `u/iamthatis` | 启用；new、10 条 |
| X | `@karpathy`、`@ylecun` | 禁用 |
| 市场数据 | AAPL、MSFT、NVDA、GOOGL、AMZN、META、TSLA | 禁用；OpenBB/yfinance |
| OSS Insight | All、Python、TypeScript | 禁用；past 24 hours |
| GDELT | 查询 `artificial intelligence` | 禁用 |
| Google News | 查询 `artificial intelligence`，`en-US` | 禁用 |

以上是 `config.example.json` 的目标；仓库的 GitHub 部署配置和向导预设还固定声明：

- RSS：LWN 公共 `https://lwn.net/headlines/rss`、GitHub Trending RSS `https://mshibanami.github.io/GitHubTrendingRSS/daily/all.xml`、SemiAnalysis、量子位和新智元的 `wechat2rss.xlab.app` Feed、Brendan Gregg、Krebs on Security、Schneier on Security、CSS-Tricks、Hackaday、Nature、Quanta。
- Reddit：`r/LocalLLaMA`、`r/linux`、`r/netsec`、`r/webdev`、`r/javascript`、`r/ProgrammingLanguages`、`r/rust`、`r/robotics`、`r/embedded`、`r/commandline`、`r/science`。
- GitHub user events：`karpathy`；GitHub releases：`vllm-project/vllm`、`sgl-project/sglang`、`triton-lang/triton`、`rust-lang/rust`、`ziglang/zig`、`neovim/neovim`。
- Telegram public channel：`zaihuapd`。

三份机器可读证据必须合并审计：[示例配置](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/data/config.example.json)、[GitHub 部署配置](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/data/config.github.json)、[向导预设库](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/data/presets.json)。Horizon 还实现公共 Telegram channel、RSS、GitHub、HN、Reddit、X、OpenBB、OSS Insight、GDELT 和 Google News 等通用连接器；部署者添加的成员不能从上游仓库穷举。[配置说明](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/docs/configuration.md)

#### 身份判定

- Simon Willison、GitHub 用户／仓库、Reddit 账号／社区是可登记的具体来源。
- Hacker News、OSS Insight、GDELT、Google News 是聚合或发现入口；条目的原始发布者需从返回链接另行记录。
- 股票代码不是资讯发布者；若未来需要公司公告，应改接公司 newsroom／IR／监管披露源。
- LWN URL 只有具备合法订阅密钥才可用，不能当公开 Feed。

### 3.3 follow-builders

该仓库的固定配置完整列出 34 个来源：[配置证据](https://github.com/zarazhangrui/follow-builders/blob/d81cc5ca00b07905f88398cd1ed39fd5f4ac12a4/config/default-sources.json)。

#### 播客（6）

| 节目 | Feed | 补充入口 |
|---|---|---|
| Latent Space | `pod2txt.vercel.app/api/feed?url=https://api.substack.com/feed/podcast/1084089.rss` | YouTube `@LatentSpacePod`；真正上游是 Substack Feed，pod2txt 是转录包装层 |
| Training Data | `https://feeds.megaphone.fm/trainingdata` | YouTube playlist `PLOhHNjZItNnMm5tdW61JpnyxeYH5NDDx8` |
| No Priors | `https://feeds.megaphone.fm/nopriors` | YouTube `@NoPriorsPodcast` |
| Unsupervised Learning | `https://feeds.simplecast.com/dOSE_bdP` | YouTube `@RedpointAI` |
| The MAD Podcast with Matt Turck | `https://anchor.fm/s/f2ee4948/podcast/rss` | YouTube `@DataDrivenNYC/videos` |
| AI & I by Every | `https://anchor.fm/s/ed1f5584/podcast/rss` | YouTube playlist `PLuMcoKK9mKgHtW_o9h5sGO2vXrffKHwJL` |

#### 官方博客（2）

- Anthropic Engineering：索引 `https://www.anthropic.com/engineering`，文章路径 `/engineering/`。
- Claude Blog：索引 `https://claude.com/blog`，文章路径 `/blog/`。

二者是网页目录抓取，不是仓库声明的 RSS。

#### X 账号（26）

`@karpathy`、`@swyx`、`@joshwoodward`、`@bcherny`、`@thsottiaux`、`@petergyang`、`@thenanyu`、`@realmadhuguru`、`@AmandaAskell`、`@_catwu`、`@trq212`、`@GoogleLabs`、`@amasad`、`@rauchg`、`@alexalbert__`、`@levie`、`@ryolu_`、`@garrytan`、`@mattturck`、`@zarazhangrui`、`@nikunj`、`@steipete`、`@danshipper`、`@adityaag`、`@sama`、`@claudeai`。

X 的采集实现依赖外部 API 凭证；账号清单是固定的，但“具备账号名”不等于接口无认证可用。Vault 应把 handle 当逻辑来源，把具体 X API／代理作为可替换连接器。

### 3.4 BestBlogs

BestBlogs 的四份 OPML 是本次规模最大的固定目录。固定提交内共有 400 个频道：170 文章、30 播客、40 YouTube、160 X；400 个 `xmlUrl` 全部唯一，并与 [ALL 汇总 OPML](https://github.com/ginobefun/BestBlogs/blob/756ffbddf5cf4cd87e383a82b7c997563032e93f/BestBlogs_RSS_ALL.opml) 完整对齐。显示名有 394 个唯一值；6 组跨媒介同名（Last Week in AI、freeCodeCamp.org、42章经、AI炼金术、十字路口Crossing、硅谷101）不是 URL 重复。证据：[文章 OPML](https://github.com/ginobefun/BestBlogs/blob/756ffbddf5cf4cd87e383a82b7c997563032e93f/BestBlogs_RSS_Articles.opml)、[播客 OPML](https://github.com/ginobefun/BestBlogs/blob/756ffbddf5cf4cd87e383a82b7c997563032e93f/BestBlogs_RSS_Podcasts.opml)、[视频 OPML](https://github.com/ginobefun/BestBlogs/blob/756ffbddf5cf4cd87e383a82b7c997563032e93f/BestBlogs_RSS_Videos.opml)、[X OPML](https://github.com/ginobefun/BestBlogs/blob/756ffbddf5cf4cd87e383a82b7c997563032e93f/BestBlogs_RSS_Twitters.opml)。

需要区分：

- 原站 Feed，例如 OpenAI、Hugging Face、LangChain、GitHub Blog、Cloudflare、Substack 等。
- BestBlogs 自有代理：`api.bestblogs.dev`。
- RSSHub 代理：`rsshub.bestblogs.dev`、`rsshub.app`。
- 微信代理：`wechat2rss.bestblogs.dev`。
- X 代理：`api.xgo.ing`。其不可读 token 不能替代 `@handle`；逻辑来源应由 OPML title 中的 handle 标准化。
- YouTube 官方 Feed：`youtube.com/feeds/videos.xml?channel_id=...`。

按 endpoint 域名统计：160 个 `api.xgo.ing`、115 个 `wechat2rss.bestblogs.dev`、40 个 YouTube 官方 Feed、33 个 `rsshub.bestblogs.dev`、3 个 `api.bestblogs.dev`、49 个发布者直连 RSS/Atom。也就是说 400 个频道都能从 Git 静态展开，但其中 311 个依赖项目方或第三方代理；“清单存在”不能替代对代理服务的在线可用性检查。仓库里的 `archive/legacy-opml` 和 `opml/` 还有历史或素材池文件，但不属于当前 canonical 400 源，不能混入生产清单。

完整名称清单见附录 A；每一项的精确 URL 以上述固定 OPML 为准。

### 3.5 CloudFlare-AI-Insight-Daily（旧版）

仓库明确声明项目已迁移到 PrismFlowAgent。旧版仍保存 11 个数据源模块，但 [实际注册表](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily/blob/287cde1f1614e90e6c2f5e39ce6621dd9f7b8d83/src/dataFetchers.js) 只启用其中 5 路；不能把目录里未注册的文件误算成当前活动来源。[目录证据](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily/tree/287cde1f1614e90e6c2f5e39ce6621dd9f7b8d83/src/dataSources)

| 模块 | 仓库能确认的来源 | 实际入口 | 能否从仓库穷举 |
|---|---|---|---|
| `aibase.js` | AIBase | Folo Feed ID：`AIBASE_FEED_ID` | 未注册；ID 未随仓库分发 |
| `huggingface-papers.js` | Hugging Face Daily Papers | Folo Feed ID：`HGPAPERS_FEED_ID` | 未注册；ID 未随仓库分发 |
| `jiqizhixin.js` | 机器之心 | Folo Feed ID：`JIQIZHIXIN_FEED_ID` | 未注册；ID 未随仓库分发 |
| `qbit.js` | 量子位 | Folo Feed ID：`QBIT_FEED_ID` | 未注册；ID 未随仓库分发 |
| `xiaohu.js` | Xiaohu.AI | Folo Feed ID：`XIAOHU_FEED_ID` | 未注册；ID 未随仓库分发 |
| `xinzhiyuan.js` | 新智元 | Folo Feed ID：`XINZHIYUAN_FEED_ID` | 未注册；ID 未随仓库分发 |
| `newsAggregator.js` | 聚合新闻 | Folo List `158437828119024640` | 活动；成员在 Folo 运行态，不能从 Git 穷举 |
| `papers.js` | 聚合论文 | Folo List `158437917409783808` | 活动；成员在 Folo 运行态，不能从 Git 穷举 |
| `twitter.js` | X 账号集合 | Folo List `153028784690326528` | 活动；成员在 Folo 运行态，不能从 Git 穷举 |
| `reddit.js` | Reddit 社区／账号集合 | Folo List `167576006499975168` | 活动；成员在 Folo 运行态，不能从 Git 穷举 |
| `github-trending.js` | GitHub Trending | `https://git-trending.justlikemaki.vip/topone/?since=daily` | 活动；只能确认该聚合接口，不能恢复其实现源 |

四个 List ID 与 GitHub Trending API 固化在 [wrangler 配置](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily/blob/287cde1f1614e90e6c2f5e39ce6621dd9f7b8d83/wrangler.toml)。各模块向 `https://api.follow.is/entries` 发送 `feedId` 或 `listId`，并从返回的 `entries.url`、`feeds.title` 识别条目；因此 Folo 是中间聚合器，而不是原始发布者。

这里必须明确：**AIBase、Hugging Face Papers、机器之心、量子位、Xiaohu.AI、新智元的发布者名称可确认，但旧项目实际使用的 Feed ID 不公开；四个 Folo List 的成员也不在 Git 中。** 在拿到合法运行配置或 Folo 列表导出前，任何“已经完整核查这些列表成员”的说法都不成立。

### 3.6 PrismFlowAgen

当前仓库内置四种适配器：

| 适配器 | 固定上游／能力 | 是否含默认具体来源 |
|---|---|---|
| Follow API | 任意 Follow Feed ID 或 List ID；请求 Follow entries | 否 |
| GitHub Trending | 直接抓取 `https://github.com/trending`，支持 daily/weekly/monthly 与语言路径 | 只有聚合入口，没有固定仓库集合 |
| RSS | 任意 RSS/Atom URL | 否 |
| AI Search | 由模型／工作流返回内容和 URL | 否；不是稳定信源目录 |

证据：[适配器目录](https://github.com/justlovemaki/PrismFlowAgent/tree/64214497bbf3b16ab15fd2981500bfd525f8bbdd/src/plugins/builtin/adapters)、[Follow 适配器](https://github.com/justlovemaki/PrismFlowAgent/blob/64214497bbf3b16ab15fd2981500bfd525f8bbdd/src/plugins/builtin/adapters/follow/FollowApiAdapter.ts)、[GitHub Trending 适配器](https://github.com/justlovemaki/PrismFlowAgent/blob/64214497bbf3b16ab15fd2981500bfd525f8bbdd/src/plugins/builtin/adapters/github/GitHubTrendingAdapter.ts)、[RSS 适配器](https://github.com/justlovemaki/PrismFlowAgent/blob/64214497bbf3b16ab15fd2981500bfd525f8bbdd/src/plugins/builtin/adapters/rss/RSSAdapter.ts)、[AI Search 适配器](https://github.com/justlovemaki/PrismFlowAgent/blob/64214497bbf3b16ab15fd2981500bfd525f8bbdd/src/plugins/builtin/adapters/ai/AISearchAdapter.ts)。

[默认配置](https://github.com/justlovemaki/PrismFlowAgent/blob/64214497bbf3b16ab15fd2981500bfd525f8bbdd/src/config.ts#L122-L168) 随仓库分发 6 个任务：GitHub Trending daily（启用）、GitHub Trending weekly（禁用）、Folo papers List `158437917409783808`（启用）、Folo Reddit List `167576006499975168`（启用）、阮一峰 Atom（启用），以及一项关键词为“AI 行业最新动态”的 AI Search（启用）。其中两个 Folo List 与迁移前旧项目完全重复；AI Search 是运行时 Agent 搜索任务，无法静态列出网页来源。

PrismFlowAgent 主要是连接器实现参考，只有上述少量默认任务。Vault 可以复用适配器思路，但不能把“支持 Follow/RSS”写成已经有某个发布者来源。

### 3.7 Glance

Glance 的 `docs/glance.yml` 是随仓库分发的演示站配置，不是软件强制默认源。其具体目标如下：[示例配置证据](https://github.com/glanceapp/glance/blob/91324e8de762702e97b0ac5c8e36271d644d8642/docs/glance.yml)。

| 类型 | 固定示例目标 |
|---|---|
| RSS | selfh.st、Ciechanow.ski、Josh Comeau、Sam Who、Ahmad Shadeed |
| 社区 | Hacker News、Lobsters |
| YouTube | Linus Tech Tips、Jeff Geerling、Fireship、Marques Brownlee、Veritasium |
| Reddit | `r/technology`、`r/selfhosted` |
| GitHub releases | `glanceapp/glance`、`go-gitea/gitea`、`immich-app/immich`、`syncthing/syncthing` |
| Twitch | `theprimeagen`、`j_blow`、`giantwaffle`、`cohhcarnage`、`christitustech`、`EJ_SA` |
| Yahoo Finance 行情 | SPY、BTC-USD、NVDA、AAPL、MSFT |

Glance 还支持任意 RSS、YouTube channel／playlist、Reddit、GitHub repository／releases、Twitch、JSON Custom API 和 Extension；这些都是通用能力，仓库无法穷举用户部署时添加的来源。[连接器文档](https://github.com/glanceapp/glance/blob/91324e8de762702e97b0ac5c8e36271d644d8642/docs/configuration.md)

连接器文档中还有 Bloomberg、Fox Business、更多 Reddit/Twitch/GitHub/GitLab/Codeberg/Docker Hub 的演示值；这些是“如何配置”的示例，不属于 `docs/glance.yml` 预配置，不能合并成默认启用来源。Yahoo Finance 5 个代码是行情数据，不属于 Vault AI 资讯流候选。

## 4. 跨仓库去重结果

去重单位不是“开源项目”，而是 `逻辑发布者 + 频道类型 + 标准化标识`。同一发布者的博客、X、YouTube、播客是不同频道，不能因为发布者相同就删除；同一条内容被不同聚合器重复发现时才合并。

| 重合逻辑来源 | 出现位置 | 去重方式 |
|---|---|---|
| Hacker News | TrendRadar RSS、Horizon API、Glance community | 一个逻辑社区来源；可保留多个连接器作为替代路径，按 HN item ID／URL 去重 |
| Simon Willison | Horizon RSS、BestBlogs 文章；BestBlogs X | Atom URL 合并为一个博客频道；X 保留为另一个频道 |
| 阮一峰网络日志 | TrendRadar、BestBlogs | 两个 Feed URL 指向同一博客；统一发布者，按 canonical article URL 去重 |
| `r/MachineLearning` | Horizon；CloudFlare 可能经动态 Reddit List 命中 | 固定 subreddit 可登记；外部 List 只有导出成员后才能判断重复 |
| `@karpathy` | Horizon、follow-builders、BestBlogs | 一个 X 频道；采集器命中同一 post ID 只留一条 |
| `@ylecun` | Horizon、BestBlogs | 同上 |
| `@_catwu`、`@amasad`、`@rauchg`、`@alexalbert__`、`@sama`、`@claudeai` | follow-builders、BestBlogs | 按小写 handle 合并；显示名差异不新建来源 |
| Anthropic／Claude | follow-builders 博客、BestBlogs 文章／视频／X | 统一机构实体；Engineering、News、Claude Blog、YouTube、X 保留为不同频道 |
| Latent Space | follow-builders podcast、BestBlogs 文章／X | 统一节目／出版者实体；Feed 与 X 为不同频道；节目条目按 GUID/canonical URL 去重 |
| No Priors | follow-builders podcast、BestBlogs YouTube | 同一节目不同载体，均保留；同一期按标题、发布日期和节目 GUID 归并 |
| GitHub Trending | CloudFlare 代理、PrismFlow 直抓、Horizon OSS Insight（相近但非同一榜单） | GitHub Trending 直抓为一个趋势入口；第三方榜单保留连接器来源，不重复算发布者证据 |
| 量子位、机器之心、新智元 | BestBlogs、CloudFlare/Folo | 统一中文媒体发布者；优先原站或可审计 Feed，Folo/Wechat2RSS 仅为连接器 |
| Hugging Face | BestBlogs Blog/X、CloudFlare Papers | 机构博客、X 与 Daily Papers 是不同频道；论文原作者／ArXiv 才是论文原始发布者 |

follow-builders 的 26 个 X 账号与 BestBlogs 的 160 个 X 账号精确交集为 7 个：`karpathy`、`_catwu`、`amasad`、`rauchg`、`alexalbert__`、`sama`、`claudeai`。Horizon 的两个 X 示例 `karpathy`、`ylecun` 均已在 BestBlogs 中出现。

## 5. 对 Vault 自建采集层的约束

每个来源登记为：

```tex
publisher_id
publisher_name
publisher_role
channel_type
channel_identifier
canonical_home_url
connector_type
connector_endpoin
discovered_from
is_aggregator
requires_auth
repository_evidence_url
repository_snapshot_sha
```

实施规则：

1. 固定清单中的所有启用频道在每个采集周期遍历；本研究的分组不改变频率。
2. 原站 Feed、官方 API 或官方频道优先；RSSHub、Wechat2RSS、XGo、Folo、NewsNow、BestBlogs API 作为可替换发现／传输连接器。
3. 聚合器返回的每条资讯必须保存 `original_url` 和实际 `original_publisher`；聚合器不能算第二个事实来源。
4. 外部 List 只有在导出成员并固化到 Vault 注册表后才可投入生产。列表成员变化需要形成差异，不得静默扩张信源范围。
5. “仓库中存在配置”只证明可复现声明；实时 HTTP 可达、认证、限流、响应格式和最近更新时间需要由独立可用性审计持续检查。

## 6. 无法仅靠这些仓库完成的核查

- CloudFlare 旧版 6 个单 Feed 的真实 Folo Feed ID 未公开。
- CloudFlare 4 个 Folo List 的成员不在 Git 中，且可能随外部服务变化。
- PrismFlowAgent、Horizon、Glance 的通用连接器允许用户任意扩展，部署态来源不可能由上游仓库穷举。
- X 官方 API、XGo、Folo、LWN、pod2txt 等依赖认证、付费、代理或第三方服务；仓库声明不保证当前凭证和服务状态。
- Google News、GDELT、NewsNow、GitHub Trending 等返回集合会动态变化；能审计的是查询／入口，不是未来条目全集。

这些项目的价值是提供“已经整理的固定目录”和“连接器实现线索”。Vault 最终必须维护自己的来源注册表和探测结果，不能把任何一个外部项目或动态列表当作来源真相数据库。

## 附录 A：BestBlogs 固定来源名称全集

以下清单逐项对应固定提交中的 OPML；精确 Feed URL、channel ID 或 XGo token 以四份 OPML 证据为准。

### A.1 文章（170）

人人都是产品经理；量子位；LangChain Blog；Hugging Face Blog；AWS Machine Learning Blog；Engineering at Meta；Microsoft Azure Blog；Elastic Blog；Grafana Labs；宝玉的分享；掘金本周最热；deeplearning.ai；腾讯技术工程；ByteByteGo Newsletter；Google Cloud Blog；Last Week in AI；Next.js Blog；David Heinemeier Hansson；Google DeepMind Blog；Martin Fowler；AWS Architecture Blog；Spring Blog；UX Magazine；The JetBrains Blog；Microsoft Research Blog；InfoQ；Smashing Magazine；机器之心；爱范儿；The IntelliJ IDEA Blog；阮一峰的网络日志；The GitHub Blog；freeCodeCamp.org；OpenAI Blog；MongoDB Blog；Databricks；Visual Studio Blog；Google Developers Blog；Node.js Blog；Docker；阿里技术；小米技术；哔哩哔哩技术；阿里云开发者；字节跳动技术团队；极客公园；美团技术团队；Stack Overflow Blog；Vercel News；The Cloudflare Blog；ShowMeAI研究中心；奇舞精选；京东技术；硅谷科技评论；得物技术；百度Geek说；大淘宝技术；Web3天空之城；AI前线；新智元；51CTO技术栈；优设；前端充电宝；稀土掘金技术社区；腾讯云开发者；体验进阶；前端早读课；开源服务指南；dbaplus社群；超人的电话亭；Qunar技术沙龙；42章经；随机小分队；阿里研究院；深思圈；Hugging Face；创业邦；Founder Park；vivo互联网技术；歸藏的AI工具箱；Clip设计夹；The Keyword (blog.google)；腾讯科技；InfoQ 中文；LlamaIndex Blog；Dify；海外独角兽；CSDN；谷歌开发者；赛博禅心；笔记侠；小红书技术REDtech；智谱；月之暗面 Kimi；通义大模型；百度AI；HelloGitHub；经纬创投；腾讯混元；Qdrant；刘润；吴晓波频道；智东西；腾讯研究院；SuperTechFans；有机大橘子；Thoughtworks洞见；浮之静；数字生命卡兹克；AI产品黄叔；印记中文；真格基金；大模型智能；甲子光年；Z Potentials；深网腾讯新闻；AI炼金术；白鲸出海；硅星人Pro；AI科技评论；山行AI；魔搭ModelScope社区；强少来了；土猛的员外；暗涌Waves；夕小瑶科技说；DeeplearningAI；机器之心SOTA模型；阶跃星辰；快手技术；DeepSeek；字节跳动Seed；十字路口Crossing；青哥谈AI；AI Musings by Mu；Latent Space；AI寒武纪；MiniMax 稀宇科技；Jina AI；花叔；Datawhale；AINLP；Groq；ElevenLabs Blog；FireCrawl Blog；Gino Notes；向阳乔木推荐看；Simon Willison's Weblog；乌鸦智能说；yikai 的摸鱼笔记；李继刚；沃垠AI；L先生说；有新Newin；晚点LatePost；袋鼠帝AI客栈；AI科技大本营；卡尔的AI沃茨；逛逛GitHub；阿真Irene；网易科技；架构师之路；硅谷101；Anthropic News；AI at Meta Blog；少数派；语言即世界language is world；刘小排r；Elevate；43 Talks。

### A.2 播客（30）

What's Next｜科技早知道；无人知晓；硅谷101；三五环；张小珺Jùn｜商业访谈录；42章经；十字路口Crossing；知行小酒馆；纵横四海；乱翻书；OnBoard!；硬地骇客；AI炼金术；人民公园说AI；保持偏见；枫言枫语；屠龙之术；晚点聊 LateTalk；开始连接LinkStart；此话当真；跨国串门儿计划；卫诗婕｜商业漫谈Jane's talk；东腔西调；皮蛋漫游记；奇想驿 by 产品沉思录；牛油果烤面包；半拿铁｜商业沉浮录；自习室 STUDY ROOM；天真不天真；罗永浩的十字路口。

### A.3 视频（40）

Anthropic；AI Engineer；No Priors；OpenAI；Google DeepMind；leerob；Y Combinator；Lenny's Podcast；Sequoia Capital；Stripe；Fireship；Spring I/O；Dwarkesh Patel；Lex Fridman；Hung-yi Lee；a16z；The Diary Of A CEO Clips；AI Master；Matt Wolfe；AICodeKing；Liam Ottley；Wes Roth；Andrej Karpathy；Jason West；Greg Isenberg；My First Million；Riley Brown；Tina Huang；Last Week in AI；All-In Podcast；AI Explained；Two Minute Papers；Matthew Berman；freeCodeCamp.org；ByteByteGo；Product School；yobi321；TED；LangChain；Siraj Raval。

### A.4 X（160）

OpenAI `@OpenAI`；OpenAI Developers `@OpenAIDevs`；ChatGPT `@ChatGPTapp`；Sam Altman `@sama`；Anthropic `@AnthropicAI`；Dario Amodei `@DarioAmodei`；Alex Albert `@alexalbert__`；Greg Brockman `@gdb`；Mike Krieger `@mikeyk`；Kevin Weil `@kevinweil`；Marc Andreessen `@pmarca`；Microsoft Research `@MSFTResearch`；Andrej Karpathy `@karpathy`；Google AI `@GoogleAI`；Yann LeCun `@ylecun`；Anton Osika `@antonosika`；Lovable `@lovable_dev`；Fei-Fei Li `@drfeifei`；Amjad Masad `@amasad`；Replit `@Replit`；Clement Delangue `@ClementDelangue`；Hugging Face `@huggingface`；Andrew Ng `@AndrewYNg`；DeepLearning.AI `@DeepLearningAI`；Thomas Wolf `@Thom_Wolf`；Logan Kilpatrick `@OfficialLoganK`；Lex Fridman `@lexfridman`；Rowan Cheung `@rowancheung`；李继刚 `@lijigang_com`；Demis Hassabis `@demishassabis`；bolt.new `@boltdotnew`；Mustafa Suleyman `@mustafasuleyman`；Sualeh Asif `@sualehasif996`；Junyang Lin `@JustinLin610`；Qwen `@Alibaba_Qwen`；Binyuan Hui `@huybery`；Google DeepMind `@GoogleDeepMind`；NVIDIA AI `@NVIDIAAI`；Ian Goodfellow `@goodfellow_ian`；Groq `@GroqInc`；Berkeley AI Research `@berkeley_ai`；Jeff Dean `@JeffDean`；Justine Moore `@venturetwins`；Scott Wu `@ScottWu46`；Cognition `@cognition_labs`；Weaviate `@weaviate_io`；Runway `@runwayml`；AI at Meta `@AIatMeta`；Stanford AI Lab `@StanfordAILab`；Geoffrey Hinton `@geoffreyhinton`；Patrick Loeber `@patloeber`；Philipp Schmid `@_philschmid`；Milvus `@milvusio`；Jina AI `@JinaAI_`；Justin Welsh `@thejustinwelsh`；Midjourney `@midjourney`；Cohere `@cohere`；Qdrant `@qdrant_engine`；AI Engineer `@aiDotEngineer`；Latent.Space `@latentspacepod`；Character.AI `@character_ai`；ElevenLabs `@elevenlabsio`；Taranjeet `@taranjeetio`；mem0 `@mem0ai`；HeyGen `@HeyGen_Official`；Paul Couvert `@itsPaulAi`；LangChain `@LangChainAI`；Harrison Chase `@hwchase17`；Recraft `@recraftai`；Perplexity `@perplexity_ai`；Aravind Srinivas `@AravSrinivas`；LlamaIndex `@llama_index`；Jerry Liu `@jerryjliu0`；Dify `@dify_ai`；Julien Chaumond `@julien_c`；Ollama `@ollama`；FlowiseAI `@FlowiseAI`；Pika `@pika_labs`；xAI `@xai`；Ideogram `@ideogram_ai`；Mistral AI `@MistralAI`；OpenRouter `@OpenRouterAI`；v0 `@v0`；AI SDK `@aisdk`；Fish Audio `@FishAudio`；Hailuo AI `@Hailuo_AI`；Windsurf `@windsurf_ai`；Varun Mohan `@_mohansolo`；宝玉 `@dotey`；ManusAI `@ManusAI_HQ`；AK `@_akhaliq`；LovartAI `@lovart_ai`；Figma `@figma`；Cursor `@cursor_ai`；Aman Sanger `@amanrsanger`；Eric Zakariasson `@ericzakariasson`；Satya Nadella `@satyanadella`；Genspark `@genspark_ai`；orange.ai `@oran_ge`；Barsee `@heyBarsee`；Hunyuan `@TXhunyuan`；NotebookLM `@NotebookLM`；Google AI Developers `@googleaidevs`；Sundar Pichai `@sundarpichai`；Google Gemini App `@GeminiApp`；Eric Jing `@ericjing_ai`；Lenny Rachitsky `@lennysan`；Jim Fan `@DrJimFan`；Notion `@NotionHQ`；Akshay Kothari `@akothari`；AI Breakfast `@AiBreakfast`；DeepSeek `@deepseek_ai`；歸藏 `@op7418`；Dia `@diabrowser`；Skywork `@Skywork_ai`；Naval `@naval`；Aadit Sheth `@aaditsh`；小互 `@imxiaohu`；Cat Wu `@_catwu`；Augment Code `@augmentcode`；向阳乔木 `@vista8`；Fellou `@FellouAI`；Kling AI `@Kling_ai`；Firecrawl `@firecrawl_dev`；Poe `@poe_platform`；LM Arena `@lmarena_ai`；Replicate `@replicate`；a16z `@a16z`；Y Combinator `@ycombinator`；Lilian Weng `@lilianweng`；Paul Graham `@paulg`；Guillermo Rauch `@rauchg`；Andrew Chen `@andrewchen`；Arthur Mensch `@arthurmensch`；Simon Willison `@simonw`；Browser Use `@browser_use`；AI Will `@FinanceYF5`；Ray Dalio `@RayDalio`；Sahil Lavingia `@shl`；Elvis `@omarsar0`；The Rundown AI `@TheRundownAI`；Nick St. Pierre `@nickfloats`；Monica `@hey_im_monica`；Fireworks AI `@FireworksAI_HQ`；Meng Shao `@shao__meng`；Jan Leike `@janleike`；Richard Socher `@RichardSocher`；Gary Marcus `@GaryMarcus`；Adam D'Angelo `@adamdangelo`；Suhail `@Suhail`；AI产品黄叔 `@PMbackttfuture`；GitHub `@github`；idoubi `@idoubicc`；Claude `@claudeai`；Martin Fowler `@martinfowler`；Viking `@vikingmute`；Geek `@geekbb`；Tw93 `@HiTw93`；Yangyi `@Yangyixxxx`；hidecloud `@hidecloud`。
