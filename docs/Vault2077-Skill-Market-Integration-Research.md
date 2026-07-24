# Vault2077 Skill 与 MCP 市场接入研究

> 调研日期：2026-07-23
> 范围：只核查市场运营方的官方网站、官方文档、官方 API 与官方开源仓库。
> 目标：为 SiC 右侧新增“优选 Skill / MCP”功能单元选择可持续、可核验、可直达安装入口的数据源。
> 状态：历史调研证据。当前实现以 skills.sh OIDC（存在时）/Smithery Skill 回退和 Smithery MCP 为准，飙升值一律由本地约 24 小时快照差计算，展示为 Top 10/20；运行配置以 SiC 专项规格和部署手册为准。

## 1. 结论

建议采用两层来源，而不是把某一个市场直接视为“质量榜”：

1. **Skill 主来源：skills.sh**
   使用官方精选、Trending、详情和安全审计接口，形成“官方来源且近期活跃”的 Skill 清单。
2. **Skill 与 MCP 可部署来源：Smithery**
   Smithery 同时提供 Skill Registry API、MCP Registry API、CLI 与直接连接入口；API Key 不绑定特定部署平台，可作为非 Vercel 环境的正式数据源。
3. **MCP 身份校验：Official MCP Registry**
   官方 MCP Registry 负责标准化 `server.json`、命名空间身份与安装元数据，但不提供权威热度或安全评级，不应单独承担“优选榜”。
4. **ClawHub：观察源，不作为首发主来源**
   ClawHub 有完整公开 API、七日 Trending、下载量、官方频道与安全状态，但主要服务 OpenClaw 生态。首发接入会扩大产品边界，不建议放进主单元。

## 2. skills.sh

### 2.1 采用理由

- `skills.sh` 由开源的 Vercel Labs `skills` CLI 支撑；CLI 支持 Codex、Claude Code、Cursor 等多种 Agent，并以 MIT 许可证发布。
- 榜单来自 `skills` CLI 的匿名安装遥测，能够提供统一的安装热度口径。
- 官方 API 不需要解析网页，直接提供：
  - 全量累计榜；
  - Trending；
  - Hot；
  - 官方精选；
  - 搜索；
  - Skill 详情与文件树；
  - 内容 SHA-256；
  - 多家合作方的安全审计结果。
- 每条记录包含稳定 ID、来源仓库、去重安装量、官方详情 URL 和可交给 `npx skills add` 的安装入口。

### 2.2 重要限制

- API 当前要求 Vercel OIDC Token；文档没有提供普通长期 API Key。
- Vault2077 当前部署规范保持平台中立，并要求持久数据目录由单实例独占，因此不能预设生产环境一定运行在 Vercel。
- `skills.sh` 明确说明平台无法保证所有公开 Skill 的质量或安全。安装量只能说明采用度，不等于质量结论。

### 2.3 推荐使用规则

首发不要直接展示全站累计榜，也不要使用小时级 Hot 作为主榜。采用确定性规则：

```tex
候选集 = official curated
排序信号 = trending 中的近期安装增长
安全门槛 = audit 不得为 fail
去重 = isDuplicate != true
候选保留 = Top 20
```

如果上线时无法取得 Vercel OIDC，则不解析 skills.sh 页面，也不建立私有爬虫；切换到 Smithery 的官方 Skill API。

### 2.4 一手资料

