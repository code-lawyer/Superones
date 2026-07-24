# Vault2077 SiC：论文雷达、论文解析与官方技术档案研究

> 研究日期：2026-07-23
> 状态：候选源研究稿，供逐源审核；尚未自动纳入生产来源。

## 1. 本轮需求更新

SiC 的固定来源体系增加三个内容组：

1. **论文雷达**：持续追踪 AI 与硬核技术领域的新论文和上游精选论文。
2. **论文解析与复现**：收录专门解释论文、复现算法或提供带注释实现的固定频道。
3. **官方技术档案**：收录 Google、OpenAI、Microsoft 等机构自己维护的开发者文档更新、技术博客、Cookbook、课程目录和发布说明。

这些内容仍遵守 SiC 的核心原则：

- SiC 只审核和批准信息源，不对批准来源中的单条正式发布内容做二次编辑筛选。
- 开源聚合项目可以作为发现线索；只有经过逐源审核的发布频道才能进入 SiC。
- “论文雷达”表示上游来源的关注度或编辑选择，不等同于 SiC 宣称论文已经构成“重大突破”。
- 拼写修正、导航调整、依赖升级等仓库维护提交不属于“正式内容发布”。这不是内容筛选，而是先定义各来源的发布事件边界。

## 2. 论文雷达候选

