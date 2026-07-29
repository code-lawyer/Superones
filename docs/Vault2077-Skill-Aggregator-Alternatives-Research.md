---
type: research
status: active
updated: 2026-07-28
---

# Vault2077：Skill 推荐、热门榜与聚合源替代方案研究

> 研究问题：GitHub 上是否已有比抓取 `skills.sh` HTML 更适合 Vault2077 的 Agent Skill 发现、推荐和热门聚合项目？
>
> 研究时间：2026-07-28。
>
> 证据范围：项目 README、源码、GitHub 仓库与提交元数据。除“当前维护状态”外，源码证据全部固定到具体 commit。
>
> 口径：本文的 Skill 指以 `SKILL.md` 为核心的 Agent Skills。仅有格式规范、单一厂商自有 Skill 集、普通 prompt 集、MCP server 目录，不算可替代的聚合器。

## 结论先行

**有更好的替代方式，但没有一个项目可以单独、完整地替代 `skills.sh`。**

`skills.sh` 当前同时承担了两个不同职责：

1. 发现有哪些 Skill；
2. 用安装量生成 All Time、Trending、Hot 榜。

GitHub 上最可靠的替代能力分散在不同项目中：

- **全网发现最值得采用：GitHub 官方 `gh skill search`。** 它直接搜索 GitHub 全站公开仓库中的 `SKILL.md`，支持 JSON 输出、仓库 Star、路径、namespace、description，并实现了相关性过滤与同名结果抑制。它不提供安装趋势，但很适合在 GitHub Actions 中作为主发现器。
- **真实 Skill 热度最值得采用：ClawHub 公共 API。** 它公开匿名 JSON API，支持 `downloads`、`stars`、`recommended` 和 `trending` 排序；其中 `trending` 明确定义为最近 7 天的安装量，安装量来自登录用户的 CLI 安装遥测。它是目前找到的最接近 `skills.sh` 榜单语义、同时又无需解析 HTML 的开源实现。
- **质量推荐 feed 最值得采用：`dmgrok/agent-plugins`。** 它每天从 46 个固定 provider 仓库重新聚合，直接发布 `catalog.json` 和按 quality、active、生态预过滤的 CDN JSON。质量分算法、维护状态、重复标注和 GitHub Actions 全部开源，特别适合无状态采集；但其 Star 是 provider 仓库 Star，同仓库下所有 Skill 共享，且没有真实安装趋势。
- **安全与来源补充最值得采用：Agent Skill Exchange 的静态 `skills.json`。** 它每天更新，可直接从 GitHub raw 文件读取，包含分类、验证状态、GitHub Star、npm 周下载量和许可证，且大部分条目经过可执行的安全模式扫描。但其“Top Downloaded”是底层 npm 包下载量，不是 Skill 安装量。
- **可做实验性第四信号：agentskill.sh 的公开 CLI API。** 它有 `installCount`、安全分、内容质量分、社区评分和 `section=trending`，但核心发现、排序和扫描后端没有开源，API 也没有稳定版文档，因此不能成为唯一生产依赖。

因此，Vault2077 最合适的不是“从 skills.sh 换到另一个单点”，而是：

```text
GitHub gh skill search / Code Search
              │
              ├── 广覆盖候选发现
              │
ClawHub API ──┼── 真实安装量、7 日趋势、社区 Star
              │
agent-plugins
              ├── 质量分、维护状态、重复标注、可信 provider
              │
ASE skills.json
              ├── 分类、来源、许可证、安全验证、上游信号
              │
可选 agentskill.sh API
              └── 第二套安装量、质量分和趋势交叉验证
                         ↓
              Vault2077 自己做规范化、去重、快照和榜单
```

这套方案可以完全去掉 HTML 正则解析，也不需要 Vercel 项目或 Vercel OIDC。

## 1. 推荐排序

这里的排序不是“项目综合实力”，而是“作为 Vault2077 GitHub Actions 无状态采集源的适合度”。

