# Vault2077 当前信源清单与无浏览器采集审计

> 审计快照：`config/source-registry.json`（475 个逻辑信源、486 个候选端点）与当前 `config/source-bundle.json`。本文统计的是当前文件状态，不代表未来准入数量。

## 一、结论

当前清单已经在规则层面纠正为：**不按内容语言排除信源，只排除中国大陆原始发布平台；X、GitHub、Reddit 等国际平台上的中文内容可以采集。** 当前 active 中就保留了 7 个标注为中文的 X 信源，包括宝玉、歸藏、李继刚、向阳乔木、小互、AI产品黄叔和 DeepSeek。YouTube 另因视频下载、转写和摘要超出产品范围而整体删除，与内容语言无关。

境外采集器目前不需要浏览器。运行代码先通过受限 Python HTTP 客户端读取公网 HTTPS 响应，再使用 `feedparser` 解析 Feed 或标准库解析 JSON；依赖中没有 Playwright、Selenium、Puppeteer 或浏览器运行时。四个 HTML 类候选端点已经被强制留在 pending：GitHub Trending 页面、Anthropic Engineering 页面、Claude Blog 页面和 Telegram 公开页面。

但当前 201 个 active 信源并不等于 201 个同等可靠的信源：

- 160 个（79.6%）是通过 `api.xgo.ing` 转成 RSS 的 X 账号，形成严重的单点集中风险。
- 37 个（18.4%）可视为直接连接第一方 Feed 或第一方结构化 API 的稳定核心。
- 另外 4 个依赖第三方结构化服务：OSS Insight 3 个、RSSHub 1 个。
- 当前没有任何 MCP 信源。MCP 不是当前采集必需品；若底层已有 RSS 或 HTTP API，直接调用更轻。

因此，当前清单适合作为“候选池和影子运行清单”，尚不适合原样定义正式生产信源。正式境外采集器应坚持 **Feed/API only**，并优先消除 XGo 的集中依赖。

## 二、总账

| 状态 | 数量 | 含义 |
| --- | ---: | --- |
| Active | 201 | 已有可用、受支持且通过来源准入的机器接口 |
| Pending | 255 | 来源不准入、端点不可用、身份未核实、需认证，或接口类型被禁止 |
| Excluded from bundle | 19 | 9 个市场数据、6 个 Twitch、4 个运行时动态列表；不属于本期资讯集合 |
| Registry total | 475 | Active + Pending + Excluded，逻辑信源去重后的总数；不包含 44 个已删除的 YouTube 频道 |
| Candidate endpoints | 486 | 部分逻辑信源拥有多个端点 |
| Unresolved discoveries | 19 | 仓库只给出动态列表 ID、环境变量或泛型适配器，无法还原为确定信源；不计入 475 |

Active 的传输形式为 183 个 RSS/Atom/Feed（91.0%）和 18 个 JSON/HTTP 结构化接口（9.0%）。当前选中的 active 端点均不要求凭据；这不代表正式运行不应使用凭据，例如 GitHub 官方建议用认证提高 REST API 限额。[GitHub REST API 限额说明](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)

## 三、Active 信源构成

| 原始平台或类型 | 数量 | 当前入口 | 我方需要浏览器 | 认证 | 判断 |
| --- | ---: | --- | --- | --- | --- |
| X | 160 | XGo RSS | 否 | 当前否 | 内容价值高，但 160 个全部依赖同一非官方中介，不能作为稳态方案 |
| 独立媒体、公司和个人文章 | 20 | 19 个直接 RSS/Atom + 1 个 RSSHub | 否 | 否 | 19 个直接 Feed 可进入稳定核心；Anthropic News 的 RSSHub 路由应替换或降级 |
| GitHub Releases | 11 | GitHub REST API | 否 | 公共仓库可不认证 | 适合 GitHub Actions；应使用 `GITHUB_TOKEN` 提高限额 |
| GitHub 用户公开事件 | 2 | GitHub REST API | 否 | 公共事件可不认证 | 可用，但官方说明事件可能延迟 30 秒至 6 小时，不应当作实时流 |
| GitHub 趋势 | 3 | OSS Insight JSON API | 否 | 否 | 结构化且轻量，但属于第三方趋势聚合，不是 GitHub 第一方接口 |
| 播客 | 3 | Megaphone/Simplecast RSS | 否 | 否 | 标准 Feed，适合直接保留 |
| 社区 | 2 | Hacker News Firebase JSON、Lobsters JSON | 否 | 否 | 第一方机器接口，适合直接保留 |