| 候选源 | 类型与更新能力 | 可采集入口 | 结论 | 主要理由 |
|---|---|---|---|---|
| [Hugging Face Daily Papers](https://huggingface.co/papers) | 每日论文流，同时提供日、周、月视图和社区热度 | 官方页面；`huggingface_hub` 提供 [`list_daily_papers`](https://huggingface.co/docs/huggingface_hub/package_reference/hf_api)；底层有结构化 Daily Papers 数据 | **推荐** | 活跃、结构化、面向 AI 研究；可直接保留上游排序和热度，不需要 SiC 自建论文评分 |
| [DAIR.AI AI Papers of the Week](https://github.com/dair-ai/ML-Papers-of-the-Week) | 人工维护的每周 AI 论文清单 | 官方 GitHub 仓库中的年度与周目录 | **推荐** | 固定团队持续编辑、周频适合深度阅读，与 HF 的每日热度互补 |
| [karpathy/arxiv-sanity-lite](https://github.com/karpathy/arxiv-sanity-lite) | 定期从 arXiv 拉取论文，并按用户标签做 TF-IDF/SVM 个性化推荐 | MIT 开源项目，可自部署 | **保留为基础设施参考** | 它是个人兴趣推荐器，不是全站统一的“重要论文榜”；适合未来做用户订阅，不适合作为 SiC 首版公共榜单 |
| [Papers with Code 数据仓库](https://github.com/paperswithcode/paperswithcode-data) | 历史论文、代码、数据集与评测表数据 | CC-BY-SA 数据仓库 | **拒绝作为实时源；仅保留历史档案价值** | 公开仓库当前只适合作为存量数据参考，无法证明仍持续生成可靠的新论文流；不应让其历史名气掩盖实时性问题 |
| [Papers We Love](https://github.com/papers-we-love/papers-we-love) | 社区维护的经典计算机科学论文目录，覆盖分布式系统、数据库、安全、机器人、量子计算等 | GitHub 目录与社区站点 | **保留为专题档案，不进入“最新论文雷达”** | 领域宽、经典价值高，但它本质是阅读目录，不是稳定的每日或每周前沿追踪流 |

### 推荐的首批论文雷达

首批只启用两条互补来源：

1. Hugging Face Daily Papers：负责高频、广覆盖的 AI 新论文。
2. DAIR.AI AI Papers of the Week：负责低频、上游人工精选的周度论文。

两条来源都直接采用其自身发布结果。SiC 不重新计算“论文重要性分”，也不把点赞数包装成学术影响力。

### “硬核科技”范围的现实边界

目前未发现一个同时满足以下条件的单一开源项目：

- 持续覆盖 AI 以外的半导体、量子、机器人、材料、能源、生物工程等多个硬科技领域；
- 对“重大影响”有透明且可信的统一定义；
- 提供稳定、结构化、可持续的更新接口。

因此不建议首版制造一个笼统的“全球硬科技突破榜”。更可靠的扩展方式是后续逐垂直领域批准官方研究机构或专业组织的固定频道。Papers We Love 可用于发现这些垂直来源，但不直接替代它们。

## 3. 论文解析与复现候选

| 候选源 | 能力 | 结论 | 主要理由 |
|---|---|---|---|
| [labml.ai Annotated Deep Learning Paper Implementations](https://github.com/labmlai/annotated_deep_learning_paper_implementations) | 用简洁 PyTorch 实现配合逐段注释解释论文与算法；MIT；项目声明持续维护并近乎每周增加实现 | **推荐** | 同时具备论文理解、代码复现和公开仓库，内容边界清晰，适合 SiC 的“论文解析与复现” |
| [alphaXiv](https://www.alphaxiv.org/) | 为 arXiv 论文增加讨论、发现和辅助理解层 | **暂缓** | 产品价值明确，但需进一步核验稳定的公开 feed/API、自动生成内容标识和来源治理后再决定 |
| [Explainpaper](https://www.explainpaper.com/) | 用户上传或打开论文后按需解释文本 | **不作为信息流来源；可考虑成为论文详情工具链接** | 它主要是按需工具，不是稳定发布的编辑频道；强行当 feed 会混淆“内容源”和“阅读工具” |
| [Emergent Mind](https://www.emergentmind.com/) | 聚合研究主题与论文摘要、提供辅助解释 | **暂缓** | 需要进一步核验其选文机制、结构化入口、生成内容披露和长期可用性 |
| [Papers We Love](https://github.com/papers-we-love/papers-we-love) | 论文目录、社区讨论与历史演讲 | **不归入论文解析** | 主要价值是发现和阅读清单，不是逐篇解析或复现 |

### 产品边界

“论文解析与复现”只收录来源自己正式发布的解析文章、注释实现或复现记录。SiC 可以为这些条目生成不超过 120 字的中文导语，但不能将自动摘要包装成来源作者的结论。

按需解释工具不进入首页信息流。若后续引入，可放在论文详情页的“辅助阅读”区域，并明确它是外部工具。

## 4. 官方技术档案候选

### 4.1 OpenAI

| 候选源 | 正式发布事件 | 结论 | 说明 |
|---|---|---|---|
| [OpenAI API Changelog](https://developers.openai.com/api/docs/changelog) | 每一条带日期的 API、模型、工具、计费或弃用更新 | **推荐** | 官方、纯技术、时间结构稳定，是最明确的技术档案更新源 |
| [OpenAI Developer Blog](https://developers.openai.com/blog) | 每一篇开发者技术文章 | **推荐** | 官方开发者频道，内容集中于 API、Agents、Codex、音频、应用 SDK 等开发主题 |
| [OpenAI Cookbook](https://developers.openai.com/resources/cookbooks) / [官方仓库](https://github.com/openai/openai-cookbook) | 新增或实质更新的注册 Cookbook 文章、示例或指南 | **推荐** | 官方示例与实践指南；仓库为 MIT。采集单位应是正式 Cookbook 内容，不是每个 Git commit |

### 4.2 Google

| 候选源 | 正式发布事件 | 结论 | 说明 |
|---|---|---|---|
| [Google Research Blog](https://research.google/blog/) / [RSS](https://research.google/blog/rss/) | 每篇 Google Research 正式文章 | **推荐** | 官方研究频道，覆盖 AI、系统、科学计算与跨学科研究；已有稳定 RSS |
| [Gemini API Release Notes](https://ai.google.dev/gemini-api/docs/changelog) | 每条带日期的模型、API、SDK、弃用和功能更新 | **推荐** | 官方、纯技术、结构明确；页面内容采用 CC BY 4.0，代码示例采用 Apache 2.0 |
| [Google Machine Learning 课程目录](https://developers.google.com/machine-learning) | 新增课程、模块或官方明确标示的重大课程更新 | **推荐，但归入“课程”而非“技术档案信息流”** | 官方课程资源价值高，但课程目录不是高频 feed；应作为课程源监测发布级变化 |
| [Google Developers Blog](https://developers.googleblog.com/en/) | 每篇官方开发者博客文章 | **暂缓** | 技术价值高，但覆盖产品发布、活动与开发者生态，需逐条抽样确认是否满足“整个频道只发技术内容”的准入标准 |

### 4.3 Microsof

| 候选源 | 正式发布事件 | 结论 | 说明 |
|---|---|---|---|
| [Microsoft Research Blog](https://www.microsoft.com/en-us/research/blog/) / [RSS](https://www.microsoft.com/en-us/research/feed/) | 每篇 Microsoft Research 正式研究文章 | **推荐** | 官方研究频道，既覆盖 AI，也覆盖安全、系统、存储、医疗、材料与能源等硬科技方向 |
| [Microsoft AI DevBlogs](https://devblogs.microsoft.com/ai/) / [RSS](https://devblogs.microsoft.com/ai/feed/) | AI 分类页中的每篇正式开发者文章 | **推荐** | 官方技术聚合频道，当前内容以工程方法、评测、SDK、Agent 与生产实践为主 |
| [Microsoft Foundry What's New](https://learn.microsoft.com/en-us/azure/foundry/whats-new-foundry) | 每月 What's New 页面及其中正式新增、更新的技术能力 | **推荐** | Microsoft Learn 官方发布说明，可补足研究文章之外的平台和文档变化 |
| [MicrosoftDocs/azure-ai-docs](https://github.com/MicrosoftDocs/azure-ai-docs) | 文档仓库提交 | **不直接作为前台信息源；只作为溯源与变更核验入口** | 仓库提交包含元数据、拼写、链接和批量维护噪声；前台应使用官方 What's New 作为发布边界 |

## 5. 推荐的来源与页面结构

SiC 第二层内容区域可从原有的“视频 / 课程 / 播客”扩展为错落排布的六组内容：

1. 技术出版物
2. 论文雷达
3. 论文解析与复现
4. 课程与技术视频
5. 技术播客
6. 官方技术档案

它们与顶部三个 GitHub 榜单是两个视觉层级，但不应做成严格的上下流水线。桌面端可用不同宽度和不同高度的内容卡形成信息密度；移动端按阅读优先级自然堆叠。

建议首批新增来源：

- 论文雷达：Hugging Face Daily Papers、DAIR.AI AI Papers of the Week。
- 论文解析与复现：labml.ai Annotated Deep Learning Paper Implementations。
- 官方技术档案：OpenAI API Changelog、OpenAI Developer Blog、OpenAI Cookbook、Google Research Blog、Gemini API Release Notes、Microsoft Research Blog、Microsoft AI DevBlogs、Microsoft Foundry What's New。
- 课程补充：Google Machine Learning 课程目录。

以上仍必须按既定流程逐个向用户展示并确认，不能因为本研究稿标为“推荐”就自动启用。

## 6. 条目字段建议

### 论文雷达

- 来源
- 中文标题
- 原文标题
- 论文作者或机构
- 发布或入选日期
- 不超过 120 字的中文导语
- 原论文链接
- 代码链接（上游明确提供时）
- 上游热度或“周度精选”标记（只描述上游事实）

### 论文解析与复现

- 来源
- 中文标题
- 原文标题
- 对应论文
- 解析类型：讲解 / 注释实现 / 复现
- 发布日期
- 不超过 120 字的中文导语
- 官方解析链接
- 代码仓库（有则显示）

### 官方技术档案

- 机构与频道
- 中文标题
- 原文标题
- 更新类型：Changelog / Cookbook / 技术文章 / 文档更新
- 发布日期
- 不超过 120 字的中文导语
- 官方链接

## 7. 后续待确认

1. “论文雷达”是否接受上游平台的社区热度和编辑精选作为整个来源的发布结果，还是只允许研究机构自己的论文频道。
2. 是否将“论文解析工具”作为论文详情页的外部辅助入口，而不是首页信息流来源。
3. “硬核科技”第二阶段优先扩展的垂直方向：半导体、量子、机器人、材料、能源或生物工程。