| 排名 | 项目 / 能力 | 最适合承担的职责 | 结论 |
|---:|---|---|---|
| 1 | GitHub CLI `gh skill search` | 全 GitHub 候选发现 | **应成为主发现源** |
| 2 | `openclaw/clawhub` | 下载榜、Star 榜、7 日趋势、安全状态 | **应成为主热度源** |
| 3 | `dmgrok/agent-plugins` | 每日静态 catalog、质量分、维护状态、重复标注 | **应成为主质量推荐 feed** |
| 4 | `agentskillexchange/skills` | 静态目录、分类、许可证、安全验证、上游热度 | **应成为安全与来源增强源** |
| 5 | `agentskill-sh/ags` | 安装量、趋势、质量分、安全分、社区评分 | **可灰度接入，不宜单点依赖** |
| 6 | `NousResearch/hermes-agent` Skills Hub | 多来源 adapter 的实现参考 | **适合借鉴代码，不适合直接当榜单源** |
| 7 | `Karanjot786/agent-skills-cli` / agentskills.in | 大目录 JSON 搜索、GitHub Star 排序 | **可补覆盖，不适合热门榜** |
| 8 | `sickn33/agentic-awesome-skills` | 大型本地可审计目录、风险与来源元数据 | **适合作为 curated seed** |
| 9 | `VoltAgent/awesome-agent-skills` | 人工精选的官方与社区来源清单 | **只适合作为白名单入口** |

## 2. 核心候选对比

| 项目 | 覆盖来源 | 自动发现 | 真实 Skill 热度 | 机器可读 | 去重 / 质量 / 安全 | 许可 | GitHub Actions 适配 |
|---|---|---|---|---|---|---|---|
| GitHub `gh skill search` | GitHub 全站公开 `SKILL.md` | 是，按查询实时 Code Search | 无；只有仓库 Star | `--json` | 同名最多保留 3 个；按相关性过滤 | MIT | **极好**；runner 预装 `gh`，但功能处于 preview，建议固定版本 |
| ClawHub | 用户发布、本人 GitHub 导入；另有 skills.sh mirror 代码 | 部分；不是任意 GitHub 全网爬虫 | **有**：下载、Star、7 日安装趋势 | 公共 REST + OpenAPI + CLI `--json` | rename/merge、可疑项过滤、恶意软件阻断、详细 evidence | 服务代码 MIT；发布 Skill 统一 MIT-0 | **极好**；公开读 API 无鉴权，限额充足 |
| Agent Plugins | 46 个固定 GitHub provider | 每日扫描 provider repo；非全网动态发现 | 无；只有 provider repo Star | `catalog.json` + 多种预过滤 CDN JSON | 维护、资源完整性、来源信任评分；内容相似度重复标注 | MIT；各 Skill 保留原许可 | **极好**；每日 GHA 已生成静态 feed |
| Agent Skill Exchange | 真实 GitHub repo、npm package、API、文档项目 | 后端 discovery 未开源；支持 PR / wizard | 间接：上游 GitHub Star、npm 周下载 | GitHub 静态 `skills.json`、`codex.json`、`openclaw.json` | 来源要求、去重、正文门槛、可执行安全扫描 | MIT | **极好**；直接读取固定 JSON |
| agentskill.sh | 自称 100,000+ Skill；来源采集未开源 | 可提交 GitHub URL；后端发现不透明 | **有**：`installCount`、社区评分、trending | CLI `--json` + 无鉴权 HTTP API | 安全分、内容质量分、客户端二次扫描 | MIT（CLI） | 好，但 API 未版本化、服务端闭源 |
| Hermes Skills Hub | skills.sh、well-known、GitHub taps、ClawHub、Claude marketplace、LobeHub、browse.sh、URL | 多 adapter 联邦搜索 | 无统一趋势 | CLI 与本地缓存；无独立公共聚合 JSON | 信任等级、安装前扫描、危险项不可强制绕过、hash 更新 | MIT | 中；可运行，但依赖较重且不是独立榜单服务 |
| agentskills.in CLI | 提交的 GitHub repo / Skill、Supabase API | repo 提交后递归找 `SKILL.md`；全网发现后端未开源 | 无真实 Skill 热度；主要是仓库 Star | 无鉴权 JSON API | 本地结构 / 质量评分；服务端审查不可审计 | MIT（CLI） | 好，但指标不适合 Hot |
| AAS Core | 自己 vendored 的 1,900+ curated Skill | PR / 人工吸收，不是全网扫描 | **明确不排名、不推荐** | `skills_index.json`、本地 MCP / CLI | 来源、risk、CI、人工语义复核；完整目录可审计 | 工具 MIT；文档 CC BY 4.0；第三方各自许可 | 好，适合种子目录，不适合热门榜 |
| VoltAgent Awesome | 官方团队与社区 GitHub 链接 | PR 人工收录 | 无 | 主要是 README | README 明确“curated, not audited” | MIT（列表） | 一般；需要解析 Markdown |

