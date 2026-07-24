# Vault2077：Glance 信源吸收审计

> 审计对象：`glanceapp/glance` 固定提交 [`91324e8de762702e97b0ac5c8e36271d644d8642`](https://github.com/glanceapp/glance/tree/91324e8de762702e97b0ac5c8e36271d644d8642)
> 本地对照：`config/source-registry.json`（475 个逻辑信源、486 个端点）与 `config/source-bundle.json`（201 active、255 pending）
> 审计口径：只把上游固定配置中具名、可定位的发布方或数据目标视为“具体信源”；通用连接器能力和文档演示值单列，不自动进入生产清单。

## 1. 结论

Glance 的示例配置已经被系统逐项检查，但没有被无条件照搬。

- 上游 [`docs/glance.yml`](https://github.com/glanceapp/glance/blob/91324e8de762702e97b0ac5c8e36271d644d8642/docs/glance.yml) 一共列出 **24 个内容目标、5 个行情目标和 1 个天气位置**。
- 删除所有 YouTube 来源后，本地登记了其中 **24 个非 YouTube 具体目标**：6 个 active、7 个 pending、11 个因不属于 Vault AI 资讯而留在 bundle 外。
- Glance 的 5 个 YouTube channel 仍可从固定上游配置追溯，但已被产品范围门禁从注册表和 bundle 彻底删除。
- 天气示例只给出地点 `London, United Kingdom`，本地作为 unresolved 证据保留，不把地点伪装成内容发布方。
- Glance 的抓取代码本身没有使用 Playwright、Selenium 或浏览器自动化；但“无浏览器”不等于“适合生产”。Twitch 使用未文档化的站内 GraphQL，Reddit 的未认证路径在 VPS 上不可靠，均不能直接照搬。

更重要的是：Glance 是通用个人仪表盘，不是 AI 资讯源策展项目。它示例中的 Gitea、Immich、Syncthing、前端技术博客、Twitch 和行情仅用于演示组件。**被技术性登记不等于应该成为 Vault 信息流的生产信源。**

## 2. `docs/glance.yml` 逐项对照

### 2.1 已进入 active：6 个

| 上游目标 | 类型 | 本地连接器 | 是否需要浏览器 | 当前判断 |
| --- | --- | --- | --- | --- |
| Hacker News | 社区 | Firebase JSON API | 否 | active；可作为发现线索，不是原始事实来源 |
| Lobsters | 社区 | `hottest.json` | 否 | active；可作为开发者社区线索 |
| `glanceapp/glance` | GitHub Release | GitHub REST API | 否 | active；接口可靠，但与 AI 主线相关性弱 |
| `go-gitea/gitea` | GitHub Release | GitHub REST API | 否 | active；接口可靠，但与 AI 主线相关性弱 |
| `immich-app/immich` | GitHub Release | GitHub REST API | 否 | active；接口可靠，但不属于 AI 核心信源 |
| `syncthing/syncthing` | GitHub Release | GitHub REST API | 否 | active；接口可靠，但不属于 AI 核心信源 |

Glance 的 Hacker News 实现直接请求 Firebase API；Lobsters 直接请求 JSON；Releases 直接请求 GitHub API，源码证据分别见 [`widget-hacker-news.go`](https://github.com/glanceapp/glance/blob/91324e8de762702e97b0ac5c8e36271d644d8642/internal/glance/widget-hacker-news.go#L79-L100)、[`widget-lobsters.go`](https://github.com/glanceapp/glance/blob/91324e8de762702e97b0ac5c8e36271d644d8642/internal/glance/widget-lobsters.go#L112-L138) 和 [`widget-releases.go`](https://github.com/glanceapp/glance/blob/91324e8de762702e97b0ac5c8e36271d644d8642/internal/glance/widget-releases.go#L214-L229)。

### 2.2 已登记但留在 pending：7 个

| 上游目标 | 类型 | 本地端点 | Pending 原因 | 是否需要浏览器 |
| --- | --- | --- | --- | --- |
| selfh.st | RSS | `https://selfh.st/rss/` | 发布方地域尚未完成核实 | 否 |
| ciechanow.ski | Atom | `https://ciechanow.ski/atom.xml` | 发布方地域尚未完成核实 | 否 |
| Josh Comeau | RSS | `https://www.joshwcomeau.com/rss.xml` | 发布方地域尚未完成核实 | 否 |
| samwho.dev | RSS | `https://samwho.dev/rss.xml` | 发布方地域尚未完成核实 | 否 |
| Ahmad Shadeed | RSS | `https://ishadeed.com/feed.xml` | 发布方地域尚未完成核实 | 否 |
| `r/technology` | Reddit | 未认证 JSON 候选 | 没有验证通过的生产端点 | 否，但应改用获批的 OAuth Data API |
| `r/selfhosted` | Reddit | 未认证 JSON 候选 | 没有验证通过的生产端点 | 否，但应改用获批的 OAuth Data API |

这 5 个 Feed 都已验证为机器可读，Glance 的 RSS 实现也是普通 HTTP GET，并支持 ETag 与 `Last-Modified` 条件请求；见 [`widget-rss.go`](https://github.com/glanceapp/glance/blob/91324e8de762702e97b0ac5c8e36271d644d8642/internal/glance/widget-rss.go#L152-L213)。它们没有浏览器负担，但内容主要是自托管、Web/CSS 和计算机知识文章，并非天然适合 Vault 的 AI 事件流。因此即便完成地域核实，也应再过一次主题相关性门禁。

Glance 官方文档明确说明 Reddit 未认证请求在 VPS 上可能返回 403，并支持应用认证；见 [`configuration.md` 的 Reddit 章节](https://github.com/glanceapp/glance/blob/91324e8de762702e97b0ac5c8e36271d644d8642/docs/configuration.md#reddit)。本地没有采用浏览器绕过，而是继续 pending。

### 2.3 已登记但不进入资讯 bundle：11 个

| 上游目标 | 数量 | 类型 | 不进入原因 | 接口判断 |
| --- | ---: | --- | --- | --- |
| `theprimeagen`、`j_blow`、`giantwaffle`、`cohhcarnage`、`christitustech`、`EJ_SA` | 6 | Twitch 直播状态 | 是直播在线元数据，不是可供 LLM 处理的文本资讯 | Glance 使用 Twitch 站内 GraphQL；无浏览器但非稳定公开接口 |
| SPY、BTC-USD、NVDA、AAPL、MSFT | 5 | Yahoo Finance 行情 | 是行情数据，不属于 Vault AI 资讯事件 | JSON 请求，无浏览器，但接口不是本项目需要的信源 |

Glance 的 Twitch 实现向 `https://gql.twitch.tv/gql` 发送 POST，并内置站内 Client ID，见 [`widget-twitch-channels.go`](https://github.com/glanceapp/glance/blob/91324e8de762702e97b0ac5c8e36271d644d8642/internal/glance/widget-twitch-channels.go#L133-L165) 与 [`widget-shared.go`](https://github.com/glanceapp/glance/blob/91324e8de762702e97b0ac5c8e36271d644d8642/internal/glance/widget-shared.go#L9-L10)。本地注册表只保留过“这个目标存在”的审计记录，若未来真要接 Twitch，也只能重新评估官方 Helix API，不能复制这条未文档化 GraphQL 链路。

行情由 Glance 请求 Yahoo Finance JSON 端点，源码见 [`widget-markets.go`](https://github.com/glanceapp/glance/blob/91324e8de762702e97b0ac5c8e36271d644d8642/internal/glance/widget-markets.go#L117-L136)。它不需要浏览器，但与 Vault 信息流的领域模型无关。

### 2.4 已删除、不得重新导入：5 个 YouTube 来源

| 上游目标 | 上游采集方式 | 本地状态 |
| --- | --- | --- |
| Linus Tech Tips | YouTube channel Atom Feed | 未登记 |
| Jeff Geerling | YouTube channel Atom Feed | 未登记 |
| Fireship | YouTube channel Atom Feed | 未登记 |
| Marques Brownlee | YouTube channel Atom Feed | 未登记 |
| Veritasium | YouTube channel Atom Feed | 未登记 |

Glance 确实不是通过浏览器发现视频，而是请求 YouTube Feed；见 [`widget-videos.go`](https://github.com/glanceapp/glance/blob/91324e8de762702e97b0ac5c8e36271d644d8642/internal/glance/widget-videos.go#L146-L166)。但 Feed 只提供视频元数据，不能解决正文、字幕、转写和摘要问题。基于 Vault 当前“文本优先、轻量境外采集器”的产品边界，这 5 个来源以及从其他项目发现的全部 YouTube 来源均已删除，而不是 pending。

### 2.5 Unresolved：1 个

| 示例 | 上游实现 | 本地状态 | 原因 |
| --- | --- | --- | --- |
| `London, United Kingdom` 天气 | Open-Meteo Geocoding + Forecast API | unresolved | 地点不是资讯发布方，天气不是 Vault AI 资讯 |

Glance 的天气组件使用 Open-Meteo 的结构化 HTTP API，见 [`widget-weather.go`](https://github.com/glanceapp/glance/blob/91324e8de762702e97b0ac5c8e36271d644d8642/internal/glance/widget-weather.go#L165-L178) 和 [`widget-weather.go`](https://github.com/glanceapp/glance/blob/91324e8de762702e97b0ac5c8e36271d644d8642/internal/glance/widget-weather.go#L213-L241)。它不需要浏览器，但不应被建模为内容信源。

## 3. Glance 的通用连接器能力：哪些没有被“吸收”

Glance 在固定提交中支持 29 种 widget；完整分派表见 [`widget.go`](https://github.com/glanceapp/glance/blob/91324e8de762702e97b0ac5c8e36271d644d8642/internal/glance/widget.go#L24-L88)。其中与外部内容或数据有关的能力需要分三类理解。

### 3.1 值得借鉴、但不能当成信源名单

| 能力 | Glance 做法 | Vault 当前情况 | 是否需要浏览器 |
| --- | --- | --- | --- |
| RSS/Atom | 任意 Feed、并发请求、缓存、ETag 去重 | 已吸收连接器思路，并登记 `glance.yml` 的 5 个具体 Feed | 否 |
| GitHub Releases | GitHub/GitLab/Codeberg/Docker Hub release 接口 | 当前只吸收 `glance.yml` 的 4 个 GitHub 仓库 | 否 |
| GitHub Repository | GitHub API 获取仓库、PR、Issue、Commit | 没有作为独立资讯源吸收；更适合未来 SiC 数据面 | 否 |
| Custom API | 对任意 JSON API 发请求并按模板渲染 | 没有把通用能力误记成具体来源；采集器本身已有结构化 HTTP 适配方向 | 否 |
| Extension | 请求第三方 Glance widget 响应 | 未吸收；返回 HTML 的扩展不符合 Vault 结构化输入规则 | 否，但可能返回 HTML，仍不合规 |
| ChangeDetection.io | 调用外部服务的 API | 未吸收；上游 watch 可能依赖网页监测，扩大系统复杂度 | Glance 侧否；外部服务未必 |

Glance 的 Repository widget 直接调用 GitHub REST API 获取仓库详情、PR、Issue 和 Commit，见 [`widget-repository.go`](https://github.com/glanceapp/glance/blob/91324e8de762702e97b0ac5c8e36271d644d8642/internal/glance/widget-repository.go#L114-L130)。这是一个可以借鉴的 API 模式，但它不等于新增了一批固定信源。

### 3.2 官方文档里的演示值没有自动进入清单

[`configuration.md`](https://github.com/glanceapp/glance/blob/91324e8de762702e97b0ac5c8e36271d644d8642/docs/configuration.md) 还用以下值讲解组件：

- RSS：Bloomberg Markets、Fox Business Markets、Fox Business Technology；
- Releases：Jellyfin、Codeberg Redict、GitLab F-Droid、Docker Hub Gotify 等；
- Custom API：Random Fact、Immich 本地实例统计、Steam Specials；
- Repository：`glanceapp/glance` 的 PR、Issue 与 Commit；
- 其他文档片段还包含若干 Reddit subreddit、书签和搜索引擎。

这些值是配置文档中的语法示例，不是 `docs/glance.yml` 的预配置内容，也不是 Glance 作者对资讯质量的推荐。当前本地注册表没有把它们批量导入，这是正确的。若某个来源后来因 Vault 的主题需要被采用，应以其第一方接口和独立审核记录进入，而不能把“出现在使用文档里”当作收录依据。

### 3.3 与资讯抓取无关的 widge

Calendar、Clock、Todo、Bookmarks、Search、iframe、HTML、Docker Containers、DNS Stats、Server Stats、Monitor 等是界面、运维或本地工具，不构成信息源。尤其 iframe、HTML 和书签只是浏览器端展示/跳转能力，不能转化为境外采集器的网页抓取器。

## 4. 是否完整吸收：严格回答

| 问题 | 回答 |
| --- | --- |
| `docs/glance.yml` 的具体目标是否逐项看过？ | 是。24 个内容目标、5 个行情目标、1 个天气位置均有明确去向。 |
| 非 YouTube 的具名目标是否已登记？ | 是。共 24 个：6 active、7 pending、11 bundle 外。 |
| YouTube 是否仍藏在 pending？ | 否。5 个 Glance YouTube 来源及其他项目发现的全部 YouTube 来源均已从 registry/bundle 删除。 |
| Glance 的通用 connector 是否全部复制？ | 否，也不应该。只吸收与 Vault 边界一致的结构化接口模式。 |
| 是否需要浏览器？ | 当前采用的 Glance 来源均不需要。未来也不应引入 DOM、Cookie、Playwright 或页面点击链路。 |
| Glance 是否显著补强了 AI 核心信源？ | 没有。它主要补充通用开发社区、个人技术博客和非 AI 开源项目；价值在接口范式，不在 AI 信源策展。 |

## 5. 建议

1. 保留 Hacker News 与 Lobsters 作为“发现层”，但事件事实必须回链到官方公告、论文、仓库或作者原文。
2. 对当前 active 的 Glance、Gitea、Immich、Syncthing Releases 再做一次主题相关性清理。接口合格不代表内容适合 AI 信息流。
3. 5 个个人技术 Feed 即便地域审核通过，也不要自动 active；先判断其 AI 内容密度。
4. Reddit 只有在官方 OAuth 接入获批后再评估，不开发 HTML 或匿名接口兜底。
5. 不接 Twitch、不接行情、不接天气、不恢复 YouTube。
6. 借鉴 Glance 的 ETag、`Last-Modified`、并发上限和缓存策略，但不要把 Glance 整体作为 Vault 境外采集器运行时。

综上，Glance 已经被完整“拆开检查”，但只被选择性吸收。当前最有价值的成果是确认了几种轻量结构化接口模式，而不是获得了一批高质量 AI 信源。
