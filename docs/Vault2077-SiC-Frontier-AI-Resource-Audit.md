# Vault2077 SiC：Frontier AI 资源清单审计

> 审计日期：2026-07-23
> 状态：候选源研究稿；任何“推荐”仍须逐源向用户展示并确认后才能进入生产来源。
> 原则：SiC 不筛选已批准来源中的单条正式发布，只在来源层面做严格控制。

## 1. 结论摘要

用户提供的清单很有价值，适合作为“候选源发现池”，但不能原样成为生产白名单。清单混合了四种不同对象：

1. **出版源**：按时间发布正式内容，可进入 SiC 内容流。
2. **数据源**：持续更新结构化指标或排行榜，应形成独立数据卡或看板。
3. **工具源**：用于检索、引用、推荐或辅助阅读，只服务详情页和后台。
4. **资料库**：静态或持续修订的文档、课程目录；只有稳定的 Changelog、Release Notes、正式新增课程才构成可采集事件。

最重要的纠正：

- Papers With Code 具有历史档案价值，但公开数据已经不能证明仍是可靠的实时论文流，不应作为实时来源。
- Hugging Face Open LLM Leaderboard 已于 2025-03-13 正式停止维护，不能继续列为现役榜单。
- arXiv 有官方 API、RSS 和每日分类更新，但它是原始投稿流，不是“重要论文榜”。直接接入七个分类会在“整源收录”规则下制造巨大噪声。
- Semantic Scholar 是论文元数据、引用关系与推荐基础设施，不是固定编辑出版源。
- Lex Fridman 只有“筛选 AI 嘉宾后”才符合清单目标，这与 SiC 不做单条筛选的原则冲突，因此不能整源准入。
- OpenRouter 的排名反映 OpenRouter 平台内的调用与消费，不能称作全行业市场份额。

## 2. 准入类型

| 类型 | 正式事件 | 页面位置 | 是否进入普通内容流 |
|---|---|---|---|
| 出版源 | 新文章、新一期播客、新视频、新论文解析、新课程 | SiC 对应内容组与时间归档 | 是 |
| 数据源 | 数据集刷新、新一轮榜单、方法版本变化 | 独立指标卡、排行榜或趋势看板 | 否 |
| 工具源 | 查询、引用、推荐、辅助解析 | 论文或项目详情页 | 否 |
| 资料库 | Release Notes、Changelog、正式新增课程或文档版本 | 官方技术档案、课程 | 仅正式更新事件进入 |

## 3. 播客逐源审计

