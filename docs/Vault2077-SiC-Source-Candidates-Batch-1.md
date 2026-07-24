# Vault2077 SiC 信息源候选审查：第一批技术出版物

研究日期：2026-07-23

## 本批结论

本批按“SiC 不筛选单篇内容，只严格筛选固定信息源”审查 8 个候选。结论不是对作者或机构技术影响力的评价，而是判断一个**具体、固定、可采集的更新入口**能否在不做二次内容筛选的前提下整源接入。

| 候选固定源 | 结论 |
| --- | --- |
| Martin Fowler 全量 Atom | 暂缓 |
| Simon Willison 长文 Atom | 推荐 |
| Julia Evans Atom | 推荐 |
| Chip Huyen 全量 RSS | 暂缓 |
| Lil’Log RSS | 推荐 |
| Sebastian Raschka / Ahead of AI 技术 Newsletter RSS | 推荐 |
| Google Research Blog RSS | 推荐 |
| Netflix TechBlog RSS | 暂缓 |

推荐接入 5 个，暂缓 3 个。暂缓项不能在采集后按单篇标题过滤；只有找到由维护者提供、边界更纯的独立官方子频道后才能重新审查。

## 1. Martin Fowler 全量 Atom

- **维护主体**：Martin Fowler 及其网站编辑协作者。
- **类型**：作者网站 / 软件工程出版物。
- **官方页面**：<https://martinfowler.com/>
- **固定更新入口**：<https://martinfowler.com/feed.atom>
- **维护证据**：[About Martin Fowler](https://martinfowler.com/aboutMe.html) 明确将该 Atom Feed 列为获取网站新内容的最佳入口。
- **近期样本**：
  - 2026-07-21，`Fragments: July 21`
  - 2026-07-16，`The Archaeologist’s Copilot`
  - 2026-07-14，`DSLs Enable Reliable Use of LLMs`
- **技术纯度核验**：网站主体是软件设计、架构、重构和工程实践，但全量 Feed 也会出现音乐、法律、领导力、写作等内容；例如 2026-01-08 的 `My favorite musical discoveries of 2025`。这与整源接入规则冲突。
- **更新节奏**：高频，通常每周多次。
- **可采集性**：官方 Atom、无需登录、字段完整、稳定性高。
- **发现路径**：直接候选；未依赖第三方聚合仓库。
- **展示边界**：即使未来通过，也只展示标题、时间、作者、原文链接和 SiC 自写中文简介，不转载正文或 Feed 全文。
- **结论**：**暂缓**。影响力很高，但全量入口不是技术专用源；不能靠 SiC 在入库后剔除非技术文章。

## 2. Simon Willison 长文 Atom

- **维护主体**：Simon Willison。
- **类型**：作者维护的编程、开源工具和 AI 工程长文频道。
- **官方页面**：<https://simonwillison.net/>
- **固定更新入口**：<https://simonwillison.net/atom/entries/>
- **维护证据**：[About Simon Willison](https://simonwillison.net/about/) 明确区分多种官方 Feed，并说明 `atom/entries/` 只包含 longer form blog entries。这里不使用包含 beats、引文和其他动态的 `atom/everything/`。
- **近期样本**：
  - 2026-07-22，`OpenAI’s accidental cyberattack against Hugging Face is science fiction that happened`
  - 2026-07-21，`A Fireside Chat with Cat and Thariq from the Claude Code team`
  - 2026-07-16，`Kimi K3, and what we can still learn from the pelican benchmark`
  - 2026-07-07，`sqlite-utils 4.0, now with database schema migrations`
- **技术纯度核验**：审查的近期长文均围绕 LLM、编程、SQLite、Python、WASM、开源工具和软件工程。主页的 sightings、短链接和 beats 不在该固定子频道中。
- **更新节奏**：高频，通常每周数篇。
- **可采集性**：作者官方 Atom、无需登录、字段完整。
- **发现路径**：直接候选；由作者官网的 Feed 说明确定正确子频道。
- **展示边界**：只使用元数据、原文链接和自写短简介；不复制正文。赞助横幅不进入 SiC 字段。
- **结论**：**推荐**，但只批准 `atom/entries/`，不批准 `atom/everything/`。

## 3. Julia Evans Atom

- **维护主体**：Julia Evans。
- **类型**：作者维护的编程、操作系统、数据库、网络和开发工具博客。
- **官方页面**：<https://jvns.ca/>
- **固定更新入口**：<https://jvns.ca/atom.xml>
- **维护证据**：作者官网提供完整文章归档和 Atom 入口，内容与其 Wizard Zines 技术教育工作一致。
- **近期样本**：
  - 2026-07-21，`Some more things about Django I've been enjoying`
  - 2026-07-17，`Learning a few things about running SQLite`
  - 2026-05-15，`Moving away from Tailwind, and learning to structure my CSS`
  - 2026-03-10，`Examples for the tcpdump and dig man pages`
- **技术纯度核验**：近期和历史栏目集中于编程语言、命令行、Git、网络、数据库、文档和开发工具；技术 zine 发布也属于技术学习内容。
- **更新节奏**：中频、不固定；通常每月数篇或间歇更新。
- **可采集性**：官方 Atom、无需登录、结构稳定。
- **发现路径**：直接候选；未依赖第三方聚合仓库。
- **展示边界**：只展示文章元数据、直链和 SiC 自写中文简介；不转载插图、zine 或正文。
- **结论**：**推荐**。

## 4. Chip Huyen 全量 RSS

- **维护主体**：Chip Huyen。
- **类型**：作者博客，主要覆盖机器学习系统和生成式 AI。
- **官方页面**：<https://huyenchip.com/blog/>
- **固定更新入口**：<https://huyenchip.com/feed.xml>
- **近期样本**：
  - 2025-01-16，`Common pitfalls when building generative AI applications`
  - 2025-01-07，`Agents`
  - 2024-07-25，`Building A Generative AI Platform`
  - 2024-04-17，`Measuring personal growth`
- **技术纯度核验**：大部分是高质量 ML/AI 工程文章，但同一 Feed 存在个人成长等非技术内容，无法整源放行。
- **更新节奏**：目前低频；实测 Feed 最新条目停留在 2025-01-16。
- **可采集性**：官方 RSS、无需登录、结构稳定。
- **发现路径**：直接候选；未依赖第三方聚合仓库。
- **展示边界**：只使用元数据和自写短简介，不转载正文。
- **结论**：**暂缓**。原因同时包括技术纯度不足和更新活跃度偏低；不能因作者影响力而放宽源级标准。

## 5. Lil’Log

- **维护主体**：Lilian Weng。
- **类型**：作者维护的 AI/ML 研究学习笔记。
- **官方页面**：<https://lilianweng.github.io/>
- **固定更新入口**：<https://lilianweng.github.io/index.xml>
- **维护证据**：[Lil’Log FAQ](https://lilianweng.github.io/faq/) 明确提供 RSS，并说明旧文章会持续修订。
- **近期样本**：
  - 2026-07-04，`Harness Engineering for Self-Improvement`
  - 2026-06-24，`Scaling Laws, Carefully`
  - 2025-05-01，`Why We Think`
  - 2024-11-28，`Reward Hacking in Reinforcement Learning`
- **技术纯度核验**：内容集中于深度学习、强化学习、LLM、扩散模型、推理和 AI 系统；未发现社交动态式内容。
- **更新节奏**：低频且不固定，但单篇深度高。
- **可采集性**：作者官方 RSS、无需登录、含标题、时间、链接和正文。
- **发现路径**：直接候选；未依赖第三方聚合仓库。
- **版权边界**：FAQ 对翻译的要求是事先联系并显著保留原文链接。SiC 不发布全文翻译，只生成不超过 120 字的中文简介并直链原文；如未来扩大翻译范围，应先取得许可。
- **结论**：**推荐**。低频不是淘汰理由，稳定且高信号即可进入固定源。

## 6. Sebastian Raschka / Ahead of AI 技术 Newsletter

- **维护主体**：Sebastian Raschka。
- **类型**：作者维护的 LLM 研究与工程长文 Newsletter。
- **官方页面**：<https://sebastianraschka.com/>
- **固定更新入口**：<https://magazine.sebastianraschka.com/feed>
- **维护证据**：[作者主页](https://sebastianraschka.com/)说明其研究和工程背景，并将 Ahead of AI 作为主要技术博客入口。
- **近期样本**：
  - 2026-07-18，`Controlling Reasoning Effort in LLMs`
  - 2026-06-27，`Using Local Coding Agents`
  - 2026-06-06，`LLM Research Papers: The 2026 List (January to May)`
  - 2026-05-16，`Recent Developments in LLM Architectures`
- **技术纯度核验**：独立 Newsletter Feed 近期条目均为 LLM 架构、研究论文、推理和编码代理技术长文。
- **排除入口**：不使用 <https://sebastianraschka.com/rss_feed.xml>，因为该综合 Feed 同时包含订阅数庆祝、售书通知等非技术动态。
- **更新节奏**：约每 2–4 周一篇。
- **可采集性**：官方 RSS、无需登录、字段完整。
- **发现路径**：直接候选；通过作者官网确认技术子频道。
- **展示边界**：只展示元数据、自写中文简介和原文链接，不转载 Newsletter 正文。
- **结论**：**推荐**，仅批准 Ahead of AI 技术 Newsletter Feed。

## 7. Google Research Blog

- **维护主体**：Google Research。
- **类型**：机构维护的研究与工程出版物。
- **官方页面**：<https://research.google/blog/>
- **固定更新入口**：<https://research.google/blog/rss/>
- **维护证据**：官网标题为 “The latest research from Google”，并按算法、机器智能、软件系统、量子、健康、气候等研究领域组织内容。
- **近期样本**：
  - 2026-07-22，`SymptomAI: Towards a conversational AI agent for everyday symptom assessment`
  - 2026-07-22，`Towards a quantum computer that learns from its errors`
  - 2026-07-15，`Towards demystifying the creativity of diffusion models`
  - 2026-07-09，`SensorFM: Towards a general intelligence and interface for wearable health data`
- **技术纯度核验**：频道边界是 Google 研究成果；即使涉及产品或社会应用，文章主体仍是研究方法、模型、系统或数据成果，不是公司新闻流。
- **更新节奏**：高频，通常每周多篇。
- **可采集性**：官方 RSS、无需登录、字段完整、更新稳定。
- **发现路径**：直接候选；机构官方研究页面。
- **展示边界**：只展示标题、日期、来源、官方链接和 SiC 自写短简介；不转载正文、图表或论文内容。
- **结论**：**推荐**。

## 8. Netflix TechBlog

- **维护主体**：Netflix Technology Blog 编辑团队与 Netflix 工程师。
- **类型**：公司技术博客。
- **官方页面**：<https://netflixtechblog.com/>
- **固定更新入口**：<https://netflixtechblog.com/feed>
- **维护证据**：[Netflix TechBlog About](https://netflixtechblog.com/about)说明该频道介绍 Netflix 如何设计、构建和运行其系统与工程组织。
- **近期样本**：
  - 2026-07-17，`In-House LLM Serving at Netflix`
  - 2026-07-13，`Building Service Topology at Scale: Architecture, Challenges, and Lessons Learned`
  - 2026-06-29，`GenPage: Towards End-to-End Generative Homepage Construction at Netflix`
  - 2026-06-23，`Toward More Controllable AI Video Editing: An Early Research Exploration at Netflix`
- **技术纯度核验**：近期 Feed 样本高度技术化，但官方 About 同时将 `company culture` 和 `product developments` 列入频道范围。由于 SiC 不做单篇筛选，需要更长历史窗口确认这些内容是否始终属于工程实践，而非一般公司文化或产品宣传。
- **更新节奏**：中高频，近期约每周 1–2 篇。
- **可采集性**：官方自定义域名上的 Medium RSS，无需登录；需监控 Medium Feed 格式变化。
- **发现路径**：直接候选；未依赖第三方聚合仓库。
- **展示边界**：只展示元数据、自写中文简介和原文链接；不转载 Medium 正文或图片。
- **结论**：**暂缓**。不是否定其技术价值，而是当前证据还不足以证明整个固定 Feed 都满足“只发技术内容”。

## 建议提交用户确认的顺序

逐个确认，不进行整批默认放行：

1. Simon Willison 长文 Atom
2. Julia Evans Atom
3. Lil’Log RSS
4. Sebastian Raschka / Ahead of AI 技术 Newsletter RSS
5. Google Research Blog RSS
6. Martin Fowler 全量 Atom（建议暂缓）
7. Chip Huyen 全量 RSS（建议暂缓）
8. Netflix TechBlog RSS（建议暂缓）
