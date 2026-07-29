---
type: research
status: active
updated: 2026-07-28
---

# `dukelyuu/skills-marketplace` 的 Skill 收集机制研究

> 调研对象：[`dukelyuu/skills-marketplace`](https://github.com/dukelyuu/skills-marketplace)  
> 固定版本：[`7aa4a5cc01111096f2560af837d5298c7c7382b5`](https://github.com/dukelyuu/skills-marketplace/tree/7aa4a5cc01111096f2560af837d5298c7c7382b5)  
> 证据范围：仓库 README、源码、构建配置，以及 2026-07-28 对线上公开前端与只读 API 的核验。所有源码链接均固定到上述提交。

## 结论先行

这个项目当前公开的代码**并没有实现一个可审计的“全网 Skill 采集器”**。更准确地说，它开源了：

1. 一套 Marketplace 前端；
2. GitHub Search、Awesome List、来源同步、定时设置等后端 API 的调用契约；
3. 一个只负责托管静态前端的 Node/Express 服务。

README 所说的 FastAPI、GitHub 抓取、Awesome List 解析、SKILL.md 解析、SQLite/FTS5、APScheduler、Webhook、去重和质量控制，其核心实现不在当前公开仓库中。开发环境明确把 `/api` 代理到仓库外的 `localhost:8000`；公开 Node 服务只执行 `express.static()` 并把所有路由回退到 `index.html`。[`vite.config.ts` L168-L180](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/vite.config.ts#L168-L180) [`src/server/index.ts` L9-L24](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/server/index.ts#L9-L24)

因此，能从一手源码确认的产品流程是：

```text
GitHub Search / 指定 Awesome List
              ↓
       调用外置 Discovery API
              ↓
   注册 GitHub Repo / Awesome List 来源
              ↓
     手动或 Cron 请求外置同步 API
              ↓
       前端每 3 秒轮询同步状态
              ↓
     通过外置 /skills API 搜索和展示
```

其中“外置 API”内部究竟如何抓取、解析、去重、落库和打分，无法从本仓库验证。线上部署能确认该后端确实存在，但不能替代缺失的后端源码审计。

## 1. 来源发现：不是“全网”，而是 GitHub 加 Awesome List

### 1.1 GitHub Search

发现面板默认搜索词是 `Skills`，最低 Star 数是 `1000`；发起搜索时提交 `query`、`min_stars` 和固定的 `max_results: 50`。[`DiscoveryPanel.tsx` L32-L36](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/client/src/components/marketplace/DiscoveryPanel.tsx#L32-L36) [`DiscoveryPanel.tsx` L44-L55](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/client/src/components/marketplace/DiscoveryPanel.tsx#L44-L55)

前端把这些参数发给 `POST /discovery/search`。README 进一步宣称后端会按 stars、topics、keywords 搜 GitHub，但仓库中只有 API 调用，没有 GitHub 查询构造、翻页、速率限制或结果筛选的实现。[`api.ts` L152-L157](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/client/src/lib/api.ts#L152-L157) [`README.md` L86-L90](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/README.md#L86-L90)

### 1.2 Awesome List

第二条入口是用户给出一个 Awesome List URL。UI 的默认值是 `ComposioHQ/awesome-claude-skills`，点击导入后只把 URL 原样发给 `POST /discovery/awesome`。[`DiscoveryPanel.tsx` L34-L36](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/client/src/components/marketplace/DiscoveryPanel.tsx#L34-L36) [`DiscoveryPanel.tsx` L62-L73](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/client/src/components/marketplace/DiscoveryPanel.tsx#L62-L73) [`api.ts` L159-L161](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/client/src/lib/api.ts#L159-L161)

README 说后端会“爬取 curated lists 并提取仓库链接”，但链接识别、相对链接处理、非 GitHub 链接过滤、递归深度和失败重试均未开源。[`README.md` L86-L90](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/README.md#L86-L90)

### 1.3 “Full Discovery”的真实含义

“Full Discovery”按钮并没有从前端传入“全网”范围；它只向 `POST /discovery/run` 发送一个 `min_stars` 数字。另有 `/discovery/presets` 契约，预期返回 `search_queries` 和 `awesome_lists`，但预设内容及并行执行逻辑都在缺失的后端中。[`DiscoveryPanel.tsx` L77-L87](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/client/src/components/marketplace/DiscoveryPanel.tsx#L77-L87) [`api.ts` L163-L170](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/client/src/lib/api.ts#L163-L170)

来源边界也很明确：当前 `Source.type` 只有 `github_repo` 和 `awesome_list`；GitLab/Bitbucket adapter 被放在未来 V3.0 路线图中。因此“全网”是产品宣传语，不是采集覆盖范围的技术描述。[`types.ts` L54-L65](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/client/src/lib/types.ts#L54-L65) [`README.md` L305-L312](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/README.md#L305-L312)

### 1.4 线上部署核验：所谓“全量”实际是 7 个查询 + 1 个列表

线上前端的构建产物把 API 基址硬编码为 `https://skillhub-api.fly.dev/api`，说明公开网站使用了仓库之外单独部署的后端。[线上前端 bundle](https://www.skill-marketplace.com/assets/index-BaCPifA-.js)

该后端的公开 OpenAPI 契约进一步确认：

- `/discovery/search`：按查询词搜索 GitHub，并应用 `stars >= min_stars`；
- `/discovery/awesome`：解析一个 Awesome List，并把其中链接的仓库自动注册为 source；
- `/discovery/run`：执行 GitHub Search 加所有预设 Awesome Lists；
- `SearchRequest.max_results` 默认是 50，`FullDiscoveryRequest.min_stars` 默认是 1000。

证据见[线上 OpenAPI](https://skillhub-api.fly.dev/openapi.json)。

截至 2026-07-28，`/discovery/presets` 返回的完整预设只有：

```json
{
  "search_queries": [
    "Skills",
    "agent skills",
    "claude skills",
    "mcp skills",
    "antigravity skills",
    "opencraw skills",
    "kiro skills"
  ],
  "awesome_lists": [
    "https://github.com/ComposioHQ/awesome-claude-skills"
  ]
}
```

因此它的“Full Discovery”不是全网爬虫，而是**对 GitHub 执行有限关键词检索，再解析一个预置 Awesome List**。[线上 discovery presets](https://skillhub-api.fly.dev/api/discovery/presets)

线上 source 列表也暴露出该策略的精度问题：138 个 source 中只有 21 个 active，大量新 source 是 `pending` 且 `skills_count: 0`；候选中还出现 LibreChat、Dify、JavaGuide、Nacos 等普通高 Star 项目。由此可以合理推断，发现阶段偏重“关键词 + Star 数”的宽召回，没有在注册 source 前严格证明仓库内确实存在有效 Skill。[线上系统状态](https://skillhub-api.fly.dev/api/system/status) [线上 source 列表](https://skillhub-api.fly.dev/api/sources)

## 2. 来源登记、抓取与同步

来源管理页允许登记 URL、branch 和 `skills_path`，默认 branch 为 `main`、路径为 `/skills`；UI 还显示 GitHub Repo / Awesome List 两种类型。[`Sources.tsx` L84-L125](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/client/src/pages/Sources.tsx#L84-L125)

前端可确认的同步动作只有：

- `POST /sources` 新建来源；
- `PUT /sources/{id}` 修改来源；
- `POST /sources/{id}/sync` 触发一次同步；
- `GET /sources/{id}/logs` 获取日志；
- `GET /sources/{id}/sync/status` 获取状态。

这些都是 Axios 请求封装，不包含 clone、GitHub Contents API、GraphQL、raw file 下载或 Webhook 处理代码。[`api.ts` L85-L121](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/client/src/lib/api.ts#L85-L121) [`api.ts` L135-L145](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/client/src/lib/api.ts#L135-L145)

手动同步后，前端只是在本地把来源标为 `syncing` 并加入轮询集合；它每 3 秒查询一次同步状态，完成后更新 `skills_count`、`last_synced_at` 和错误信息。这里的 3 秒是**状态刷新频率**，不是全量采集频率。[`useSources.ts` L29-L64](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/client/src/hooks/useSources.ts#L29-L64) [`useSources.ts` L85-L92](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/client/src/hooks/useSources.ts#L85-L92)

README 还宣称支持 push 触发同步及 HMAC-SHA256 Webhook 校验，但当前公开服务端没有相应路由或校验代码。[`README.md` L79-L84](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/README.md#L79-L84) [`src/server/index.ts` L9-L24](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/server/index.ts#L9-L24)

## 3. 解析与标准化：只有输出模型，没有采集解析器

前端定义了后端应返回的标准化 `Skill` 结构，包括：

- `id`、`name`、`description`；
- stars、forks、downloads；
- source、`github_url`；
- tags、language、license、version、platforms；
- `skill_md_preview`、`skill_md_content`；
- files、star history、related skills、versions。

这说明产品希望把不同来源统一成一套 Skill 记录，但该接口只是 TypeScript 类型，并没有说明字段如何从仓库、GitHub 元数据或 SKILL.md 中生成。[`types.ts` L4-L27](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/client/src/lib/types.ts#L4-L27)

仓库中确实有一个 frontmatter parser，但它属于手工 Skill 编辑器：用正则找 `---` 区块，再按简单的 `key: value` 和列表项拆分；只要能走完解析就返回 `valid: true`。它不是同步管线中的 SKILL.md 解析器，也没有字段必填、类型、平台兼容性或安全语义校验。[`SkillEditor.tsx` L56-L82](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/client/src/pages/SkillEditor.tsx#L56-L82)

所以以下关键问题没有公开答案：

- 一个仓库里有多个 `SKILL.md` 时如何拆分；
- `skills_path` 之外是否递归搜索；
- 大小写、软链接、子模块和 monorepo 如何处理；
- 无 frontmatter、字段冲突和非法 YAML 如何处理；
- GitHub topics、README 和 SKILL.md 字段谁优先；
- Skill 的稳定 ID、版本和 canonical URL 如何生成。

## 4. 存储与索引：README 有架构宣称，公开运行代码没有实现

README 宣称：

- SQLite + FTS5 做全文检索；
- FastAPI + Uvicorn 提供 API；
- SQLModel/SQLAlchemy 做 ORM；
- APScheduler 做定时任务；
- httpx 访问 GitHub REST + GraphQL。

证据见 [`README.md` L49-L55](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/README.md#L49-L55) 和 [`README.md` L142-L150](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/README.md#L142-L150)。

但当前公开可执行代码呈现的是另一件事：

- 浏览器 API 基址是 `/api`；开发环境代理到外置 `http://localhost:8000`。[`api.ts` L8-L12](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/client/src/lib/api.ts#L8-L12) [`vite.config.ts` L168-L180](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/vite.config.ts#L168-L180)
- Node 服务只托管构建产物，没有任何 `/api` 路由。[`src/server/index.ts` L9-L30](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/server/index.ts#L9-L30)
- Dockerfile 只构建并运行这个 Node 前端服务，没有 Python、SQLite 或后端进程。[`src/Dockerfile` L1-L22](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/Dockerfile#L1-L22)
- `/skills` 客户端只是把 search、tags、source_id、sort、page、page_size 转交给外置 API，因此无法看到 FTS schema、tokenizer、排序公式或索引更新事务。[`api.ts` L37-L56](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/client/src/lib/api.ts#L37-L56)

README 的项目结构也列出了 `backend/app/api`、`models`、`services`、`tasks` 等目录，但这些实现没有出现在当前公开运行链路中。[`README.md` L230-L253](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/README.md#L230-L253)

结论是：SQLite/FTS5 可以视为作者描述的目标或私有部署架构，不能视为已由当前开源源码证实的实现。

## 5. 更新频率与并发

设置页提供每 1、3、6、12 小时、每日一次及自定义 Cron；UI 默认值是每 6 小时，并发默认值是 3。[`Settings.tsx` L25-L39](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/client/src/pages/Settings.tsx#L25-L39)

保存设置时，前端只把 `sync_cron` 和 `sync_concurrency` 发给 `PUT /system/settings`。[`Settings.tsx` L55-L67](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/client/src/pages/Settings.tsx#L55-L67)

因此可以确认的是“产品 UI 默认建议每 6 小时、并发 3”，不能确认生产 scheduler 是否按此运行，也不能确认：

- 同步是全量扫描还是按 commit SHA 增量；
- 失败重试、退避和超时；
- GitHub API 配额分配；
- 多来源并发时的锁、幂等和事务边界；
- 已删除或重命名 Skill 的处理方式。

线上数据提供了一个更具体但不完全一致的信号：`openai/skills` 的同步日志在 2026-07-26 至 2026-07-28 基本每 6 小时执行一次，而 `/system/status` 当时返回的 `cron_expression` 是每小时一次。这个差异意味着系统状态里的全局 Cron 不能直接等同于每个 source 的实际同步节奏。[线上 `openai/skills` 同步日志](https://skillhub-api.fly.dev/api/sources/10/logs?page_size=10) [线上系统状态](https://skillhub-api.fly.dev/api/system/status)

## 6. 去重与质量控制

### 6.1 去重

Discovery 前端只展示 `found`、`added`、`skipped`、`errors`、`links_found`、`total_added` 等结果计数。这能说明后端协议预留了“跳过”概念，但不能证明它按什么规则去重。[`DiscoveryPanel.tsx` L20-L27](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/client/src/components/marketplace/DiscoveryPanel.tsx#L20-L27) [`DiscoveryPanel.tsx` L185-L207](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/client/src/components/marketplace/DiscoveryPanel.tsx#L185-L207)

公开源码中看不到 repo URL 规范化、`owner/repo/path` 唯一键、内容哈希、fork 合并、同名 Skill 冲突或数据库唯一约束。`SyncLog` 的 added/updated/removed 计数同样只是返回模型，不是判重算法。[`types.ts` L68-L80](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/src/client/src/lib/types.ts#L68-L80)

### 6.2 质量与安全

README 把“自动质量评分（静态分析、沙箱测试）”和“安全扫描/质量徽章”放在未来 V1.1，把“30+ 规则验证引擎”和描述质量评分放在未来 V1.2。这等于从项目自身路线图确认：这些能力不是当前 V1.0 已有的质量门禁。[`README.md` L275-L291](https://github.com/dukelyuu/skills-marketplace/blob/7aa4a5cc01111096f2560af837d5298c7c7382b5/README.md#L275-L291)

当前能看到的只有：

- 搜索时用最低 Star 数作为候选阈值；
- 市场页可按 stars 等字段排序；
- 编辑器做非常浅的 frontmatter 语法识别。

Star 数是流行度信号，不是安全、正确性或 Skill 质量证明。

线上样本也说明元数据 enrichment 尚不完整：`obra/superpowers` 的 `writing-skills` 已保存完整 `skill_md_content`，但 `tags`、`platforms`、`files`、`versions` 和 `star_history` 均为空。它证明后端至少能导入 SKILL.md 正文和仓库级 GitHub 元数据，但不能证明 README 宣称的文件树、版本历史和质量体系已经普遍落地。[线上 Skill 样本](https://skillhub-api.fly.dev/api/skills/543)

## 7. 对“它怎么收集全网 Skill”的准确回答

按当前公开源码，最准确的回答是：

> 它没有开源“收集全网 Skill”的完整实现。它把来源发现限定为 GitHub Search 和用户指定的 Awesome Lists；线上所谓“Full Discovery”目前就是 7 个搜索词加 1 个 Awesome List。前端把发现与同步任务交给一个未包含在仓库中的 FastAPI 后端，再轮询结果并通过 `/skills` API 展示。README 描述该后端使用 GitHub API、SQLite/FTS5 和 APScheduler，但抓取、SKILL.md 解析、标准化、存储、索引、去重和质量控制代码均无法从本仓库审计。

如果要复用这个项目的“采集能力”，仅 clone 当前仓库是不够的；至少还需要作者公开或另行实现 `localhost:8000` 对应的后端，包括 Discovery、Source Sync、Parser、Database/FTS、Scheduler、Webhook、Dedup 和 Quality Gate。
