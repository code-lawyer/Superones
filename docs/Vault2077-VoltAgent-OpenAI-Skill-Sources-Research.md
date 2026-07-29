---
type: research
status: active
updated: 2026-07-28
---

# Vault2077：VoltAgent 与 OpenAI Skill 来源研究

> 研究日期：2026-07-28  
> 范围：`VoltAgent/awesome-agent-skills`、`openai/skills`  
> 来源约束：只使用项目官方 GitHub 仓库、OpenAI 官方文档、Agent Skills 官方标准和 GitHub 官方 API 文档。

## 结论摘要

这两个来源都不能替代 `skills.sh` 的安装排行榜 API，但可以在 Vault2077 中承担不同角色：

| 来源 | 本质 | 可验证覆盖 | 专门 Skill API | 安装量/Trending | Vault2077 最适合的角色 |
|---|---|---:|---|---|---|
| `VoltAgent/awesome-agent-skills` | 人工维护的跨厂商外链精选目录 | README 1,183 个 Skill/集合条目，映射到约 194 个来源仓库 | 没有公开文档化 API | 没有 | 高质量候选种子、官方/社区来源标签 |
| `openai/skills` | OpenAI 维护的 Codex Skill 实体仓库 | 44 个 Skill 路径，43 个唯一名称 | 没有 | 没有 | OpenAI 官方可信标签、历史样本；不再作为持续扩张上游 |

