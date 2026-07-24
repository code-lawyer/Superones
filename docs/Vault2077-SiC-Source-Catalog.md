# Vault2077 SiC：首批固定信息源目录（审核版）

> 制定日期：2026-07-23
> 决策：首批接入 **27 个固定来源**——论文 2、档案 12、课程 8、播客 5。
> 原则：SiC 只严控“源”，不在已准入来源内挑选单篇内容。前台正常显示每条更新的来源身份；不向用户展示的是来源审批状态、采集报告和内部处理过程。

## 准入规则

1. **论文**：只接入固定、长期维护的论文追踪项目；不是把全量 arXiv 变成信息流。
2. **档案**：只接入机构自营的研究、工程、发布、版本记录与正式观点；档案可以包含技术、产业与人和 AI 的关系，但不能来自个人博客、媒体或社交网络。
3. **课程**：只接入机构自营的课程目录或官方技术视频频道；频道内的新内容完整进入，不再按主题挑选。
4. **播客**：按主理人或机构在科技、科学、工程、AI 产业中的权威身份准入整档节目；准入后不按某一集的嘉宾或主题筛选。
5. 所有入口必须由发布方或节目方维护；不使用 RSSHub 等第三方转码，也不做泛网页扫描或全站 diff。

## 覆盖图

| 内容组 | 数量 | 覆盖的技术视野 |
| --- | ---: | --- |
| 论文 | 2 | 日度论文发现 + 周度开源论文追踪 |
| 档案 | 12 | 前沿 AI、系统、计算基础设施、硬核科研、模型/API 版本变更 |
| 课程 | 8 | ML 基础、模型工程、GPU/推理、机器人、研究讲座与公开课程 |
| 播客 | 5 | 前沿 AI、芯片与基础设施、研究、技术产业与社会影响的长对谈 |

## 论文（2）

