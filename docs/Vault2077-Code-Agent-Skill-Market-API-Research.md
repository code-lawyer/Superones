---
type: research
status: active
updated: 2026-07-28
---

# Vault2077：面向 Code Agent 的 Skill 市场 API 调研

> 研究问题：有没有比 ClawHub 更适合 Codex、Claude Code、GitHub Copilot、Cursor、Gemini CLI 等代码智能体的广覆盖 Skill 市场 API？
>
> 核验时间：2026-07-28。
>
> 证据范围：官方 API 文档、官方仓库和源码、公开 API 的实际响应。没有使用第三方评测或项目介绍作为核心证据。

## 结论先行

**有比 ClawHub 覆盖更广的市场 API，但没有一个候选能单独同时提供“全 GitHub 发现、跨 Code Agent、可信质量评价、真实安装趋势”四项能力。**

最现实的选择是：

1. **SkillsMP 作为广覆盖搜索 API。** 它是当前候选中目录最广、接入最直接的公开 API，适合搜索、分类和发现，但没有 Skill 安装量。
2. **GitHub 官方 `gh skill search` 作为独立补漏与源头核验层。** 它可以发现市场尚未收录的公开 `SKILL.md`，但不是排行榜。
3. **Tessl Registry 或 Agent Skill Exchange 作为 Code Agent 质量推荐层。** 前者有场景效果评估和 Snyk 安全结果，后者有免鉴权静态 JSON；都不能提供全生态真实安装热榜。
4. **agentskill.sh 作为实验性安装热度源。** 它跨 Code Agent，并且官方 CLI 确实会上报安装事件，API 也返回 `installCount` 和 `section=trending`；但后端、趋势算法、限流和反作弊规则没有开源或稳定文档，目前不适合成为唯一生产依赖。

如果只选择一个近期主数据源，推荐 **SkillsMP**；如果允许双源，推荐 **SkillsMP + agentskill.sh（实验性、带熔断和缓存）**。如果产品强调推荐质量而不是数量，则再增加 **Tessl/Agent Skill Exchange**。

## 候选对比

| 候选 | 当前覆盖 | 机器接口 | 鉴权/限流 | 热门信号 | Code Agent 适配 | 生产判断 |
|---|---:|---|---|---|---|---|
| SkillsMP | 2.33M `SKILL.md` | REST、MCP、OpenAPI | 匿名 50/日；Key 500/日 | GitHub 仓库 Star、更新时间 | 通用 `SKILL.md`，无逐条兼容字段 | **主搜索源首选** |
| GitHub `gh skill search` | 全 GitHub 公开 Code Search | CLI JSON | GitHub 鉴权与 Code Search 限额 | 仓库 Star，无安装量 | 官方支持主流 coding agents 的安装流程 | **发现/核验首选** |
| agentskill.sh | 官网称 274K+ | 匿名 JSON API、CLI | 未找到正式限流契约 | `installCount`、rating、trending | Codex、Claude Code、Cursor、Copilot、Gemini 等 | **实验性热度源** |
| ModelScope Skills Center | 实测 76,392 | 匿名 OpenAPI、SDK、CLI | 读取实测免鉴权；未公布限流 | `downloads`、`view_count`，无文档化全局排序 | 通用 `SKILL.md`，支持多种安装方式 | **国内/补充市场优选** |
| Tessl Registry | 官方称 3,000+ | CLI JSON、MCP；无简洁公开 catalog REST 契约 | 需要 Tessl 账户/凭据 | 质量、eval uplift、安全；无安装热榜 | 明确支持 Claude/Cursor/Gemini/Codex/Copilot | **高质量推荐源，需商务/API确认** |
| Agent Skill Exchange | 实测/README 约 2.8K | GitHub `skills.json` | 无鉴权，CDN/raw 读取 | 上游 GitHub Star、npm 下载，不是 Skill 安装 | 明确跨 Codex/Claude/Copilot/Gemini/Cursor | **Trusted Picks 辅助源** |
| SkillsHub | 10K+、230+ 仓库 | 匿名 REST、原始 Markdown | 读 60/分钟 | “近期入库 + 仓库 Star” | 通用 `SKILL.md` | **搜索/resolve 备选，不用于趋势** |
| SkillMD | 官网 5,474 | 匿名 JSON Search API | 未找到限流契约 | rating 字段，未提供榜单 API | 官网称 50+ agents | **规模和指标成熟度不足** |
| dmgrok/agent-plugins | 1,100+、46 providers | CDN 静态 JSON | 无鉴权 | 维护/结构/Provider 启发式 | Universal、Claude、Copilot 导出 | **高质量静态 fallback** |

