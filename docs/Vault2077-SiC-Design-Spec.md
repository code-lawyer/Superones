# Vault2077 SiC 学院设计基线

> 状态：规范性文件。最后按实现复核：2026-07-23。五个指标榜与四个内容组是当前冻结的公开结构；具体来源以一次性审核的来源目录为准，只有目录中标记为 `approved` 的来源才能启用。

## 1. 产品任务与边界

SiC 学院观察技术趋势，不是新闻事件流。它由两层组成：

1. **指标榜**：固定平台、固定口径的五个趋势快照；
2. **内容组**：来自已批准固定发布源的完整正式更新。

`Si` 代表硅，`C` 代表碳；频道标语为“血肉苦弱，硅碳共生”。榜单是变化坐标，不是质量、安全、能力或投资评级。

SiC 不以社交媒体观点、媒体转述或临时抓取站作为内容源；不按单篇文章、单个播客嘉宾或单段视频临时挑选。

## 2. 五个指标榜

| 榜单 | 名称 | 观察对象 | 指标与边界 |
| --- | --- | --- | --- |
| 1 | GitHub 官方 Trending | GitHub 当日 Trending 仓库 | 官方 Trending 快照；显示累计 Star。 |
| 2 | GitHub 24H 新增 Star | 全站公开 GitHub 仓库 | 最近 24 小时新增 Star。 |
| 3 | GitHub 7D 新增 Star | 全站公开 GitHub 仓库 | 最近 7 天新增 Star。 |
| 4 | Hugging Face 7D 模型下载 | Hugging Face 当前累计下载 Top 1000 候选模型 | 官方 `downloadsAllTime` 每日快照的 7 日增量；不是模型调用数，也不是全 Hub 无遗漏扫描。 |
| 5 | OpenRouter 周模型使用 | 经 OpenRouter 路由的模型 | 官方 `top-weekly` 排序，反映该平台过去一周的使用，不代表全行业。 |

### 2.1 GitHub