## 3. 第一名：GitHub 官方 `gh skill search`

### 3.1 它解决了什么

GitHub CLI 已加入 preview 状态的 `gh skill` 命令。`search` 子命令的定位是“在所有公开 GitHub 仓库中搜索 Skill”，实现方式不是抓网站，而是调用 GitHub Code Search API 查找 `SKILL.md`：

- 搜索全站公开仓库；
- 可按 owner 限定；
- 支持分页和每页条数；
- 支持 `--json repo,skillName,namespace,description,stars,path`；
- GitHub Code Search 的上限是 1,000 个结果。

源码：[`search.go`](https://github.com/cli/cli/blob/b1a9f7b183c12ae111ea63048d49aad2a53e9101/pkg/cmd/skills/search/search.go)；命令总入口：[`skills.go`](https://github.com/cli/cli/blob/b1a9f7b183c12ae111ea63048d49aad2a53e9101/pkg/cmd/skills/skills.go)。

它并不是简单执行一次 `filename:SKILL.md`：

1. 同时做正文匹配、路径匹配、owner 匹配和多词连字符匹配；
2. 先按查询相关性预排序；
3. 拉取 frontmatter description 和仓库 Star；
4. 过滤不相关噪声；
5. 对同名 Skill 去重，每个名称最多保留 3 个最高排名实现。

对应实现都在固定版本的 [`search.go`](https://github.com/cli/cli/blob/b1a9f7b183c12ae111ea63048d49aad2a53e9101/pkg/cmd/skills/search/search.go)。

### 3.2 对 Vault2077 的价值

它是目前找到的唯一一个同时满足以下条件的“全 GitHub Skill 发现器”：

- 官方维护；
- 源码完整；
- 不依赖第三方目录先收录；
- 结果来自 GitHub 原始仓库；
- 可在 GitHub Actions 中输出 JSON；
- 可得到稳定的 `repo + path` 作为候选标识；
- 可从 Actions 自带的 `GITHUB_TOKEN` 获得更高 API 配额。

GitHub-hosted runner 已预装 `gh`，但 runner 中的版本按周更新；官方也明确 `gh skill` 处于 preview、可能无通知变更。因此生产实现最好固定一个包含该命令的 `gh` 版本，或者直接复刻它对 GitHub Code Search REST API 的查询逻辑。[`gh-skill` Skill](https://github.com/cli/cli/blob/b1a9f7b183c12ae111ea63048d49aad2a53e9101/skills/gh-skill/SKILL.md)

### 3.3 局限

- 它是**发现器**，不是 registry；
- 必须有查询词，不能无条件枚举 GitHub 全部 `SKILL.md`；
- 1,000 条 Code Search 上限意味着需要按主题、语言、owner 或时间切分查询；
- `stars` 是仓库 Star，不是 Skill 安装量；
- 没有安全扫描结果和真实下载趋势；
- 同一仓库中的多个 Skill 共享同一个仓库 Star。

所以它应替代我们“从榜单中发现 Skill”的依赖，但不能独立生成“热门 Skill”。

## 4. 第二名：ClawHub

### 4.1 最接近 skills.sh 榜单语义

ClawHub 是一个完整开源的 Skill registry，公开了前端、Convex 后端、HTTP API、CLI、搜索、版本、统计、moderation 和安全扫描实现。[README](https://github.com/openclaw/clawhub/blob/7713313fa5ad5ded52fa9d761f0511e107666563/README.md)

其公共读 API 无需鉴权：

```http
GET https://clawhub.ai/api/v1/skills?sort=downloads
GET https://clawhub.ai/api/v1/skills?sort=stars
GET https://clawhub.ai/api/v1/skills?sort=recommended
GET https://clawhub.ai/api/v1/skills?sort=trending
```

支持 1–200 条分页、cursor、`nonSuspiciousOnly`，并有公开 OpenAPI。排序语义是：

- `downloads`：累计下载 / 安装信号；
- `stars`：ClawHub 社区收藏；
- `recommended`：engagement + recency；
- `trending`：**最近 7 天的安装量**。

证据：[`docs/http-api.md`](https://github.com/openclaw/clawhub/blob/7713313fa5ad5ded52fa9d761f0511e107666563/docs/http-api.md)。

### 4.2 “安装量”比 skills.sh 的 HTML 数字更可审计

ClawHub 只在用户登录 CLI、完成安装且未禁用遥测时发送一个 best-effort install event。Skill 的：

- `installsAllTime` 是报告过至少一次安装的唯一用户数；
- `installsCurrent` 是报告过安装、且没有删除遥测的唯一用户数；
- 重复安装不会反复增加同一用户的总数。

证据：[`docs/telemetry.md`](https://github.com/openclaw/clawhub/blob/7713313fa5ad5ded52fa9d761f0511e107666563/docs/telemetry.md)。

这不是“所有真实安装”的绝对值，因为匿名安装和退出遥测不会被统计，但指标定义公开、实现边界明确，适合作为趋势信号。

### 4.3 去重和安全明显强于普通目录

ClawHub 支持：

- owner rename 后保留旧 slug redirect；
- owner merge 后把重复条目合并到 canonical Skill；
- 搜索和榜单过滤 suspicious Skill；
- moderation verdict、reason codes、文件、行号和 evidence；
- malware blocked 状态；
- Skill 元数据与实际行为不一致检查。

证据：[`README`](https://github.com/openclaw/clawhub/blob/7713313fa5ad5ded52fa9d761f0511e107666563/README.md)、[`docs/http-api.md`](https://github.com/openclaw/clawhub/blob/7713313fa5ad5ded52fa9d761f0511e107666563/docs/http-api.md)、[`docs/skill-format.md`](https://github.com/openclaw/clawhub/blob/7713313fa5ad5ded52fa9d761f0511e107666563/docs/skill-format.md)。

### 4.4 不是独立的“全网发现器”

ClawHub 的 GitHub importer 只发现当前登录用户自己拥有的公开、非 fork、未归档仓库，不会扫描第三方任意 GitHub 仓库。[`docs/skill-format.md`](https://github.com/openclaw/clawhub/blob/7713313fa5ad5ded52fa9d761f0511e107666563/docs/skill-format.md)

另外，仓库现在包含通过 Vercel OIDC 调用 `skills.sh/api/v1` 并镜像 skills.sh catalog 的完整代码。[`server/skillsShCatalogSource.ts`](https://github.com/openclaw/clawhub/blob/7713313fa5ad5ded52fa9d761f0511e107666563/server/skillsShCatalogSource.ts)

因此：

- ClawHub 的**原生社区安装趋势**是独立信号；
- ClawHub 的**目录覆盖**可能部分继承 skills.sh；
- 如果目标是彻底消除 skills.sh 影响，不能把所有 ClawHub 条目都视为独立发现，应保留 `source` / provenance，并区分 ClawHub-native 与 mirror。

### 4.5 Actions 适配

公共读限额是匿名每 IP 每分钟 3,000 次，远高于我们每小时少量分页抓取的需求。[`docs/http-api.md`](https://github.com/openclaw/clawhub/blob/7713313fa5ad5ded52fa9d761f0511e107666563/docs/http-api.md)

无需 Token、无需 Vercel、无需安装 CLI；GitHub Actions 直接请求 JSON 即可。代码为 MIT，ClawHub 上发布的 Skill 统一按 MIT-0 分发。

## 5. 第三名：Agent Skill Exchange

### 5.1 最适合无状态采集的静态目录

Agent Skill Exchange 在 GitHub 仓库中直接发布：

- `skills.json`；
- `openclaw.json`；
- `codex.json`；
- `llms.txt`；
- 每个 Skill 的 `SKILL.md`；
- Top Stars、Top Downloads、分类和行业集合。

截至固定提交，README 声明 2,818 个已发布 Skill，其中 2,410 个为 security reviewed，并每天更新。[README](https://github.com/agentskillexchange/skills/blob/02d57c963beca8c7704e78142c011ac23964a275/README.md)

`skills.json` 的生成器把 live browse API 转成稳定 JSON，并只写入真实存在的信号：

- `github_stars`；
- `npm_weekly_downloads`；
- `license`；
- `verification`；
- 分类和框架。

证据：[`scripts/sync-from-api.sh`](https://github.com/agentskillexchange/skills/blob/02d57c963beca8c7704e78142c011ac23964a275/scripts/sync-from-api.sh)、[`scripts/generate-skills-json.sh`](https://github.com/agentskillexchange/skills/blob/02d57c963beca8c7704e78142c011ac23964a275/scripts/generate-skills-json.sh)。

这特别适合 GitHub Actions：

```text
下载 raw skills.json
→ 校验 version / generated / total
→ 读取 skills[]
→ 完成
```

没有 HTML、没有分页状态、没有 API Key，也不需要运行对方 CLI。

### 5.2 质量和安全门槛

发布要求包括：

- 真实 tool / repo / package / docs provenance；
- 合法 `SKILL.md` 和 frontmatter；
- 100+ words 的实质正文；
- 分类和 framework；
- 去重检查。

Security Reviewed 进一步检查 prompt injection、data exfiltration、destructive command、credential harvesting、social engineering、reverse shell、obfuscated payload 等。扫描规则是机器可读的，CI 会运行 fixture 和全目录安全扫描。[验证说明](https://github.com/agentskillexchange/skills/blob/02d57c963beca8c7704e78142c011ac23964a275/verification/README.md) [验证标准](https://github.com/agentskillexchange/skills/blob/02d57c963beca8c7704e78142c011ac23964a275/verification/CRITERIA.md)

### 5.3 它的“热门”不是 Skill 热门

ASE 的：

- Top Starred 是 Skill 所依赖 / 包装的 GitHub 项目 Star；
- Top Downloaded 是 Skill 所依赖 / 包装的 npm 包周下载量；
- featured shelf 的策略由线上 homepage API 决定，仓库只同步结果；
- 同一个流行项目可能派生多个 Skill。

README 生成器也明确区分 parent repo stars，避免把 monorepo 的 Star 当成子 Skill 独立 Star。[`scripts/generate-readme.sh`](https://github.com/agentskillexchange/skills/blob/02d57c963beca8c7704e78142c011ac23964a275/scripts/generate-readme.sh)

所以 ASE 非常适合做“可信推荐”和“上游生态影响力”，但不应把 npm 下载量包装成 Skill 安装趋势。

## 6. 第四名：agentskill.sh / `ags`

### 6.1 它确实暴露了适合榜单的字段

公开 CLI 直接请求：

```text
https://agentskill.sh/api/agent/search?q=...
https://agentskill.sh/api/agent/search?section=trending&limit=5
```

没有鉴权头。搜索 JSON 包含：

- `installCount`；
- `securityScore`；
- `contentQualityScore`；
- `slug`、`owner`、`description`；
- 安装详情中的 `score`、`ratingCount` 和 `contentSha`。

证据：[`src/api.ts`](https://github.com/agentskill-sh/ags/blob/ede92fd8fc94335d40dc0f74c60b4355c83c4a4c/src/api.ts)、[`src/commands/search.ts`](https://github.com/agentskill-sh/ags/blob/ede92fd8fc94335d40dc0f74c60b4355c83c4a4c/src/commands/search.ts)、[`src/types.ts`](https://github.com/agentskill-sh/ags/blob/ede92fd8fc94335d40dc0f74c60b4355c83c4a4c/src/types.ts)、[`skills/learn/SKILL.md`](https://github.com/agentskill-sh/ags/blob/ede92fd8fc94335d40dc0f74c60b4355c83c4a4c/skills/learn/SKILL.md)。

它还有实际 feedback API：用户或 Agent 可提交 1–5 分与评论，返回平均分和评分数。[`src/commands/feedback.ts`](https://github.com/agentskill-sh/ags/blob/ede92fd8fc94335d40dc0f74c60b4355c83c4a4c/src/commands/feedback.ts)

### 6.2 为什么只能作为实验信号

README 声称 100,000+ Skill、两层安全、12 类威胁、100% 扫描覆盖和自动评分，但公开仓库只有 CLI、`/learn` Skill 和客户端安全规则；以下核心能力没有开源：

- 全网候选怎么被发现；
- 100,000+ 的来源构成；
- 去重规则；
- server-side scanner；
- `contentQualityScore` 算法；
- trending 时间窗与排序公式；
- install event 的反作弊。

公开接口也不是带版本承诺的正式 API；CLI 把 base URL 硬编码为 `/api`，而不是发布 OpenAPI 或兼容性政策。

维护方面，固定版本最新提交是 2026-05-11；项目规模和维护密度明显低于 GitHub CLI 与 ClawHub。因此它适合做“第二套热度信号”，不适合直接替换后再形成新的单点依赖。

## 7. Hermes Skills Hub：最好的多源 adapter 参考

Hermes 本身不是中心 registry，但它已经实现了较完整的联邦 Skill Hub：

- skills.sh；
- `/.well-known/skills/index.json`；
- GitHub repo / tap；
- ClawHub；
- Claude marketplace manifest；
- LobeHub；
- browse.sh；
- 任意直接 `SKILL.md` URL。

证据：[`Skills System 文档`](https://github.com/NousResearch/hermes-agent/blob/1dfe781edd5e96d09511cf27d800a03e63b09789/website/docs/user-guide/features/skills.md)。

它还实现了：

- GitHub PAT、`gh` CLI、GitHub App 多种鉴权；
- Git Trees API 优先、Contents API 回退；
- 一小时本地索引缓存；
- source identifier 与 content hash；
- builtin / trusted / community 信任等级；
- 安装前安全扫描；
- `dangerous` verdict 即使 `--force` 也不可绕过；
- 安装后的 update / audit。

核心 adapter 在 [`tools/skills_hub.py`](https://github.com/NousResearch/hermes-agent/blob/1dfe781edd5e96d09511cf27d800a03e63b09789/tools/skills_hub.py)。

但它不适合作为 Vault2077 的直接榜单源：

- 没有一个公开的统一远端 JSON index；
- 搜索结果没有统一安装量 / 热度；
- 部分来源仍是 skills.sh；
- 本地 cache、lock、quarantine 等设计偏向安装器而不是无状态采集；
- 引入完整 Hermes Python 依赖只为榜单采集过重。

正确用法是复用它的“adapter + provenance + trust + content hash”设计，而不是在 Actions 中部署整个 Hermes。

## 8. agentskills.in / Agent Skills CLI

这个项目的公开 API client 使用 Supabase-backed JSON API：

```text
GET https://www.agentskills.in/api/skills
  ?search=...
  &author=...
  &category=...
  &limit=...
  &offset=...
  &sortBy=stars|recent|name
```

返回 GitHub URL、raw URL、repo/path/branch、Star、fork 和 assets。[`src/core/skillsdb.ts`](https://github.com/Karanjot786/agent-skills-cli/blob/956140bfce17aab9ef7ba9afbb12ee0bd8a8ef1c/src/core/skillsdb.ts)

Repo 提交流程会：

1. 请求 GitHub repo API；
2. 递归获取 Git tree；
3. 找出所有以 `SKILL.md` 结尾的文件；
4. 把 repo 元数据、Star、许可证、Skill 路径提交给 marketplace 后端。

证据：[`submit-repo.ts`](https://github.com/Karanjot786/agent-skills-cli/blob/956140bfce17aab9ef7ba9afbb12ee0bd8a8ef1c/src/cli/commands/submit-repo.ts)。

优点是 API 简单、JSON 化、GitHub Actions 易用。问题是：

- “auto-indexing”需要有人先提交 repo，不是全 GitHub 自动发现；
- 后端源码不在仓库；
- `stars` 是 repo Star；
- 没有 install count、7 日趋势或真正 Skill 热度；
- 本地质量分主要用于提交预览，不等于 registry 中每条记录都有可用质量字段；
- README 的规模声明在固定提交中是 175,000+，仓库 About 已变为 200,000+，口径变化较快。

因此它可作为覆盖补充，但对我们现有“三张热门榜”的替代价值低于 ClawHub 与 agentskill.sh。

## 9. 两个 curated seed

### 9.1 AAS Core / `sickn33/agentic-awesome-skills`

AAS 在固定版本中有约 1,992 个 vendored Skill，提供本地 MCP、CLI、`skills_index.json`、来源、风险、验证、生成物和 PR 质量链。它的优点是目录完整保存在 Git 中，适合离线审计和 Actions 增量比较。

但 README 明确写明：**AAS Core does not rank or recommend**；由 Agent 自己选择，Core 只验证 ID、结构和可复现状态。[README](https://github.com/sickn33/agentic-awesome-skills/blob/4b57bb2452bbae3c404694fd3ef5e3bd7a7110b5/README.md)

它适合成为：

- 高质量候选 seed；
- provenance / risk 元数据来源；
- 内容 hash 和版本变化跟踪源。

它不适合直接成为 Hot / Trending 榜。

维护流程要求 Skill 变更经过验证链、generated artifact 同步、PR policy 和语义复核；贡献指南也明确自动检查不能替代人工逻辑审查。[维护指南](https://github.com/sickn33/agentic-awesome-skills/blob/4b57bb2452bbae3c404694fd3ef5e3bd7a7110b5/.github/MAINTENANCE.md) [贡献指南](https://github.com/sickn33/agentic-awesome-skills/blob/4b57bb2452bbae3c404694fd3ef5e3bd7a7110b5/CONTRIBUTING.md)

### 9.2 `VoltAgent/awesome-agent-skills`

固定版本声明 1,497+ 条，由官方团队 Skill 与社区 Skill 组成，强调 hand-picked 和 community-adopted。[README](https://github.com/VoltAgent/awesome-agent-skills/blob/c97eda5e3406670f3285c6bf9eb7639a7ecc03cc/README.md)

但它仍然是 Markdown Awesome List：

- 没有正式 JSON；
- 没有 install / trend；
- 没有内容 hash；
- 没有跨来源 canonical ID；
- README 明确说明“curated, not audited”，上游可在收录后被替换。

它适合作为 GitHub Search 查询不到时的白名单补充，不值得作为核心采集源。

## 10. 明确排除的项目类型

本次搜索还发现大量标题含 marketplace / skills 的仓库，但以下不进入主候选：

- `anthropics/skills`、`openai/skills`、`NVIDIA/skills`、`block/agent-skills`、`daymade/claude-code-skills` 等：是单一组织或单一仓库自己的 Skill 集，不是跨来源热门聚合器；
- `agentskills.io` 规范实现：只定义格式，不提供推荐或热度数据；
- 普通 Claude plugin marketplace：通常只列本仓库的 plugins，不聚合全网 Skill；
- MCP registry、Agent registry、prompt library：对象不是 `SKILL.md` Skill；
- 只有网页、没有可核验开源采集逻辑或机器接口的目录：不能作为高信任生产依赖。

## 11. 推荐的 Vault2077 替代架构

### 11.1 数据源分工

#### A. 主发现源：GitHub Code Search

每 6–24 小时运行查询集：

```text
gh skill search security --json repo,skillName,namespace,description,stars,path
gh skill search testing  --json ...
gh skill search frontend --json ...
gh skill search research --json ...
gh skill search finance  --json ...
...
```

查询集应由 Vault2077 自己版本控制，并按主题拆分，避免 1,000 条上限。新发现条目再调用 GitHub API取得：

- default branch / commit SHA；
- repo stars / forks；
- archived / fork；
- license；
- pushed_at；
- `SKILL.md` 内容 hash。

#### B. 主热度源：ClawHub

每小时或每 6 小时获取：

```text
sort=trending
sort=downloads
sort=stars
sort=recommended
```

只保留：

- canonical slug / owner；
- stats；
- createdAt / updatedAt；
- latest version；
- moderation；
- provenance。

#### C. 质量增强源：ASE

每天读取一次 `skills.json`，用作：

- 分类；
- security reviewed；
- 上游 GitHub / npm 信号；
- license；
- “真实工具 / 项目来源”背书。

#### D. 实验源：agentskill.sh

设置 feature flag，抓取：

- trending；
- 重点 query 搜索；
- install count；
- community score / rating count；
- security / quality score。

如果接口失败或 schema 变化，不影响主榜发布。

### 11.2 稳定 ID 与去重

建议使用两层 ID：

```text
source_record_id = <source>:<source-native-id>
canonical_skill_id = github:<owner>/<repo>:<normalized-path>
```

去重顺序：

1. `owner/repo + normalized SKILL.md parent path` 完全相同：同一 Skill；
2. 内容 SHA-256 相同：镜像 / 复制，合并为一个 canonical group；
3. 同一 repo 内 frontmatter name 相同：标记冲突，人工或规则选择 canonical；
4. 跨 repo 只有名称相同：**不能直接去重**，因为可能是不同实现；
5. ClawHub rename / merge alias：遵循其 canonical redirect；
6. 保留所有来源 record，前端只聚合展示。

GitHub CLI 的“同名最多 3 个”适合搜索展示，但不应直接成为我们数据库的永久去重规则。

### 11.3 自己生成 Hot，而不是照搬任一平台

Vault2077 可以把“热度”拆成可解释信号：

- ClawHub 最近 7 天安装量；
- ClawHub 累计独立安装用户；
- ClawHub 社区 Star；
- GitHub repo Star 当前值与 1 日 / 7 日增量；
- Skill 首次发现时间；
- `SKILL.md` 最近更新时间；
- ASE security reviewed；
- 多个独立目录同时收录；
- 可选 agentskill.sh install count / rating。

榜单应分别命名，避免混淆：

- **Most Installed**：registry 安装量；
- **Trending**：7 日安装增量 + GitHub Star 增量；
- **New & Rising**：最近首次发现且增长快；
- **Trusted Picks**：安全验证、来源和维护质量；
- **Most Starred Projects**：明确是上游 repo Star，不称为 Skill installs。

这比继续复刻 skills.sh 的 All Time / Trending / Hot 三个名称更透明。

## 12. 实施成本评估

### 最小可行替换

只做两件事：

1. 把 skills.sh HTML 抓取替换成 ClawHub `/api/v1/skills` 的四种排序；
2. 增加每天一次的 `gh skill search` 发现任务。

预计不需要新增部署平台；继续使用 GitHub Actions 即可。需要新增的工程工作主要是 JSON schema 校验、ID 规范化和快照兼容。

### 推荐完整版本

增加 ASE 静态 JSON、自己的去重和趋势快照，并把 agentskill.sh 放在实验开关后。这样可以：

- 去除 HTML 结构脆弱性；
- 消除对单一 Skill 目录的依赖；
- 获得真正全 GitHub 的候选发现；
- 同时保留真实安装趋势；
- 明确区分 Skill 热度、上游项目热度和安全质量。

### 不建议

- 不建议把依赖从 skills.sh 单点平移到 agentskill.sh 或 agentskills.in 单点；
- 不建议解析更多 marketplace HTML；
- 不建议把 repo Star 当作 Skill install；
- 不建议仅靠 Awesome List；
- 不建议为这个替换单独创建 Vercel 项目。

## 13. 最终判断

**值得替换。**

不是因为找到一个“比 skills.sh 更大的榜单”，而是因为 GitHub 生态已经出现了可以组合的、更可审计的基础设施：

- GitHub 官方搜索负责广覆盖；
- ClawHub 负责真实安装趋势；
- ASE 负责静态质量与来源信号；
- Vault2077 负责跨源 canonicalization 和自己的透明榜单。

这会把我们当前的：

```text
skills.sh HTML
→ 正则解析
→ 三个 Top 榜
```

升级为：

```text
多来源 JSON / GitHub 原始仓库
→ 稳定 ID
→ 内容 hash 去重
→ 安全与来源增强
→ 自有时间序列
→ 可解释的安装榜 / 趋势榜 / 可信推荐
```

这套方案比接入 skills.sh 官方 OIDC API 更值得：它不仅解决“HTML 会变”的问题，也真正解决了单点覆盖、指标不透明和无法独立发现新 Skill 的问题。

## 14. 固定版本索引

| 项目 | 固定 commit | 活跃度证据 |
|---|---|---|
| GitHub CLI | [`b1a9f7b183c12ae111ea63048d49aad2a53e9101`](https://github.com/cli/cli/tree/b1a9f7b183c12ae111ea63048d49aad2a53e9101) | 2026-07-28 仍有提交 |
| ClawHub | [`7713313fa5ad5ded52fa9d761f0511e107666563`](https://github.com/openclaw/clawhub/tree/7713313fa5ad5ded52fa9d761f0511e107666563) | 2026-07-27 仍有功能提交 |
| Agent Skill Exchange | [`02d57c963beca8c7704e78142c011ac23964a275`](https://github.com/agentskillexchange/skills/tree/02d57c963beca8c7704e78142c011ac23964a275) | 2026-07-28 当日自动同步 |
| agentskill.sh CLI | [`ede92fd8fc94335d40dc0f74c60b4355c83c4a4c`](https://github.com/agentskill-sh/ags/tree/ede92fd8fc94335d40dc0f74c60b4355c83c4a4c) | 最新提交 2026-05-11 |
| Hermes Agent | [`1dfe781edd5e96d09511cf27d800a03e63b09789`](https://github.com/NousResearch/hermes-agent/tree/1dfe781edd5e96d09511cf27d800a03e63b09789) | 2026-07-28 仍有 Skills 相关修复 |
| Agent Skills CLI | [`956140bfce17aab9ef7ba9afbb12ee0bd8a8ef1c`](https://github.com/Karanjot786/agent-skills-cli/tree/956140bfce17aab9ef7ba9afbb12ee0bd8a8ef1c) | 最新提交 2026-05-17 |
| AAS Core | [`4b57bb2452bbae3c404694fd3ef5e3bd7a7110b5`](https://github.com/sickn33/agentic-awesome-skills/tree/4b57bb2452bbae3c404694fd3ef5e3bd7a7110b5) | 2026-07-28 当日同步 |
| VoltAgent Awesome Agent Skills | [`c97eda5e3406670f3285c6bf9eb7639a7ecc03cc`](https://github.com/VoltAgent/awesome-agent-skills/tree/c97eda5e3406670f3285c6bf9eb7639a7ecc03cc) | 最新提交 2026-07-10 |