| 来源 | 整源纯度与稳定入口 | 建议 | 原因 |
|---|---|---|---|
| [Dwarkesh Podcast](https://www.dwarkesh.com/podcast) | 长篇深度访谈，AI、芯片、科学占比高，但也覆盖经济、历史与地缘议题 | **观察，不直接准入** | 内容价值很高，但整源并非只发布技术内容；若未来存在稳定的官方 AI 子频道才可重新审核 |
| [Lex Fridman Podcast](https://lexfridman.com/podcast/) | 官方节目覆盖 AI、科学、政治、历史、体育与个人经历 | **拒绝整源准入** | “只听 AI 嘉宾”本身就是逐条筛选，与既定规则冲突 |
| [Latent Space](https://www.latent.space/podcast) | 聚焦 AI Engineering、模型、Agent、推理与基础设施 | **推荐** | 边界明确、持续更新、节目本身就是技术频道 |
| [The Cognitive Revolution](https://www.cognitiverevolution.ai/) | 聚焦前沿 AI、研究、产品、治理与安全 | **推荐，需确认治理内容也属于 SiC 技术观察范围** | 整体围绕 AI 革命，但部分节目偏治理与产业判断，不宜错误标成纯工程频道 |
| [Google DeepMind Podcast](https://deepmind.google/discover/the-podcast/) | Google DeepMind 官方研究访谈 | **推荐** | 官方维护、技术与科学边界明确、研究负责人直接参与 |

## 4. 课程与技术视频逐源审计

| 来源 | 建议 | 说明 |
|---|---|---|
| [Google DeepMind YouTube](https://www.youtube.com/@googledeepmind) | **推荐** | 官方研究、项目、讲座与技术发布频道 |
| [Stanford HAI](https://hai.stanford.edu/) | **观察** | 官方内容高质量，但同时覆盖政策、社会影响与活动；需确认整源边界或找到官方课程/研究讲座子频道 |
| [Berkeley AI Research](https://bair.berkeley.edu/) | **推荐候选** | 研究讲座与实验室成果边界清楚；上线前核验稳定的官方视频入口 |
| [MIT CSAIL](https://www.csail.mit.edu/) | **推荐候选** | 覆盖 AI、机器人、系统、计算机视觉等硬技术；上线前核验视频发布事件边界 |
| [Microsoft Research](https://www.microsoft.com/en-us/research/) | **推荐** | 官方研究讲座与论文作者解读，可与其 Research Blog 共享机构标识并去重 |
| [NVIDIA Developer](https://developer.nvidia.com/) | **推荐** | 开发者技术频道，覆盖 CUDA、TensorRT、推理、机器人与模型工程 |
| [Hugging Face](https://huggingface.co/learn) | **推荐候选** | Workshop、开源模型与库教程价值高；课程与视频应分别定义正式发布事件 |
| [Yannic Kilcher](https://www.youtube.com/@YannicKilcher) | **观察** | 个人维护的论文解析频道，内容高度技术化；需复核当前更新频率及是否仍保持整源纯技术 |
| [Two Minute Papers](https://www.youtube.com/@TwoMinutePapers) | **推荐候选** | 科研论文通俗解析，适合作为“论文解析”而非原始论文雷达 |
| Arxiv Insights | **暂缓** | 历史内容有价值，但当前稳定更新状态和官方入口需要复核；不能仅凭过去声誉准入 |

## 5. 官方研究与技术出版源

| 来源 | 类型 | 建议 | 正式发布事件 |
|---|---|---|---|
| [OpenAI Research Publications](https://openai.com/research/index/publication/) | 出版源 | **推荐** | 每条研究论文、评测、安全研究或 System Card；System Card 作为条目类型，不另建重复源 |
| [OpenAI Engineering](https://openai.com/news/engineering/) | 出版源 | **推荐** | 每篇官方工程文章 |
| [Anthropic Research](https://www.anthropic.com/research) | 出版源 | **推荐** | 每篇正式研究成果 |
| [Anthropic Engineering](https://www.anthropic.com/engineering) | 出版源 | **推荐候选** | 每篇官方工程文章；上线前复核稳定列表入口 |
| [Google DeepMind Research](https://deepmind.google/research/) | 出版源 | **推荐** | 每项正式研究、论文或技术项目发布 |
| [Google Research Publications](https://research.google/pubs/) | 出版源 | **推荐** | 每条机构论文记录；覆盖 AI 之外的系统、硬件、量子、健康、机器人等硬科技 |
| [Meta AI Publications](https://ai.meta.com/results/?content_types%5B0%5D=publication&page=1) | 出版源 | **推荐** | 每条官方 Publication |
| [Microsoft Research Blog](https://www.microsoft.com/en-us/research/blog/) | 出版源 | **推荐** | 每篇研究文章；已有官方 RSS |
| [NVIDIA Research Publications](https://research.nvidia.com/publications) | 出版源 | **推荐** | 每条官方论文记录，覆盖 AI、芯片、图形、机器人、HPC 等 |

## 6. 论文来源、解析项目与辅助工具

| 来源 | 准入角色 | 建议 | 说明 |
|---|---|---|---|
| [Hugging Face Daily Papers](https://huggingface.co/papers) | 出版源 / 上游精选 | **推荐** | 有日、周、月视图和官方结构化访问能力；保留其上游排序，不由 SiC 重算“影响力” |
| [DAIR.AI Papers of the Week](https://github.com/dair-ai/ML-Papers-of-the-Week) | 出版源 / 上游精选 | **推荐** | 固定团队维护的周度论文清单，与 HF 高频流互补 |
| [arXiv](https://info.arxiv.org/help/api/index.html) | 元数据源 | **不进入主内容流** | 官方 API 和 RSS 可用；作为原文、作者、分类、版本的底层解析器，不把原始投稿量包装成趋势 |
| [Semantic Scholar API](https://www.semanticscholar.org/product/api) | 工具源 | **推荐作详情页增强** | 提供论文、作者、引用、推荐和数据集；用于引用关系与研究路线，不作为编辑信息流 |
| [Papers With Code](https://paperswithcode.com/) | 历史档案 | **拒绝作实时源** | 论文—代码—Benchmark 关联理念仍值得参考，但实时维护状态不满足生产要求 |
| [karpathy/arxiv-sanity-lite](https://github.com/karpathy/arxiv-sanity-lite) | 基础设施参考 | **不作公共来源** | 本质是个性化标签推荐器，适合未来个人订阅，不是统一重要论文榜 |
| [labml.ai Annotated Implementations](https://github.com/labmlai/annotated_deep_learning_paper_implementations) | 论文解析与复现出版源 | **推荐** | 逐段注释、PyTorch 实现、开源仓库，发布边界清楚 |
| [Explainpaper](https://www.explainpaper.com/) | 阅读工具 | **可作详情页外部工具** | 按需解释，不是持续出版频道 |

## 7. 官方技术档案与框架文档

“文档网站”本身不是更新流。SiC 应追踪其官方 Changelog、Release Notes、正式技术文章或稳定 Release，而不是监控每一次页面编辑。

| 来源 | 建议 | 推荐采集边界 |
|---|---|---|
| [OpenAI API Changelog](https://developers.openai.com/api/docs/changelog) | **推荐** | 每条带日期的 API、模型、工具或弃用更新 |
| [OpenAI Developer Blog](https://developers.openai.com/blog) | **推荐** | 每篇官方开发者技术文章 |
| [OpenAI Cookbook](https://developers.openai.com/resources/cookbooks) | **推荐** | 新增或实质更新的正式 Cookbook，不采集普通 commit |
| [Claude Platform Release Notes](https://platform.claude.com/docs/en/release-notes/overview) | **推荐** | 每条 API、SDK、Console、模型生命周期更新 |
| Anthropic Docs | **作为资料库** | 由 Release Notes 与新发布的正式指南产生条目，不监控所有页面 diff |
| [Gemini API Release Notes](https://ai.google.dev/gemini-api/docs/changelog) | **推荐** | 每条模型、API、SDK、弃用与功能更新 |
| Google AI Studio / Gemini Docs | **作为资料库** | 以 Release Notes 为事件边界 |
| Hugging Face Docs | **作为资料库** | Transformers、Datasets、TRL、PEFT、Diffusers、Accelerate 分别追踪官方 Release；不抓全站页面变化 |
| [LangChain Changelog](https://docs.langchain.com/oss/python/releases/changelog) | **第二梯队候选** | 官方 Changelog，具有 RSS；偏框架工程，不是 Frontier AI 上游信号 |
| LlamaIndex Docs | **第二梯队候选** | 采用官方 GitHub Release，不监控全站文档 |
| vLLM Docs | **推荐候选** | 采用官方 Release，属于高价值推理基础设施信号 |
| Ray Docs | **暂缓** | Ray 整体覆盖通用分布式计算；若无 AI 专属稳定频道，整源纯度不足 |
| PyTorch Docs | **资料库；全量 Blog 暂缓** | 官方 Release 可用；基金会活动、社区和新闻混在 Blog 内，不宜全量准入 |

## 8. Google AI 生态逐源判断

| 来源 | 建议 | 说明 |
|---|---|---|
| Google Labs | **暂缓** | 实验产品发现价值高，但全频道不等同于纯技术出版源 |
| Google DeepMind Blog / Research | **推荐** | 研究与技术项目的官方发布渠道 |
| Google AI Developers | **推荐其 Gemini Release Notes** | 文档库本身不作 feed |
| [Kaggle Learn](https://www.kaggle.com/learn) | **推荐作课程目录** | 只在正式新增课程或模块时生成条目 |
| [Google Research Publications](https://research.google/pubs/) | **推荐** | 机构论文源，兼顾 AI 与硬科技 |
| [TensorFlow Blog](https://blog.tensorflow.org/) | **观察** | 技术内容可靠但更新频率已经明显降低，不应占首批核心位置 |
| NotebookLM 更新 | **暂缓** | 未找到独立、稳定、纯技术的官方 Changelog；Google Help 页面不是技术更新流 |
| [Gemini Developer Updates](https://ai.google.dev/gemini-api/docs/changelog) | **推荐** | 与 Gemini API Release Notes 合并为同一来源，避免重复 |

## 9. Frontier AI 数据源与排行榜

| 来源 | 指标语义 | 建议 |
|---|---|---|
| [Epoch AI Data](https://epoch.ai/data) | 模型、能力、算力、数据中心、芯片、公司与硬件数据；提供下载、方法与许可 | **强烈推荐为结构化数据源** |
| [Epoch AI Data Insights](https://epoch.ai/) | 基于 Epoch 数据的正式分析文章 | **推荐为出版源** |
| [Artificial Analysis API](https://artificialanalysis.ai/api-reference/) | 模型质量、价格、速度等第三方评测 | **推荐候选**；先完成方法、授权、API 稳定性审计 |
| [LMArena](https://lmarena.ai/) | 众包匿名对战产生的人类偏好排名 | **推荐候选**；必须明确是偏好，不是客观“总能力” |
| Hugging Face Open LLM Leaderboard | 已停止维护 | **拒绝** |
| [OpenRouter Rankings](https://openrouter.ai/rankings) | OpenRouter 内的周度调用、消费份额、任务与工具使用 | **推荐候选**；只能称“OpenRouter 生态使用趋势” |
| Papers With Code SOTA | 历史 Benchmark 与论文—代码关联 | **不作现役数据源** |
| arxiv-sanity | 个性化论文推荐 | **不作公共排行榜** |
| GitHub Trending（AI 分类） | GitHub 项目发现 | **不新增一个“AI Trending”榜** | 已确定的官方 Trending、24H、7D 三榜解决全站趋势；AI 分类可在未来作为查看维度，不能改变榜单口径 |

## 10. 对原“只保留 10 个资源”的修订

原 Top 10 适合个人关注，不适合直接成为 SiC 白名单。建议替换为面向产品的首批组合：

1. Latent Space
2. Google DeepMind Podcas
3. Google DeepMind Research / Video
4. OpenAI Research Publications
5. Anthropic Research + Claude Platform Release Notes
6. Google Research Publications
7. Hugging Face Daily Papers
8. DAIR.AI Papers of the Week
9. labml.ai Annotated Implementations
10. Epoch AI Data + Data Insights

其中 Lex Fridman 因整源不纯技术退出；Papers With Code 因实时性问题退出；arXiv 改为底层元数据源；Yannic Kilcher保留在观察名单，待核验当前稳定更新状态。

## 11. 推荐的下一项产品决策

在继续逐源审批前，应先确认以下分类是否成为 SiC 的正式规则：

- **出版源**：每条正式发布进入对应内容组；
- **数据源**：生成独立指标卡和榜单，不进入普通内容流；
- **工具源**：只用于详情页和后台增强；
- **资料库**：只有明确的 Release Notes、Changelog、Release 或新增课程事件进入前台。

确认后，再严格按来源逐个展示：来源身份、内容边界、更新入口、授权/接口、样例条目、推荐结论，由用户逐个批准。