- [skills.sh 文档与榜单口径](https://www.skills.sh/docs)
- [skills.sh API Reference](https://www.skills.sh/docs/api)
- [Vercel Labs skills CLI](https://github.com/vercel-labs/skills)
- [skills CLI 使用与安装入口](https://www.skills.sh/docs/cli)

## 3. Smithery Skills Registry

### 3.1 采用理由

Smithery 的 `GET /skills` 提供平台无关的 Bearer API Key，并返回：

- `displayName`、`description`；
- `qualityScore`；
- `verified`、`listed`；
- GitHub Star 与 Fork；
- `totalActivations`、`uniqueUsers`；
- 分类、依赖的 MCP Servers 与 Git URL。

Smithery CLI 同时支持：

```tex
smithery skill search <query>
smithery skill add <skill> --agent <agent>
```

Smithery 也支持通过标准 `npx skills add <Smithery Skill URL>` 安装 Skill，因此页面可以提供正式直达入口，而不是复制一段未经验证的安装说明。

### 3.2 推荐使用规则

当 skills.sh OIDC 不可用时：

```tex
候选集 = verified == true && listed == true
排序 = uniqueUsers 优先，其次 totalActivations，再以 externalStars 破同分
候选保留 = Top 20
链接 = Smithery Skill 官方详情页
```

`qualityScore` 的计算口径在当前 API Reference 中没有充分公开，不能把它单独作为排序依据或对用户解释为客观质量分。

### 3.3 一手资料

- [Smithery Skill 列表与搜索 API](https://smithery.ai/docs/api-reference/skills/list-or-search-skills)
- [Smithery 单个 Skill API](https://smithery.ai/docs/api-reference/skills/get-a-skill)
- [Smithery CLI](https://smithery.ai/docs/concepts/cli)
- [Smithery Skills Registry](https://smithery.ai/skills)

## 4. Official MCP Registry

### 4.1 采用理由

Official MCP Registry 是 MCP 生态的官方中央元数据仓库，提供：

- 公共 REST API；
- OpenAPI 规范；
- 标准 `server.json`；
- 包、远程 URL、命令参数与环境变量等安装元数据；
- GitHub、DNS 或 HTTP 命名空间所有权验证。

### 4.2 不能承担的职责

官方文档明确说明：

- Registry 元数据是非观点化的；
- 推荐由下游市场补充评分和社区元数据；
- 代码安全扫描由底层包注册表和下游聚合器承担；
- 当前仍处于 Preview，正式发布前可能发生破坏性变化或数据重置。

因此，它适合作为 MCP 的身份和安装元数据校验层，不适合直接生成“最热门 MCP”。

### 4.3 一手资料

- [MCP Registry 官方说明](https://modelcontextprotocol.io/registry/about)
- [Official MCP Registry API Reference](https://registry.modelcontextprotocol.io/docs)
- [Official MCP Registry](https://registry.modelcontextprotocol.io/)
- [Official MCP Registry 开源仓库](https://github.com/modelcontextprotocol/registry)

## 5. Smithery MCP Registry

### 5.1 采用理由

Smithery 的 `GET /servers` 提供：

- `verified`；
- `useCount`；
- `score`；
- `remote`、`isDeployed`；
- 主页、所有者与标准 qualified name；
- 分页、搜索和确定性 seed。

Smithery 还提供 CLI、SDK、REST Connect API、OAuth 和凭据托管，详情页本身就是正式接入入口。

### 5.2 推荐使用规则

```tex
候选集 = verified == true
排序 = useCount 降序
身份校验 = Official MCP Registry 中存在匹配命名空间或官方来源元数据
候选保留 = Top 20
链接 = Smithery 官方 Server 详情页
```

若某条 Smithery 记录无法在 Official MCP Registry 中匹配，不一定表示它无效，但首发“优选”单元应暂不展示。

### 5.3 一手资料

- [Smithery MCP Registry API](https://smithery.ai/docs/concepts/registry_search_servers)
- [Smithery Connect](https://smithery.ai/docs/use/connect)
- [Smithery CLI](https://smithery.ai/docs/concepts/cli)
- [Smithery 客户端与市场接入说明](https://smithery.ai/docs/use/listing_your_client)

## 6. ClawHub

ClawHub 是 OpenClaw 官方 Skill 与 Plugin Registry，官方 API 支持：

- 公共目录复用；
- 搜索；
- `recommended`、`trending`、`downloads` 排序；
- `official` 与 `community` 频道；
- 七日 Trending；
- 安全扫描和版本级安全结论；
- OpenAPI。

它的接入能力完整，但产品身份与安装链路明显偏向 OpenClaw。Vault2077 面向更通用的 Agent 与超级个体工具生态，首发接入 ClawHub 会让“Skill”与“OpenClaw Skill”发生混淆，因此暂列观察源。

一手资料：

- [ClawHub HTTP API](https://docs.openclaw.ai/clawhub/http-api)
- [ClawHub Quickstart](https://github.com/openclaw/clawhub/blob/main/docs/quickstart.md)
- [ClawHub 开源仓库](https://github.com/openclaw/clawhub)

## 7. 页面功能单元建议

右侧趋势榜之后新增一个视觉单元：

```tex
扩展生态
SKILL / MCP
优选榜 / 飙升榜

名称                         采用量 / 24H 新增
```

交互规则：

1. Skill 与 MCP 使用第一层文字标签切换，“优选榜 / 飙升榜”使用第二层文字标签切换，不增加卡片外框。
2. 四张逻辑榜折叠状态显示 Top 10，使用呼吸三角独立展开至 Top 20；切换 Skill/MCP 或榜单类型时恢复折叠状态。
3. 点击条目打开其市场官方详情页，不在 Vault2077 内执行安装或索取第三方密钥。
4. 页面只显示名称和一个热度指标；来源身份、安全审计与安装命令留在内部准入逻辑或官方详情页。
5. 首发刷新周期为 6 小时；飙升榜使用约 24 小时的正增量，失败时保留最近一次成功快照，不显示伪造占位排名。
6. 对外不标注内部来源交叉验证过程，用户点击条目后直达对应市场的官方详情页。

## 8. 最终接入路径

### 方案 A：生产环境可使用 Vercel OIDC

- Skill：skills.sh 官方 API。
- MCP：Smithery Server API + Official MCP Registry 校验。

### 方案 B：生产环境不使用 Vercel

- Skill：Smithery Skill API。
- MCP：Smithery Server API + Official MCP Registry 校验。
- 页面仍可将 Skill 的 GitHub 仓库交给官方 `npx skills add` CLI，但不声称数据来自 skills.sh。

首发建议按方案 B 开发接口抽象，保留 skills.sh Adapter。最终部署阶段若确认存在 Vercel OIDC，再把 Skill 主数据源切换到方案 A；页面组件和内部统一数据结构不需要改变。