## 1. SkillsMP：覆盖最广，但它解决的是“找得到”

[SkillsMP Developer Portal](https://skillsmp.com/developers) 声称索引 2M+ Agent Skills，提供 REST API、MCP server 和 OpenAPI。其 [About 页面](https://skillsmp.com/about) 说明数据来自公开 GitHub 仓库，并明确把产品定位为生态地图和发现工具，而不是急于判断 Skill 质量。

官方 [API 文档](https://skillsmp.com/docs/api) 只公开一个核心搜索端点：

```http
GET /api/v1/skills/search?q=<keyword>
```

可按 category、occupation、内容语言过滤，按 `stars` 或 `recent` 排序。匿名额度为 50 次/日、10 次/分钟，API Key 为 500 次/日、30 次/分钟。Key 通过 Google/GitHub 登录后生成，运行时使用长期 Bearer Key，不需要 Vercel 或 OIDC。官方页面没有公布付费价格或更高商业套餐；可以确认匿名调用免费，登录后 Key 具有文档化的免费配额，但不能据此假设存在生产 SLA 或可无限扩容。

截至核验时间，[正式 OpenAPI 规范](https://skillsmp.com/openapi.json) 只有 `GET /api/v1/skills/search` 和 `GET /api/health`，没有全局排行榜、Top、Trending、Hot 或安装量端点。`sortBy=stars` 和 `sortBy=recent` 只是**某个关键词搜索结果内部的排序方式**：

- `stars` 按上游 GitHub 仓库总 Star 排序，不是 Skill 安装榜，同一仓库中的多个 Skill 会共享相同 Star；
- `recent` 按更新时间排序，不计算一定时间窗口内的增长速度，因此不等于 Trending；
- `q` 在 OpenAPI 和 API 文档中均为必填参数，不能在不指定主题的情况下取得全站 Top。

2026-07-28 对公开 API 的实测：

- `GET /api/v1/skills/search?q=code%20review&limit=3&sortBy=stars` 返回 200 和结构化 JSON；
- `GET /api/timeline?granularity=daily&limit=3` 返回 `totalSkills: 2330640`；
- `GET /api/v1/skills/search?q=code%20review&limit=3&sortBy=recent` 返回 200，但结果只是该关键词下按更新时间排序；
- `GET /api/v1/skills/search?q=*&sortBy=recent` 返回 400，与正式 API 文档中“不支持 wildcard”一致；
- 省略 `q` 返回 400；`GET /api/v1/skills/trending` 和 `GET /api/v1/skills/top` 均返回 404。

这里存在一处官方页面内部矛盾：Developer Portal 的 polling 示例写了 `q=*`，但正式 API 文档明确说 wildcard 不受支持，OpenAPI 又把 `q` 标记为必填，实际请求也返回 400。生产实现应以 OpenAPI、API 文档和实际响应为准，不能依赖该 polling 示例。

主要限制：

- `q` 必填，因此不能通过正式 REST 契约无条件遍历整个目录；
- `stars` 是 Skill 所在 GitHub 仓库的 Star，同一仓库的所有 Skill 共享该值，不是 Skill 安装量；
- API schema 没有 installs、downloads、security、license、content hash 或 agent compatibility；
- 没有正式的全局 Top、Trending 或 Hot 接口，所以不能“直接使用 SkillsMP 排行榜”替换 skills.sh；
- 匿名 50 次/日适合低频服务端采集、原型和带缓存的少量搜索，不适合直接承接面向用户的生产搜索流量；Key 的 500 次/日可支撑小规模定时任务和缓存预热，但对于多关键词、多分类、分页刷新或直接透传用户查询仍偏紧；
- 采集后端不是开源项目，无法独立审计去重、垃圾过滤和收录算法。

**判断：** SkillsMP 有免费 API，但当前是关键词发现 API，不是排行榜 API。Vault2077 可以用它制作“某个主题下 GitHub Star 较高”或“某个主题下最近更新”的列表，并明确标注口径；不能直接用它生成全局热门榜、安装榜或趋势榜。对生产环境，建议由 GitHub Actions 或服务端持 Key 定时查询并缓存，避免浏览器直连和把有限配额暴露给用户请求。

## 2. GitHub 官方搜索：市场外的发现与核验层

GitHub 官方 [`gh skill search`](https://cli.github.com/manual/gh_skill_search) 会通过 GitHub Code Search 搜索公开仓库中的 `SKILL.md`，并可输出 `description`、`namespace`、`path`、`repo`、`skillName`、`stars` 等 JSON 字段。

它适合完成以下任务：

- 找到尚未进入 SkillsMP、Tessl 或其他市场的新 Skill；
- 追踪官方组织或指定 owner 的 Skill；
- 核验市场条目的原始仓库、路径和最新状态；
- 对多个市场结果按来源路径和内容哈希去重。

GitHub 官方 [`gh skill install`](https://cli.github.com/manual/gh_skill_install) 支持把 Skill 安装到 Copilot、Claude Code、Cursor、Codex、Gemini CLI、OpenCode、Windsurf 等多种 coding agent。

但 GitHub Search 没有 Skill 安装事件和市场趋势，只能提供搜索相关性和仓库级 Star。它应当是 **SkillsMP 的补漏器和真实性校验器**，而不是另一个“热门榜”。

## 3. agentskill.sh：最接近跨 Code Agent 安装市场，但透明度不足

[agentskill.sh 首页](https://agentskill.sh/) 声称覆盖 274K+ Skills，支持 Claude Code、Cursor、Copilot、Codex、Gemini CLI 等平台，并提供 Top、Trending、Hot、Latest 等页面。

更重要的是，它不是只展示一个静态安装数字。官方开源 CLI [`agentskill-sh/ags`](https://github.com/agentskill-sh/ags) 的源码显示：

- 搜索调用 `GET /api/agent/search`；
- 安装前通过 `GET /api/agent/skills/{slug}/install` 获取 Skill 内容；
- 安装完成后，CLI 会向 `POST /api/skills/{slug}/install` 发送 `platform`、`agentName` 和临时 `sessionId`，见 [`src/commands/install.ts`](https://github.com/agentskill-sh/ags/blob/main/src/commands/install.ts)；
- [官方安装说明](https://agentskill.sh/install) 也明确称安装后会报告平台和 agent 名称，用于 usage analytics。

2026-07-28 实测匿名接口：

```http
GET /api/agent/search?section=trending&limit=3
```

返回 `installCount`、`githubStars`、`score`、`ratingCount`、`securityScore`、`contentQualityScore`、`platforms` 和 `updatedAt`。这使它成为目前找到的、**同时跨 Code Agent 且具有自身安装事件**的少数候选之一。

不过目前存在明显风险：

- 只开源了 CLI，市场后端、收录器、排序算法、反作弊和去重逻辑没有开源；
- 没找到正式、版本化的 API 文档或公开限流说明；
- 实测 `section=trending` 仅返回很少结果，并包含 `installCount=0` 的 Skill，趋势口径不透明；
- 实测普通 `q=code review` 请求出现 500，稳定性仍需观察；
- Top 结果明显受到超大型仓库 Star 支配；
- CLI 用 `sessionId: cli-${Date.now()}` 上报，源码可证明“有事件”，但不能证明服务端已经可靠去重或阻止刷量。

**判断：** 值得做为第二数据源灰度接入，用于 `Community Installs` 或 `agentskill.sh Trending` 专属栏，并明确标注来源；现阶段不应替代所有榜单或作为唯一数据源。

## 4. ModelScope Skills Center：值得重视的通用市场 API

ModelScope 官方 [`Skills Center` API 参考](https://github.com/modelscope/modelscope-skills/blob/main/skills/ms-hub/references/skills-center.md) 提供：

```http
GET /openapi/v1/skills
GET /openapi/v1/skills?search=code-review
GET /openapi/v1/skills/{id}
```

列表条目包括 `id`、description、developer、category、tags、license、source URL、`view_count`、`downloads`、更新时间；详情返回 npx、curl、ModelScope CLI 等安装命令。官方 SDK 也实现了 Skill 下载。

2026-07-28 匿名实测：

- 无 Authorization 的列表和搜索都返回 200；
- 列表返回 `total: 76392`；
- 结果包含 Anthropic、Microsoft、GitHub 社区仓库等通用 `SKILL.md` 来源；
- 单条结果包含平台内 `downloads` 和 `view_count`。

限制：

- 官方参考要求 `page_number × page_size ≤ 3000`，因此列表端点不能完整分页遍历 76K；
- API 文档没有公开 rate limit；
- 没有文档化的全局 downloads/trending 排序参数；实测传入多种 `sort` 值结果相同，不能假定已经生效；
- `downloads` 是 ModelScope 市场内计数，只代表其自身用户，并且官方没有公开计数去重规则；
- 每条 Skill 没有 Codex/Cursor/Gemini 等兼容性矩阵。

**判断：** 对中文用户、国内网络和跨来源搜索很有价值，可作为 SkillsMP 的区域性第二市场；但目前无法直接用公开契约生成完整下载榜。

## 5. Tessl：内容最贴近 Coding Agent，API 接入不够开放

[Tessl Registry](https://tessl.io/registry) 明确服务于 AI coding agents，并展示：

- 结构/最佳实践 Quality；
- Skill 相对于无 Skill baseline 的场景 eval uplift；
- Snyk 自动安全扫描；
- 版本和 review 时间。

[官方 CLI 文档](https://docs.tessl.io/reference/cli-commands) 明确支持 `claude-code`、`cursor`、`gemini`、`codex`、`copilot`、`copilot-vscode`，`tessl search --type skills --json` 可返回机器可读搜索结果，安装时还会对高危 Snyk 结果设置确认门槛。

这是候选中对“这个 Skill 是否真的提高 Coding Agent 成功率”回答得最好的平台。但它没有像 SkillsMP 一样公开、稳定、免登录的 catalog REST feed、排序契约与限流说明，主要通过 CLI、MCP 和 Tessl 账户体系访问，也没有公开 Skill 安装量。

**判断：** 最适合做 `Evaluated Code Agent Picks`，不适合直接在 GitHub Actions 中无状态替换当前排行榜。应先向 Tessl 确认正式 API、配额、商业使用和批量同步条款。

## 6. Agent Skill Exchange：免鉴权 Trusted Picks Feed

[Agent Skill Exchange 官方仓库](https://github.com/agentskillexchange/skills) 声称约 2,800 个条目、17 个分类、每日更新，并明确覆盖 OpenClaw、Claude Code、Codex、Copilot、Gemini、Cursor、MCP 和 LangChain。

其 [`skills.json`](https://raw.githubusercontent.com/agentskillexchange/skills/main/skills.json) 可直接通过 GitHub raw/CDN 读取，适合缓存到 Vault2077。字段包含 framework、category、verification、source URL、GitHub repo/stars，以及部分 npm weekly downloads。

需要注意：

- 它不只是镜像原始 `SKILL.md`；[Skill Spec](https://github.com/agentskillexchange/skills/blob/main/spec/SKILL_SPEC.md) 允许围绕真实 GitHub 项目、npm 包或 API 编写新的包装 Skill；
- `TOP-DOWNLOADS.md` 的下载量是 Skill 所包装上游 npm 包的下载量，不是 Skill 安装量；
- `security_reviewed` 是模式扫描结果，不等于功能实测、官方认证或无风险。

**判断：** 适合独立的 `Trusted Picks`/`Code Agent Picks`，不能作为全网原生 Skill 目录或热门安装榜。

## 7. SkillsHub、SkillMD 与静态聚合器

### SkillsHub

[SkillsHub](https://github.com/ComeOnOliver/skillshub) 提供免鉴权 search、resolve、detail、trending 和原始 Markdown，读接口官方限额为 60 次/分钟。自然语言 `/resolve?task=` 对 Agent 推荐体验很好。

但源码表明：

- importer 使用固定 curated repository 列表，而不是持续发现整个 GitHub，见 [`import-skills-repos.ts`](https://github.com/ComeOnOliver/skillshub/blob/main/packages/db/src/import-skills-repos.ts)；
- [`trending` route](https://github.com/ComeOnOliver/skillshub/blob/main/apps/web/src/app/api/v1/skills/trending/route.ts) 只是按 `skills.createdAt` 过滤近期入库，再按 `repos.starCount` 排序。

因此它可以是 `resolve` fallback，但不能把其 Trending 当作真实使用趋势。

### SkillMD

[SkillMD 官网](https://skillmd.com/) 当前显示 5,474 Skills、1,462 Official、50+ agents。[官方文档](https://skillmd.com/docs) 公开匿名 JSON 搜索：

```http
GET https://api.skillmd.com/v1/search?q=<query>
```

响应包含 verified、agents、category、rating 和 raw URL。实测多组不同搜索结果的 `avg_rating=4.2`、`rating_count=5` 完全相同，且官方没有文档化排行榜 API、评分生成规则或限流契约。

因此它可作为小规模跨 Agent 搜索补充，当前不适合作为生产主榜来源。

### dmgrok/agent-plugins

[dmgrok/agent-plugins](https://github.com/dmgrok/agent-plugins) 每日从 46 个固定 provider 聚合 1,100+ Skills，提供免鉴权 `catalog.json` 和 Claude、Copilot、premium、active 等 CDN JSON。

其 quality score 明确定义为维护时间 50 分、是否存在 scripts/references/assets 30 分、provider trust 20 分。这是可解释的结构启发式，不是使用效果或安装热度。

它非常适合作为高可用静态 fallback 和“官方/活跃/结构完整”筛选源。

## 明确排除的“伪替代”

- [`mastra-ai/skills-api`](https://github.com/mastra-ai/skills-api) 的 README 明确称自己是 “skills.sh as an API”，并通过 scrape 更新。它可以消除 Vault2077 自己解析 HTML 的代码，但不能消除 skills.sh 的上游依赖。
- SkillX 的导入脚本会消费 skills.sh 派生 feed，且部分评分由 GitHub Star 转换得到；不能作为独立热门来源。
- ClawHub 有自身下载遥测，但生态中心仍是 OpenClaw，不应代表 Code Agent 市场。
- 单一官方仓库、awesome list、Claude plugin marketplace 即使内容质量高，也不是跨生态 API。

## 推荐落地架构

### 方案 A：近期最优，改动小

```text
SkillsMP API ───────→ 广覆盖搜索、分类、Recent
agentskill.sh API ─→ 实验性 Community Installs / Trending
Agent Skill Exchange → Trusted Picks
GitHub gh skill search → 新发现、源头核验、补漏
```

执行原则：

- 每个来源独立缓存，记录 `source`、`source_metric` 和采集时间；
- agentskill.sh 出错或数据异常时自动降级，不阻塞整体刷新；
- 不把 GitHub Star、npm downloads、ModelScope downloads 和 Agent Skill installs 混成一个数字；
- 榜单标题标明口径，例如 `GitHub Momentum`、`agentskill.sh Installs`、`Recently Updated`、`Evaluated Picks`；
- 对相同 GitHub path/内容 hash 去重；
- 对无法确认许可证、已归档仓库、危险脚本和提示注入结果降权或隐藏。

### 方案 B：完全自主的长期方案

如果 Vault2077 想拥有真正跨 Code Agent 的热门榜，必须自己拥有至少一个安装入口：

1. `vault skill install` CLI 或统一下载跳转/API；
2. 在用户知情和可关闭前提下记录 skill ID、agent 类型、时间桶和匿名安装事件；
3. 服务端做幂等、刷量限制和机器人过滤；
4. 同时计算 7 日安装增长、当前时段同比和长期总安装量；
5. 对未通过 Vault 安装的 Skill，仍只展示 GitHub/第三方市场信号。

只有这样才能逐步摆脱所有第三方“热门”定义。单纯抓取 GitHub 或另一个目录，永远只能替代“发现”，不能替代真实的“使用热度”。

## 最终建议

1. **不要用 ClawHub 作为 Code Agent 主市场。**
2. **把 SkillsMP 设为主发现 API。** 它最广、REST 契约最清楚，但需要 API Key 才适合生产频率。
3. **小流量接入 agentskill.sh，观察 2–4 周。** 只输出独立来源榜，监控 5xx、结果数量、安装量分布和排序稳定性。
4. **增加 Agent Skill Exchange 静态 JSON 作为 Trusted Picks。**
5. **把 ModelScope 作为国内和中文市场补充源。**
6. **若产品愿意付费或合作，优先联系 Tessl 获取正式 API。** 它的质量/eval 信号比纯 Star 和下载量更适合 Code Agent 推荐。
7. **中期建设 Vault 自有安装入口。** 在此之前，不要声称任何组合已经得到“全网真实热门 Skill”。