GitHub 没有公开 Trending API。官方 Trending 使用 [`isboyjc/github-trending-api`](https://github.com/isboyjc/github-trending-api) 对 GitHub 官方榜单顺序的结构化镜像，严格保留上游数组顺序；它不是 GitHub 官方 API，因此不能伪称有官方 API。

24H 和 7D 榜从 GH Archive 的 GitHub 公共 `WatchEvent` 中按 `payload.action = started`、稳定仓库身份和滚动时间窗聚合；不得用 OSSInsight 的综合活跃度、GitHub 搜索排序或候选集合重排替代。查询需要单独配置有公共数据集权限的 BigQuery 项目与访问令牌；缺失可信数据时，榜单保持空状态。

仓库详情从 GitHub Repository API 补充当前 Star、公开简介和许可证。README 只可用于生成短介绍，永不执行其中的脚本、命令、链接或提示词。

BigQuery 查询、凭据或 GH Archive 数据不可用时，24H/7D 榜为空，不得把缺失结果显示为零。仓库详情只包含：原始仓库地址、少于 200 字的中文介绍、许可证。

### 2.2 Hugging Face

Hugging Face 官方 API 未提供 `downloads_7d`。采集器每天请求按累计下载量排序的前 1000 个模型并写入官方 `downloadsAllTime` 快照，使用距离当前 6–8 天的最近有效快照计算：

```text
downloads_7d_growth = downloads_all_time(now) - downloads_all_time(reference)
```

快照积累未满 7 天时，榜单显示“数据积累中”，不伪造排名。近 30 日 `downloads` 不能替代该榜。由于候选集合是“当前累计下载 Top 1000”，刚进入该集合且没有参考快照的模型不会进入本周榜；本榜不能宣称覆盖 Hugging Face 全部长尾模型。

### 2.3 OpenRouter

公开官方模型接口的 `sort=top-weekly` 用于周使用顺序；它不提供每个模型的公开周 Token 数，因此当前页面只显示官方排序，并以名次而不是伪造数值呈现。当前实现不读取 `OPENROUTER_API_KEY`，部署时不应配置一个无效变量。未来若另行接入获授权的官方日排名数据集，必须单独修订接口、环境变量和本规范；Token 总量不得称为请求次数、模型能力或行业市占率。

### 2.4 扩展生态：Skill 与 MCP

右栏在五项平台指标之后增加“扩展生态”单元，但不把 Skill 安装量与 MCP 调用量混为同一排行榜。单元先以 `SKILL / MCP` 切换对象，再以“优选榜 / 飙升榜”切换排序：

- Skill 优选榜：调用开始时存在 `VERCEL_OIDC_TOKEN`，则采用 skills.sh 官方精选候选集；没有 OIDC 时回退到 Smithery `verified && listed` 的 Skill，按真实采用量排序。当前实现不会在“OIDC 存在但 skills.sh 本轮请求失败”后再次调用 Smithery，而是将 Skill 标为本轮部分失败并保留旧快照。
- Skill 飙升榜：无论使用 skills.sh 还是 Smithery，都必须以相隔约 24 小时的累计采用量快照计算真实正增量；skills.sh Trending 只可作为候选发现信号，不得把累计 `installs` 标成 24H 新增。
- MCP 优选榜：只使用 Smithery `verified` 记录，按 `useCount` 排序并直达官方市场详情页。
- MCP 飙升榜：使用相隔约 24 小时的 `useCount` 快照计算正增量；参考快照不足时显示诚实空态。

四张逻辑榜均在折叠状态显示 Top 10，单榜展开后显示 Top 20。页面只显示名称与一个采用指标；点击后在新窗口打开对应市场的正式详情和接入入口，不在 Vault2077 内执行安装或索取第三方凭据。榜单不构成安全或质量保证。

## 3. 四个内容组

| 名称 | 收录边界 |
| --- | --- |
| **论文** | 经批准的论文追踪源完整发布的论文与技术报告；不把全量 arXiv 投稿直接变成信息流。 |
| **档案** | 只接入已批准技术机构的官方研究、工程与文档更新、产品和产业展望、组织新闻及其对人与 AI 关系的公开思考。 |
| **课程** | 已批准频道完整发布的系统课程、公开讲座、研究演讲、工程演示和技术 workshop。 |
| **播客** | 以权威主理人的技术、科学、工程或科技产业身份准入整档节目；节目不必是纯技术主题，但不得按单集筛选。 |

“档案”不是狭义 API 文档区；个人技术博客、独立论文讲解、复现文章、社交短帖和媒体转述均不进入 SiC。

每个来源先在来源目录中说明发布方、固定入口、完整接入边界与采用理由；目录一次性审核通过后，才完整接入其正式发布事件。一个来源只归属一个内容组，避免重复展示。

来源审批状态以 `config/sic-source-registry.json` 为准：`pending_review`、`approved`、`paused`、`rejected`。只有 `approved` 可被采集器读取；候选登记本身不构成上线。

公开页面按来源而不是按全栏直接截取：每个固定来源只保留发布时间最新的一条更新，再将各来源的最新更新按时间倒序排列。课程来源因此展示其最新一节课，播客来源展示最新一期节目，其他内容组遵循相同规则。

境外采集器负责从获批固定入口发现条目，读取标题、Feed/索引摘要、原始 URL 和发布时间并形成有界 JSON 包。境内接收端复核注册表后，只为每个来源尚未完成中文编辑的最新条目尝试一次受限原页读取，将正文材料与包内摘要一起交给 OpenAI-compatible 内容模型，生成中文标题、一句话说明和内容摘要。原页读取失败时回退到包内摘要；模型暂未配置或单次编辑失败时不得阻断原始更新落盘。已有编辑结果在后续采集时按稳定条目 ID 保留，并等待后续任务重试。

## 4. 页面与交互

1. 页面保留全站统一的频道标语区。标语区与正式内容区之间使用全站共享的满宽黑底白字静态文字缎带，由身份词 `SILICON × CARBON:` 和宣言 `WE WILL REDEFINE EVOLUTION.` 组成；两者之间使用公共组件的响应式间距，不使用连续空格或跑马灯。
2. 缎带之下采用左宽右窄双栏，栏目之间只有一条贯穿内容区的细线。左栏承担主要阅读，右栏承担实时指标。
3. 左栏按“论文、档案、课程、播客”顺序纵向排列。每组采用事件簿式刊头、日期、来源和双语标题节奏，不使用四宫格卡片，也不在栏目抬头下重复解释栏目定义。栏目标题与内容之间使用 4px 粗线建立开篇，各栏目末尾不设置收尾细线或下一栏目的额外顶线。
4. 内容折叠态只显示日期、来源、中文大标题和英文小标题，不直接铺开说明或摘要。点击条目后原地展开一句话说明、内容摘要和直达原文链接。
5. 右栏将五种指标呈现为四张视觉榜单：GitHub Trending、GitHub 增长趋势、Hugging Face 下载排行、OpenRouter 调用排行。24H 与 7D 两个 GitHub 指标共享“GitHub 增长趋势”榜，以无外框的文字标签切换，数据口径仍保持独立。
6. 全部榜单默认展示 Top 5，单榜独立展开至 Top 10。展开控制只显示缓慢呼吸的下三角；展开后变为上三角。第 6–10 条使用高度、透明度与轻微位移形成统一下拉动画。
7. 榜单行只展示名称与该榜对应指标。点击项目后，该行像双面板一样沿横轴原地翻转，背面反色显示项目地址和复制按钮；不得在行下方增加额外地址区。
8. 桌面端左栏内容反色从浏览器左缘延伸至中间分割线；右栏榜单反色从中间分割线延伸至浏览器右缘。内容文字仍与网格对齐。移动端所有反色横条向左右两侧铺满页面。
9. 分区只使用细线、留白和字体层级，不使用粗分隔线、卡片外框、圆角、阴影、渐变或额外强调色。每个内容组首页最多预览 6 个固定来源的最新更新；未批准或未采集的来源必须显示诚实的空状态。
10. “扩展生态”位于右栏平台榜单之后。`SKILL / MCP` 与“优选榜 / 飙升榜”使用两层无外框文字标签；折叠状态显示 Top 10，使用与平台榜相同的呼吸三角独立展开至 Top 20，第 11–20 条采用统一下拉动画。项目之间不使用细线分割，只通过留白、字体层级和整行反色建立节奏；悬停和键盘聚焦时反色从中间分割线延伸到浏览器右缘，移动端延伸到页面两侧。

移动端先显示四个内容组，再显示趋势榜；所有按钮可键盘操作，标签支持方向键、`Home` 与 `End` 切换，展开状态提供 `aria-expanded`。

## 5. 快照运行与配置

`POST /api/internal/sic/snapshot` 只接受 `VAULT2077_SIC_COLLECTOR_SECRET`（或内容采集共享密钥）的 Bearer 认证。该端点写入 Hugging Face、OpenRouter、GitHub 以及 Skill/MCP 扩展生态的持久化快照。各逻辑榜独立记录成功时间与数据，不得因同轮其他来源失败而丢弃成功结果，也不得把上一轮数据重新标记为本轮成功。Skill 首选 skills.sh OIDC，无法使用时回退 Smithery；MCP 使用 Smithery。扩展生态使用 6 小时快照桶并保存足够的历史，以计算 24H 增量。

`POST /api/internal/sic/content` 在生产环境只接收境外 GitHub Actions 生成的有界 JSON 采集包；境内站负责来源注册表复核、可选原页编辑增强、持久化和中文编辑。包体最多 8 MiB、2,000 个条目和 200 份来源报告，采集时间与接收时间差不得超过 48 小时。接收端重新计算条目 ID并覆盖来源元数据，只接受当前 approved 来源和批准 HTTPS origin。来源报告为 `failure` 时接口返回 HTTP `207`、`partial=true`；`empty` 是正常的无更新状态，不触发 partial。工作流必须对 `207` 报警，同时已经成功的独立结果仍然落盘。

所有公开榜单和内容组都有内部保鲜门槛。GitHub 三个 board、Hugging Face、OpenRouter、Skill 和 MCP 分别按自己的最后成功时间判断，超过 36 小时只清空对应榜单。四个内容组当前共享 `sic-content-store.json.updatedAt`：整个内容库超过 36 小时没有成功接收新包时四组全部转为空状态；它还不是逐来源独立新鲜度。部分成功的新包会刷新全局时间，失败/empty 来源的最后成功条目继续保留并显示其原始发布日期。

GitHub Actions 在内容采集周期内调用此端点；仅当 `VAULT2077_SIC_SNAPSHOT_URL` 与 `VAULT2077_SIC_COLLECTOR_SECRET` 均配置时执行。持久化数据目录沿用 `VAULT2077_DATA_DIR`，必须纳入备份。

当前实现映射：

| 职责 | 代码 / 数据 |
| --- | --- |
| 固定源注册表 | `config/sic-source-registry.json`（27 源：2/12/8/5） |
| 境外固定源采集 | `scripts/collect-sic-overseas.ts`、`lib/sic-collector.ts` |
| 境内内容接收 | `app/api/internal/sic/content/route.ts` |
| 平台与扩展快照 | `app/api/internal/sic/snapshot/route.ts`、`lib/sic-snapshots.ts`、`lib/sic-github-rankings.ts`、`lib/sic-extensions.ts` |
| 内容与快照存储 | `sic-content-store.json`、`sic-snapshots.json`、`sic-github-rankings.json`、`sic-extension-snapshots.json` |
| 前台 | `app/sic/page.tsx`、`components/sic-content-groups.tsx`、`components/sic-rankings.tsx`、`components/sic-extension-rankings.tsx` |

运行契约、环境变量、状态码、备份和恢复以 [信息管道运行说明](Content-Pipeline-Operations.md) 与 [配置与部署手册](Vault2077-Deployment-Configuration-Manual.md) 为准。

## 6. 验收标准

- 五个榜单均以已声明的固定来源和口径呈现，不混入新闻流数据。
- 桌面端为左宽右窄双栏，中间细线连续；四个内容组在左侧纵向排列，四张视觉榜单在右侧纵向排列。
- GitHub 24H 与 7D 共享一张视觉榜单并可通过标签切换，切换不得合并或改写两个指标的数据。
- 五项平台指标榜默认 Top 5、可独立展开 Top 10；Skill/MCP 扩展生态榜默认 Top 10、可独立展开 Top 20。
- 每个内容组每个固定来源最多展示一条且必须是该来源最新更新；折叠态为中英双语标题，详情按点击展开。
- 榜单展开控制不显示文字，使用慢速呼吸三角；第 6–10 条具有可见的下拉过渡，并尊重减少动态效果设置。
- 榜单项目原地翻转后高度不变；左栏反色覆盖左缘至中线，右栏反色覆盖中线至右缘。
- Hugging Face 在没有 7 日参考快照时不显示伪造增量；OpenRouter 只显示官方周序，不伪造 Token 或请求量。
- 榜单翻转背面只展示项目地址和复制按钮；仓库独立详情仍只展示仓库地址、少于 200 字介绍和许可证。
- 内容仅在来源审批后进入论文、档案、课程或播客；档案只接官方来源，播客按权威主理人准入。