GitHub 的发布接口允许公开读取公共仓库 releases，[官方 Releases API](https://docs.github.com/en/rest/releases/releases)；用户公开事件也有正式端点，但并非实时接口，[官方 Events API](https://docs.github.com/en/rest/activity/events)。Hacker News 官方 API 直接提供 `topstories` 和逐条 `item` JSON，[官方 API 仓库](https://github.com/HackerNews/API/blob/master/README.md)。

### 3.1 直接稳定核心：37 个

这 37 个不依赖 XGo、RSSHub 或 OSS Insight：

- 22 个直接 Feed：19 个文章/官方博客 Feed，3 个播客 Feed；
- 13 个 GitHub 官方 API：11 个 releases，2 个用户公开事件；
- 2 个社区 JSON：Hacker News 与 Lobsters。

文章 Feed 包括 OpenAI Blog、Google DeepMind Blog、AWS Machine Learning Blog、Meta Engineering、Microsoft Azure Blog、GitHub Blog、Cloudflare Blog、Vercel、Next.js、Docker、Databricks、Last Week in AI、Latent Space、Simon Willison 等。具体端点以 `config/source-bundle.json` 为唯一运行清单。

### 3.2 第三方机器接口：164 个

| 服务 | 数量 | 风险 |
| --- | ---: | --- |
| `api.xgo.ing` | 160 | 单一域名承载 79.6% active；接口虽为 RSS，但上游抓取方式、限流和持续性不受我们控制 |
| `api.ossinsight.io` | 3 | 只承担趋势发现；失效不会影响原始资讯主干，但结果属于二次聚合 |
| `rsshub.bestblogs.dev` | 1 | Anthropic News；接口为 RSS，但并非发布方提供，应替换为官方接口或删除 |

“我方不使用浏览器”与“第三方服务内部是否使用网页抓取”是两回事。XGo/RSSHub 对 GitHub Actions 暴露的是规范 Feed，因此不会给我们的 runner 增加浏览器依赖；但它们仍然是不可控中介，不应与第一方 Feed/API 混为同一可靠性级别。

### 3.3 内容语言

| Active 标注语言 | 数量 |
| --- | ---: |
| Unknown | 141 |
| English | 53 |
| Chinese | 7 |

语言字段只用于显示、翻译和模型路由，不用于来源准入。来源准入看的是**原始发布平台**：X 上的中文可以；微信公众号、知乎、微博、小红书、小宇宙等大陆平台不可以。

## 四、Pending 信源构成

### 4.1 按原因

| Pending 原因 | 数量 | 处理结论 |
| --- | ---: | --- |
| 大陆原始平台 | 158 | 永久不启用 |
| 没有验证成功的可用端点 | 48 | 只允许重新验证 Feed/API；不得用浏览器绕过 |
| 独立发布方地域未核实 | 43 | 人工核实原始发布平台后再决定，不按内容语言判断 |
| 非结构化 HTML 连接器被禁止 | 4 | 永久保持 pending，除非发布方提供 Feed/API |
| 大陆直接发布方 | 2 | 永久不启用 |

被明确排除的 160 个大陆来源由以下几类组成：

- 117 个微信公众号 Feed 代理（115 个 `wechat2rss.bestblogs.dev`、2 个 `wechat2rss.xlab.app`）；
- 30 个小宇宙播客 RSSHub 路由；
- 11 个 NewsNow 大陆热榜：百度、B 站、财联社、抖音、凤凰、澎湃、贴吧、头条、华尔街见闻、微博、知乎；
- 2 个大陆直接发布方 Feed：量子位、美团技术团队。

这些端点即使技术上是 RSS 或 JSON，也不会因为“接口规范”而获得准入。**接口是否合法运行与来源是否符合产品策略是两道独立门禁。**

### 4.2 按内容渠道

| 类型 | Pending 数量 | Browser-free 路径 |
| --- | ---: | --- |
| 文章 | 169 | 只接受发布方 RSS/Atom/JSON Feed；未知地域先核实 |
| 播客 | 33 | 优先节目官方 RSS；其中小宇宙来源直接排除 |
| X | 19 | 当前只有需认证的 X API 候选端点；取得凭据后才启用 |
| Reddit | 15 | 当前公开 JSON 验证失败；应走 Reddit 正式 OAuth Data API，不做页面抓取 |
| 热榜 | 11 | 全部为大陆平台，永久排除 |
| GitHub 趋势 | 3 | 两个 JSON 端点待恢复；HTML Trending 页面禁止 |
| 新闻搜索 | 2 | GDELT JSON / Google News Feed 可重新验证；不转为网页搜索爬虫 |
| 官方博客 | 2 | Anthropic Engineering、Claude Blog 目前只有 HTML 索引，保持 pending |
| Telegram | 1 | 当前只有公开 HTML 页面，保持 pending；除非改成 Telegram API 或规范 Feed |

YouTube 频道不再作为 pending 保存，而是在注册表生成阶段直接丢弃。视频描述中如包含官方文章、论文或仓库，只能将这些文本端点作为独立来源重新登记。Reddit 明确要求使用其提供的 OAuth Access Info，并可能对商业使用、保留和再分发设置额外条件，因此在凭据与用途审查完成前应继续 pending。[Reddit Data API Terms](https://redditinc.com/policies/data-api-terms)。

## 五、认证需求

当前 active 选择的 201 个端点均可匿名访问，但正式方案仍建议设置三个可选 GitHub Actions Secret：

- `GITHUB_TOKEN`：GitHub releases/events，降低匿名 60 次/小时的限制风险；
- `X_BEARER_TOKEN`：若用 X 官方 API 替换 XGo；X 官方用户时间线支持 App-only 或 User Context，但 X API 端点需要认证。[X 时间线集成说明](https://docs.x.com/x-api/posts/timelines/integrate)、[X API 认证说明](https://docs.x.com/x-api/posts/lookup/integrate)

Reddit 凭据不建议在 MVP 默认启用：除技术认证外，还需要确认 Vault2077 的商业使用、内容保留、LLM 摘要和展示方式符合其最新条款。

GitHub Actions 支持 repository/environment secrets，并建议最小权限；定时工作流可以使用 cron，但官方说明高负载时可能延迟或丢弃排队任务。因此四个传输时点前应提前启动采集，而不是把 cron 精确设在 06:00、12:00、18:00、24:00。[Actions Secrets](https://docs.github.com/en/actions/concepts/security/secrets)、[Scheduled workflow 限制](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

## 六、无浏览器采集器的准入规则

每个 runtime connector 必须属于以下白名单之一：

1. 第一方 RSS 2.0、Atom 或 JSON Feed；
2. 第一方、公开文档化的 HTTP JSON API；
3. 需要 token 但可在 GitHub Actions 中无交互调用的正式 API；
4. 经人工批准的远程结构化服务；
5. 真正提供结构化内容的远程 MCP endpoint，但只有在其比直接 API 更稳定时才采用。

永久禁止进入境外 runtime：

- Playwright、Selenium、Puppeteer、Chromium 和无头浏览器；
- HTML 列表页、DOM selector、登录态 Cookie、二维码或人工验证码；
- BeautifulSoup/Cheerio 等非结构化页面抓取，即使不启动浏览器；
- 因页面改版需要持续修 selector 的适配器；
- 为绕过大陆平台限制而生成的公众号、知乎、微博、小红书、小宇宙等代理 Feed。

当前 `config/source-bundle.json` 已满足“active 中无 HTML connector”，但 **XGo/RSSHub 只满足接口形态，不满足第一方稳定性**。

这里也明确限制了对 Horizon 的复用边界。不能整包采用下列实现：

- Horizon Reddit 适配器会优先请求 `old.reddit.com` HTML，再尝试 JSON/RSS；[固定提交源码](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/src/scrapers/reddit.py)
- Horizon 的一种 X 方案通过 Apify actor 获取数据，需要 `APIFY_TOKEN`；[固定提交源码](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/src/scrapers/twitter.py)
- Horizon 另有 Playwright、登录 Cookie 和 Chromium 方案，明确禁止；[固定提交源码](https://github.com/Thysrael/Horizon/blob/1e2fdc7ccb177f33c59aef2082c4093e1e82b22c/src/scrapers/twitter_playwright.py)
- Horizon 的正文增强会继续下载并解析文章 HTML，境外“原样抓取”模式不启用。

可复用的是它的 adapter 接口与 RSS/HTTP 调度思想，不是上述具体抓取器。当前 Vault collector 自身没有这些浏览器或 HTML 抓取代码。

## 七、建议的生产切分

### P0：直接上线的 37 个核心信源

第一方 Feed、GitHub 官方 API、Hacker News/Lobsters 结构化 JSON。它们最符合 GitHub Actions 的无状态、短任务、无浏览器运行方式。

### P1：修复后加入

- 43 个来源地域未知但接口已可用的独立发布方：核实原始平台后逐个加入；
- 失败的国际文章与播客 Feed：只修 URL 或替换为第一方 Feed；
- 19 个 X 官方 API 候选，以及未来从现有 160 个账号转换出的官方 X API source。

### P2：可保留作影子输入，但不得成为唯一通路

- XGo 160；
- OSS Insight 3；
- RSSHub 1。

如果 X 官方 API 的成本或配额不可接受，可以暂时运行 XGo，但必须单独统计其成功率，并允许整类失败而不拖垮本轮任务。它不能被表述为“160 个独立可靠信源”，而应表述为“一个第三方传输服务承载的 160 个逻辑频道”。

## 八、来源仓库贡献

Active 渠道的发现出处（可重复，因此合计大于 201）：

| 上游仓库 | Active 中出现 | Pending 中出现 | 说明 |
| --- | ---: | ---: | --- |
| `ginobefun/BestBlogs` | 180 | 180 | 当前最大来源，亦带来了全部 XGo 高集中依赖和大量大陆代理 Feed；其 40 个视频频道已删除 |
| `Thysrael/Horizon` | 16 | 28 | 提供 GitHub、HN、RSS、Reddit、X 等多种候选 |
| `zarazhangrui/follow-builders` | 10 | 24 | 以人物、博客和官方页面为主 |
| `glanceapp/glance` | 6 | 7 | 提供 Feed、社区和结构化组件候选；其 5 个视频频道已删除 |
| `sansan0/TrendRadar` | 0 | 12 | 11 个大陆热榜被排除，另一项未形成 active |
| `justlovemaki/PrismFlowAgent` | 0 | 3 | 包含 HTML Trending 等不允许的连接器 |
| `justlovemaki/CloudFlare-AI-Insight-Daily` | 0 | 1 | 依赖动态 Folo 状态或未公开 Feed ID，不能直接运行 |

固定提交和逐个端点证据记录在 `config/source-registry.json`；生产任务只读取 `config/source-bundle.json`，不得在运行时自动发现并启用新来源。

## 九、最终判断

清单并不需要推倒重来，但应从“201 个 active”改成更诚实的三层认识：

- **37 个直接稳定核心**；
- **4 个第三方结构化补充**；
- **160 个由一个 XGo 通道承载的高价值但高集中风险的 X 频道**。

境外抓取器保持独立、无状态、无浏览器是完全可行的。下一步不是增加更多媒介类型，而是评估用 X 官方 API 逐步替换 XGo。其余只要没有规范机器接口，就继续 pending，不为扩大数量引入浏览器，也不接入视频下载、字幕抓取或语音识别链路。