`VoltAgent/awesome-agent-skills` 的广度明显更高，但它只存放链接与描述，不存放被列出的 `SKILL.md`；`openai/skills` 存放完整 Skill 文件，但覆盖很小，而且其 README 已明确标注仓库弃用，要求转向 [`openai/plugins`](https://github.com/openai/plugins)。

因此：

- 排行榜继续使用具有安装遥测的 `skills.sh` API。
- VoltAgent 用作“编辑精选候选集”，不能当作排行榜。
- OpenAI 官方条目用作“官方可信/高质量样本”，新采集应转向 `openai/plugins`，不应继续只盯着已弃用的 `openai/skills`。
- 两个来源都应通过 GitHub API 获取与校验，不需要解析 GitHub HTML。

## 1. VoltAgent/awesome-agent-skills

### 1.1 它是什么

[`VoltAgent/awesome-agent-skills`](https://github.com/VoltAgent/awesome-agent-skills) 是 VoltAgent 团队维护的 Awesome List。官方 README 将其描述为由实际开发团队和社区创建、人工筛选的 Agent Skills 集合，并明确声称兼容 Claude Code、Codex、Antigravity、Gemini CLI、Cursor、GitHub Copilot、OpenCode、Windsurf 等客户端。[固定版本 README](https://github.com/VoltAgent/awesome-agent-skills/blob/c97eda5e3406670f3285c6bf9eb7639a7ecc03cc/README.md)

它不是 Skill 文件仓库。固定版本的整个 Git tree 只有 4 个 blob：

- `.gitignore`
- `CONTRIBUTING.md`
- `LICENSE`
- `README.md`

也就是说，它的核心资产是一份 README 外链目录；每个 Skill 的真实文件仍由原作者仓库维护。README 也明确声明这是 curated list，条目没有经过安全审计，使用前必须自行审查。[安全与免责声明](https://github.com/VoltAgent/awesome-agent-skills/blob/c97eda5e3406670f3285c6bf9eb7639a7ecc03cc/README.md#security-notice)

### 1.2 固定版本与覆盖统计

本报告固定到：

- Commit：[`c97eda5e3406670f3285c6bf9eb7639a7ecc03cc`](https://github.com/VoltAgent/awesome-agent-skills/commit/c97eda5e3406670f3285c6bf9eb7639a7ecc03cc)
- Commit 时间：2026-07-10 13:55:37 UTC

可复现统计口径：

1. 从该 SHA 的原始 `README.md` 读取内容。
2. 将以连字符和加粗 Markdown 链接开头的行视为一个 Skill 或 Skill 集合条目。
3. 对条目的第一个链接做来源归一化：
   - `github.com/{owner}/{repo}/...` 归一为 `{owner}/{repo}`；
   - `officialskills.sh/{owner}/{repo}/{skill}` 归一为 `{owner}/{repo}`。
4. 不把徽章、赞助商、文档链接和安全工具链接计入 Skill 条目。

结果：

| 口径 | 数量 | 解释 |
|---|---:|---|
| README 自报徽章 | `1497+` | 项目维护者给出的聚合口径 |
| README 可直接解析的 Skill/集合行 | 1,183 | 每行可能是单个 Skill，也可能代表包含多个 Skill 的集合仓库 |
| 唯一条目标签 | 1,179 | 有少量重复标签 |
| 可映射到 GitHub/officialskills 来源的行 | 1,177 | 其余 6 行使用其他链接形态 |
| 归一化唯一来源仓库 | 194 | 基于上述 URL 规则推断，不代表 194 个仓库都已验证存在有效 `SKILL.md` |
| 本仓库内 `SKILL.md` | 0 | 仓库只有目录文档，不镜像 Skill 实体 |

README 的 `1497+` 与 1,183 条可解析行并不矛盾：部分行代表含有 6、11、14、20、77、150、753 等多个 Skill 的集合。但由于索引仓库不保存这些集合的文件快照，也没有机器可读 manifest，`1497+` 无法仅从该仓库 Git tree 独立重算。对 Vault2077 来说，1,183 是可稳定重算的“目录条目数”，不是经过逐文件验证的 Skill 实体数。

### 1.3 分类与 Agent 覆盖

README 的主要组织方式不是标准主题分类，而是：

- 官方发布团队/厂商：Anthropic、OpenAI、Google、Microsoft、Vercel、Stripe、Cloudflare、Netlify、Trail of Bits、Sentry、Expo、Hugging Face、Figma、WordPress、NVIDIA 等；
- 厂商内部技术分类：例如 Microsoft 的 Core、.NET、Java、Python、Rust、TypeScript；
- NVIDIA 产品线分类：CUDA-Q、DALI、Megatron、NeMo、TensorRT-LLM、DeepStream 等；
- Community Skills 与 specialized domains。

兼容性是“Agent Skills 文件格式和安装路径层面”的广泛兼容，而不是每条 Skill 都经过所有客户端测试。官方 README 提供了 8 类客户端路径：

| 客户端 | 项目路径 |
|---|---|
| Antigravity | `.agent/skills/` |
| Claude Code | `.claude/skills/` |
| Codex | `.agents/skills/` |
| Cursor | `.cursor/skills/` |
| Gemini CLI | `.gemini/skills/` |
| GitHub Copilot | `.github/skills/` |
| OpenCode | `.opencode/skills/` |
| Windsurf | `.windsurf/skills/` |

来源：[VoltAgent README 的客户端路径表](https://github.com/VoltAgent/awesome-agent-skills/blob/c97eda5e3406670f3285c6bf9eb7639a7ecc03cc/README.md#skills-paths-for-other-ai-coding-assistants)。

### 1.4 有没有 API

仓库及其官网没有发布或文档化专门的 Skill Catalog API。`officialskills.sh` 是该目录的展示站，官方 About 页面要求通过 `awesome-agent-skills` 的 PR 添加条目，本质上仍以 GitHub README 为上游。[officialskills.sh About](https://officialskills.sh/about)

可稳定使用的是 GitHub 通用 API：

| 任务 | 推荐接口 |
|---|---|
| 获取固定版本 README | `GET /repos/VoltAgent/awesome-agent-skills/contents/README.md?ref={sha}` |
| 识别最新版本 | `GET /repos/VoltAgent/awesome-agent-skills/commits/main` |
| 获取仓库 Stars、更新时间 | `GET /repos/VoltAgent/awesome-agent-skills` |
| 校验索引仓库文件结构 | `GET /repos/VoltAgent/awesome-agent-skills/git/trees/{sha}?recursive=1` |
| 校验每个外链来源是否含 `SKILL.md` | 对归一化后的每个来源仓库调用 Contents 或 Git Trees API |
| 批量补充来源仓库 Stars、license、更新时间 | GitHub GraphQL 或 REST Repositories API |
| 文本搜索 | 下载 README 后建立本地索引；或使用 GitHub Code Search |

GitHub 官方说明：Contents API 可直接读取文件/目录，单目录最多返回 1,000 项；递归抓取应使用 Git Trees API。公共仓库读取不强制鉴权。[Contents API](https://docs.github.com/en/rest/repos/contents)；[Git Trees API](https://docs.github.com/en/rest/git/trees)

### 1.5 数据字段能力

| 数据 | 仓库是否直接提供 | 说明 |
|---|---|---|
| Skill/集合名称 | 有 | README 标签 |
| 简短描述 | 有 | 人工维护 |
| 来源 URL | 有 | 可能指向 Skill 目录、文件或集合仓库 |
| 分类/发布方 | 有 | README 章节，非统一 schema |
| 单个来源仓库 Stars | 没有 | 必须再调用 GitHub API |
| 单个 Skill Stars | 没有 | GitHub Stars 属于仓库，不属于目录 |
| 安装量 | 没有 | 无安装遥测 |
| Trending/Hot | 没有 | 无时间序列或增长指标 |
| 搜索 API | 没有 | 可自行索引标题与描述 |
| 安全审计结果 | 没有 | README 只给风险提示和外部扫描工具链接 |

因此它只能提供“被精选/被收录”信号，不能证明“热门”“趋势上升”或“安装量高”。

### 1.6 对 Vault2077 的角色

推荐把 VoltAgent 定义成 `editorial_seed`，而不是 `ranking_source`：

1. 每日或每周抓取固定 SHA 的 README。
2. 解析 1,183 个目录条目，保存原始章节、标签、描述和 URL。
3. 将链接归一到来源仓库与具体 Skill 路径。
4. 再用 GitHub API 验证仓库存在、默认分支、`SKILL.md`、license、最后提交时间、Stars 和 archived 状态。
5. 对集合仓库递归发现多个 `SKILL.md`，不要直接把“一行集合”计成一个 Skill。
6. 将 `listed_by_voltagent=true` 作为编辑精选信号，不参与安装量排名。

它的优势是覆盖跨 Code Agent、多厂商且经过人工挑选；不足是数据非结构化、没有安装指标、没有安全保证，且 194 个来源会继续发生移动、删除和结构变化。

## 2. openai/skills

### 2.1 它是什么，以及当前状态

[`openai/skills`](https://github.com/openai/skills) 是 OpenAI 曾经维护的 Codex Skills Catalog，存放完整的 `SKILL.md`、脚本和相关资源，不只是链接目录。README 说明 `.system` Skill 会随 Codex 自动安装，`.curated` Skill 可通过 `skill-installer` 安装。[固定版本 README](https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/README.md)

但同一 README 顶部现在明确标注：

> This repository is deprecated.

并要求当前 Codex Skill 和 Plugin 示例改用 [`openai/plugins`](https://github.com/openai/plugins)，自建 Skill 应遵循 OpenAI 的 [Build plugins](https://developers.openai.com/codex/plugins/build) 指南。因此 `openai/skills` 只能视为官方历史样本/兼容源，不应再作为未来持续增长的主要 OpenAI 上游。

### 2.2 固定版本与覆盖统计

本报告固定到：

- Commit：[`49f948faa9258a0c61caceaf225e179651397431`](https://github.com/openai/skills/commit/49f948faa9258a0c61caceaf225e179651397431)
- Commit 时间：2026-06-24

统计口径：对该 SHA 的 Git tree 递归统计 `skills/` 下目录和名为 `SKILL.md` 的文件。

| 口径 | 数量 | 说明 |
|---|---:|---|
| `skills/` 下分类目录 | 2 | `.system`、`.curated` |
| `.system` 直接 Skill 目录 | 5 | Codex 系统 Skill |
| `.curated` 直接 Skill 目录 | 39 | 官方精选可安装 Skill |
| Skill 路径条目 | 44 | 5 + 39 |
| 递归 `SKILL.md` | 44 | 每个路径恰好一个 |
| 唯一 Skill 名称 | 43 | `openai-docs` 同时存在于 system 和 curated |
| `.experimental` 目录 | 0 | README 仍有旧示例，但固定版本已不存在该目录 |

固定目录：[`.system`](https://github.com/openai/skills/tree/49f948faa9258a0c61caceaf225e179651397431/skills/.system)、[`.curated`](https://github.com/openai/skills/tree/49f948faa9258a0c61caceaf225e179651397431/skills/.curated)。

覆盖主题包括代码开发、GitHub/PR 工作流、部署、安全、Figma、Notion、文档/PDF、浏览器自动化、图像/语音等。它是小规模 OpenAI 官方精选，不是全网 Skill 目录。

### 2.3 Agent 兼容范围

- 仓库的明确目标产品是 Codex；`.system` 自动安装与 `skill-installer` 的行为均是 Codex 语义。
- 文件采用开放的 Agent Skills `SKILL.md` 格式。Agent Skills 官方快速入门列举了 VS Code/GitHub Copilot、Claude Code 和 OpenAI Codex 等兼容客户端。[Agent Skills Quickstart](https://agentskills.io/skill-creation/quickstart)
- 但不能据此断言这 44 个路径在所有客户端都已测试通过。固定版本中所有 Skill 都带 OpenAI agent 配置，而 `SKILL.md` 没有统一声明跨客户端验证矩阵；部分 Skill 还依赖 Codex/OpenAI 工具或连接器。

准确说法是：格式层面具有可移植性，运行层面需要逐 Skill 校验依赖。

### 2.4 有没有 API

OpenAI 没有为这个 GitHub 仓库提供专门的 Skill Catalog API。可用接口同样是 GitHub 通用 API：

| 任务 | 推荐接口 |
|---|---|
| 获取固定目录树 | `GET /repos/openai/skills/git/trees/{sha}?recursive=1` |
| 获取单个 `SKILL.md`/目录 | `GET /repos/openai/skills/contents/{path}?ref={sha}` |
| 获取仓库级 Stars、更新时间、归档状态 | `GET /repos/openai/skills` |
| 搜索文本 | GitHub Code Search，或抓取 44 个 `SKILL.md` 后自建全文/语义索引 |

由于仓库已弃用，新系统应同时采集 `openai/plugins`，并按照 Plugin manifest 解析其中的 Skill，而不是期待 `openai/skills` 新增 API。

### 2.5 数据字段能力

| 数据 | 仓库是否直接提供 | 说明 |
|---|---|---|
| Skill 名称/描述 | 有 | 来自 `SKILL.md` frontmatter |
| 完整文件、脚本、资源 | 有 | 可固定到 commit |
| License | 有 | 各 Skill 目录独立许可文件 |
| 仓库级 Stars | GitHub 可提供 | 只属于整个 monorepo |
| 单 Skill Stars | 没有 | GitHub 不为子目录计 Stars |
| 安装量 | 没有 | 无公开安装遥测 |
| Trending/Hot | 没有 | 无排名或时间序列 |
| 原生 Skill 搜索 API | 没有 | 需要 GitHub Code Search 或自建索引 |
| 更新时间 | 有 | 可由 Git commit 历史计算 |

### 2.6 对 Vault2077 的角色

推荐定位：

- `official_source=openai`
- `trust_tier=official`
- `lifecycle=deprecated`

它适合提供 OpenAI 官方样本、质量基线、许可文件和历史 Codex 兼容 Skill，不适合承担全网发现或热门排行。采集频率可降至每周或仅监测仓库状态；真正的新上游应改成 `openai/plugins`。

## 3. GitHub API 鉴权与速率限制

两个来源自身没有专门 API，因此实际配额均取决于 GitHub API。

GitHub 官方当前规则：

| 调用方式 | 主要限额 |
|---|---:|
| 公共数据、不鉴权 | 60 请求/小时/IP |
| PAT、OAuth 用户令牌、GitHub App 用户令牌 | 通常 5,000 请求/小时 |
| GitHub App installation token | 最低 5,000 请求/小时，可按仓库/用户规模增长，通常最高 12,500 请求/小时 |
| GitHub Actions `GITHUB_TOKEN` | 1,000 请求/小时/仓库 |
| Enterprise Cloud 的部分 GitHub App/OAuth 场景 | 15,000 请求/小时 |
| GraphQL 用户令牌 | 5,000 points/小时 |

Search 与 Code Search 使用独立且更严格的限额桶，不能把它们当作普通 `core` 的 5,000 请求使用；应读取响应头或 `GET /rate_limit` 中的 `search`、`code_search` 状态。[REST API 限额](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)；[Rate Limit endpoint](https://docs.github.com/en/rest/rate-limit/rate-limit)；[GraphQL 限额](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)

Git Trees API 的递归结果单次最多 100,000 条或 7 MB；如果响应 `truncated=true`，必须按子树继续抓取。[Git Trees API 限制](https://docs.github.com/en/rest/git/trees)

对 Vault2077 的现实影响：

- 读取 VoltAgent 自身只需 1 次 README 请求；真正的成本在于验证约 194 个来源仓库。
- 读取 `openai/skills` 一次递归 tree 即可发现全部 44 个 Skill，再按需读取 `SKILL.md`。
- 生产环境建议使用 GitHub App installation token 或 GitHub Actions `GITHUB_TOKEN`，并使用 `ETag`/`If-None-Match` 条件请求；GitHub 官方说明，经过鉴权的 `304 Not Modified` 条件请求不消耗主要配额。[REST API 最佳实践](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)

## 4. 推荐的数据源组合

```text
skills.sh API
  └─ 安装量、All-time、Trending、Hot

VoltAgent/awesome-agent-skills
  └─ 跨厂商人工精选候选、发布方/类别标签
       └─ GitHub API 二次验证 SKILL.md、Stars、license、活跃度

openai/plugins
  └─ 当前 OpenAI 官方 Skill/Plugin 示例

openai/skills（deprecated）
  └─ OpenAI 历史官方 Skill 样本与兼容基线
```

VoltAgent 和 OpenAI 官方源的价值在“精选与可信度”，不在“热度”。Vault2077 应把来源信号和流行度信号分开建模：

- `source_trust`：官方发布、VoltAgent 收录、许可证、安全扫描；
- `popularity`：skills.sh 安装量、GitHub Stars；
- `momentum`：skills.sh Trending/Hot、Git commit 活跃度；
- `compatibility`：声明的客户端、标准路径、依赖验证结果。

这样不会误把“出现在 Awesome List”包装成“全网热门”，也不会因为 OpenAI 官方仓库覆盖小而错失长尾生态。