| 来源 | 固定入口 | 完整接入范围 | 为什么采用 |
| --- | --- | --- | --- |
| [Hugging Face Daily Papers](https://huggingface.co/papers) | [官方 Papers 页面](https://huggingface.co/papers) | 页面正式收录的全部每日论文条目。 | Hugging Face 是开源模型生态的核心基础设施；该入口把论文、作者与模型生态连接起来，适合作为日度研究雷达。 |
| [AI Papers of the Week](https://github.com/dair-ai/AI-Papers-of-the-Week) | [项目的 GitHub 公共提交入口](https://api.github.com/repos/dair-ai/AI-Papers-of-the-Week/commits?per_page=20) | 项目正式发布的全部周度论文清单；提交只用于识别项目更新，不把提交信息当论文内容。 | 这是一个持续维护的开源论文追踪项目，提供比日榜更稳定的周度研究线；接入的是整个项目，不按单篇热度再挑选。 |

## 档案（12）

| 来源 | 固定入口 | 完整接入范围 | 为什么采用 |
| --- | --- | --- | --- |
| [Google Research Blog](https://research.google/blog/) | [官方 RSS](https://research.google/blog/rss/) | RSS 内全部正式文章。 | 覆盖 AI、系统、量子、健康、气候和科学计算，使 SiC 的硬科技观察不局限于生成式 AI。 |
| [Google DeepMind Blog](https://deepmind.google/blog/) | [官方 RSS](https://deepmind.google/blog/rss.xml) | RSS 内全部正式文章。 | 集中发布模型、AI for Science、机器人、责任治理与实验室观点，是最重要的一手前沿 AI 档案。 |
| [OpenAI News](https://openai.com/news/) | [官方 RSS](https://openai.com/news/rss.xml) | RSS 内全部正式文章。 | 同一发布面中自然包含研究、产品工程、安全、产业影响与公共表达，符合“档案”而非狭义技术文档的定义。 |
| [Anthropic News](https://www.anthropic.com/news) | [官方 sitemap](https://www.anthropic.com/sitemap.xml) | sitemap 中 `/news/` 前缀下的全部新增正式文章。 | Anthropic 没有可用的第一方 RSS；官方 sitemap 是其自有公开清单，可完整追踪新闻、产品与公共表达而不依赖第三方代理。 |
| [Anthropic Research](https://www.anthropic.com/research) | [官方 sitemap](https://www.anthropic.com/sitemap.xml) | sitemap 中 `/research/` 前缀下的全部新增正式文章。 | 将对齐、安全、评估和模型研究保留为 Anthropic 自己的完整研究线，不把研究混入媒体解释。 |
| [Meta Engineering](https://engineering.fb.com/) | [官方 RSS](https://engineering.fb.com/feed/) | RSS 内全部正式文章。 | 补足超大规模基础设施、训练和部署、开源工程与系统实践；相比泛公司新闻，技术边界更清晰。 |
| [Microsoft Research](https://www.microsoft.com/en-us/research/) | [官方 RSS](https://www.microsoft.com/en-us/research/feed/) | RSS 内全部正式文章。 | 覆盖 AI、系统、HCI、量子与科学计算，也保留研究机构对产业和社会议题的正式表达。 |
| [NVIDIA Developer Blog](https://developer.nvidia.com/blog/) | [官方 Atom](https://developer.nvidia.com/blog/feed/) | Atom 内全部正式文章。 | CUDA、推理、加速计算、机器人、仿真与 AI 基础设施的一手工程档案，是硬件—软件协同的关键来源。 |
| [OpenAI Release Notes](https://openai.com/products/release-notes/) | [日期化版本记录](https://openai.com/products/release-notes/) | 每轮识别页面最新的明确日期版本条目，持续积累为时间序列。 | 以正式能力变更为事件，避免把整站文档小修订误判为技术更新。 |
| [Anthropic Release Notes](https://docs.anthropic.com/en/release-notes/overview) | [日期化版本记录](https://docs.anthropic.com/en/release-notes/overview) | 每轮识别页面最新的明确日期版本条目，持续积累为时间序列；允许官方入口规范跳转到 `https://platform.claude.com`。 | 直接追踪 Claude、API、工具调用及开发平台的正式能力变化。 |
| [Gemini API Changelog](https://ai.google.dev/gemini-api/docs/changelog) | [日期化版本记录](https://ai.google.dev/gemini-api/docs/changelog) | 每轮识别页面最新的明确日期版本条目，持续积累为时间序列。 | Google 对 Gemini 模型、API 和开发能力的正式、可追溯更新入口。 |
| [Azure AI Foundry What's New](https://learn.microsoft.com/en-us/azure/ai-foundry/whats-new) | [日期化版本记录](https://learn.microsoft.com/en-us/azure/ai-foundry/whats-new) | 每轮识别页面最新的明确日期版本条目，持续积累为时间序列。 | 补齐模型平台、企业 AI 工程与部署能力的官方变更记录。 |

## 课程（8）

| 来源 | 固定入口 | 完整接入范围 | 为什么采用 |
| --- | --- | --- | --- |
| [Google Machine Learning Courses](https://developers.google.com/machine-learning/foundational-courses) | [官方课程目录](https://developers.google.com/machine-learning/foundational-courses) | 目录列出的全部课程及新课程或明确更新的模块。 | Google 自营的结构化 ML 课程体系；[Machine Learning Crash Course](https://developers.google.com/machine-learning/crash-course) 提供视频、交互可视化和动手练习。 |
| [Google DeepMind YouTube](https://www.youtube.com/@GoogleDeepMind) | [官方频道 RSS](https://www.youtube.com/feeds/videos.xml?channel_id=UCP7jMXSY2xbc3KCAE0MHQ-A) | 频道全部新视频。 | 研究人员讲解、研究演示与公开对谈，是 DeepMind 文字档案的原始视频补充。 |
| [Microsoft Research YouTube](https://www.youtube.com/@MicrosoftResearch) | [官方频道 RSS](https://www.youtube.com/feeds/videos.xml?channel_id=UCFtEEv80fQVKkD4h1PF-Xqw) | 频道全部新视频。 | 直接发布研究讲座、学术活动和研究人员演讲，形成可持续学习入口。 |
| [NVIDIA Developer YouTube](https://www.youtube.com/@NVIDIADeveloper) | [官方频道 RSS](https://www.youtube.com/feeds/videos.xml?channel_id=UCBHcMCGaiJhv-ESTcWGJPcw) | 频道全部新视频。 | 以 CUDA、推理、机器人与工程 workshop 将技术发布延展为可实践的学习内容。 |
| [Hugging Face YouTube](https://www.youtube.com/@huggingface) | [官方频道 RSS](https://www.youtube.com/feeds/videos.xml?channel_id=UCHlNU7kIZhRgSbhHvFoy72w) | 频道全部新视频。 | 官方 workshop、课程和发布讲解，连接模型、数据集、工具链与开源实践。 |
| [Stanford HAI YouTube](https://www.youtube.com/@StanfordHAI) | [官方频道 RSS](https://www.youtube.com/feeds/videos.xml?channel_id=UC-EnprmCZ3OXyAoG7vjVNCA) | 频道全部新视频。 | 顶尖大学官方 AI 机构，完整呈现公开课程、研究报告与技术及社会议题讲座。 |
| [MIT CSAIL YouTube](https://www.youtube.com/@MITCSAIL) | [官方频道 RSS](https://www.youtube.com/feeds/videos.xml?channel_id=UCfplsUBZ2IZitni1qzsjnRQ) | 频道全部新视频。 | 覆盖机器人、视觉、AI systems 和计算机科学研究演讲，补足产业机构视角。 |
| [NVIDIA Deep Learning Institute](https://www.nvidia.com/en-us/training/) | [官方课程目录](https://www.nvidia.com/en-us/training/) | 目录所列全部自定进度与讲师课程；新课程或明确课程实体更新才形成事件。 | NVIDIA 自营结构化训练体系，系统覆盖 GPU、生成式 AI、加速计算和机器人。 |

## 播客（5）

| 来源 | 固定入口 | 完整接入范围 | 为什么采用 |
| --- | --- | --- | --- |
| [Dwarkesh Podcast](https://www.dwarkesh.com/about) | [官方 RSS](https://api.substack.com/feed/podcast/69345.rss) | RSS 内全部新一期节目。 | Dwarkesh Patel 以深度长访谈持续连接前沿 AI、芯片、科学与技术产业的重要研究者和建设者。 |
| [Lex Fridman Podcast](https://lexfridman.com/podcast/) | [官方 RSS](https://lexfridman.com/feed/podcast/) | RSS 内全部新一期节目。 | 由 AI 与机器人研究者主理；依你的原则按主理人权威性准入整档节目，不对嘉宾或主题二次筛选。 |
| [Latent Space](https://www.latent.space/about) | [自营 Feed](https://www.latent.space/feed) | feed 内带播客音频实体的全部新一期节目；不把同一站点的文字通讯混入播客组。 | 由 AI 工程实践者主理，长期聚焦模型、Agent、推理和基础设施，是 AI 工程一线的深度长对谈来源。 |
| [The Cognitive Revolution](https://www.cognitiverevolution.ai/) | [节目官方列出的 RSS](https://feeds.megaphone.fm/RINTP3108857801) | RSS 内全部新一期节目。 | Nathan Labenz 等主理人长期采访 AI 建设者、研究者和产业参与者，覆盖技术路线及其社会后果。 |
| [Google DeepMind: The Podcast](https://deepmind.google/the-podcast/) | [官方节目页](https://deepmind.google/the-podcast/) | 官方页面按季列出的全部新一期节目。 | Google DeepMind 自营、由 Hannah Fry 主持，直接连接实验室研究、科学发现和现实世界影响。 |

## 明确排除的类型与原因

| 不接入对象 | 原因 |
| --- | --- |
| X / Twitter、播客片段、个人社交观点 | 不符合“正式、经过沉淀的发布源”要求。 |
| 个人技术博客、论文解读、复现站 | 无论作者是否知名，都不进入档案；当前产品不设“深度解读”内容组。 |
| 全量 arXiv、OpenReview、整站技术文档、Git commit | 缺少已经定义好的发布事件，接入后会把 SiC 变成无边界的信息流或变更监控器。 |
| Papers with Code、Semantic Scholar、Explainpaper | 适合作为论文详情页的检索或关联工具，不是本页的内容流来源。 |
| Anthropic 的 RSSHub 等第三方 RSS 代理 | 不是 Anthropic 自营；已采用 Anthropic 官方 sitemap 的固定路径边界。 |
| 泛公司新闻室、招聘、投资者和营销频道 | “官方”不是充分条件；没有稳定技术/研究/正式发布边界的频道不纳入。 |

## 实施约束

- 来源准入状态已经写入 [`config/sic-source-registry.json`](../config/sic-source-registry.json)，均为 `approved`；采集器只能读取该状态的条目。
- RSS、Atom、sitemap、YouTube channel feed 与日期化版本记录分别按其自然事件语义采集；不做网页 diff。
- 课程目录仅在新课程或明确课程实体变化时产生事件；不能因文案或排版细改制造更新。
- 每一张内容卡必须保留来源 ID、发布方、原始 URL 与原始发布时间，并回链原始页面。
- 前台只呈现内容本身和原始链接，不向用户展示后台来源审批、采集或数据准备状态。
- 运行时共 27 个 approved 来源：`official_api` 1、`official_index` 1、RSS/Atom 6、sitemap 2、日期化索引 5、课程目录 2、官方频道 6、播客 Feed 4。任何数量或 kind 变化都必须同步修订本目录、注册表和 SiC 设计规格。

## 参考核验

- 档案与课程的端点核验、Anthropic 无官方 RSS 的处理和频道 ID 见 [专项调研](Vault2077-SiC-Official-Sources-Research.md)。
- 论文与官方档案的产品边界见 [论文与官方档案调研](Vault2077-SiC-Papers-and-Official-Archives-Research.md)。
- 用户提供的 Frontier AI 清单的取舍依据见 [Frontier AI 资源审视](Vault2077-SiC-Frontier-AI-Resource-Audit.md)。
