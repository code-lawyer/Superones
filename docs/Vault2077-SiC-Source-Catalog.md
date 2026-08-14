---
type: source-catalog
status: active
updated: 2026-08-14
---

# Vault2077 SiC 来源目录

本目录是 SiC 内容来源的规范清单，与 `config/sic-source-registry.json` 同步。注册表共 40 个来源：19 个 approved、19 个 retired、1 个 paused、1 个 pending_review。只有 approved 来源进入运行时。

## 准入规则

- 论文：每日通过 Hugging Face 官方 Papers API 接入当前 ISO 周的完整周度清单，保存 `paper.upvotes` 并在本地生成周热度排名，不读取论文网页；论文原始元数据回到 arXiv API 核验。
- 档案：只接入机构自营的深度研究、技术报告、系统卡、方法论与长篇工程材料；不接入新闻稿、公司公告、例行 Release Notes 或 Changelog。
- 课程：接入机构自营课程目录或官方频道 feed；频道只提供条目元数据和原始链接，不下载、转录或再发布视频/音频。
- 播客：按权威主理人或机构准入整档节目，不按单集嘉宾或主题筛选。
- approved 来源完整接纳其准入边界内的正式更新；pending_review 等待入口边界核验；retired 来源保留原因但不进入运行时。
- 同一原始内容不得同时进入 Vault 资讯瀑布与 SiC 档案；宽泛混合 Feed 在能用固定栏目、路径或专用入口稳定分流前不得 approved。
- 首次上线时，每个 approved 内容来源至少回填最近一条符合本目录边界的真实内容；Hugging Face Weekly Papers 是集合型例外，必须回填最新可用 ISO 周的完整清单。
- 周论文先以 `week + sort=publishedAt` 获取指定周全集，再按 `paper.upvotes` 降序排列；同票按 Hugging Face 提交时间降序。不得直接信任会混入跨周条目的 `week + sort=trending` 结果。
- 所有论文必须经境内 `sic_editorial` 生成中文标题、中文一句话说明和中文内容摘要，并记录 `editorialLocale=zh-CN` 与编辑版本；英文原文仍保留用于追溯，不能复制到中文字段充当处理结果。

## 论文

| 来源 | 状态 | 入口 |
| --- | --- | --- |
| Hugging Face Weekly Papers | approved | [官方 API](https://huggingface.co/api/daily_papers) |
| AI Papers of the Week | retired | [历史入口](https://github.com/dair-ai/AI-Papers-of-the-Week) |

退役原因：Hugging Face Weekly Papers 已提供稳定的官方周度 API，继续保留第二份人工周报会重复发现。

## 档案

| 来源 | 状态 | 入口 |
| --- | --- | --- |
| Google Research Blog | approved | [官方页面](https://research.google/blog/) |
| Google DeepMind Blog | approved | [官方页面](https://deepmind.google/blog/) |
| Anthropic Research | retired | [官方页面](https://www.anthropic.com/research) |
| Anthropic Engineering | retired | [官方页面](https://www.anthropic.com/engineering) |
| Claude Blog | retired | [官方页面](https://claude.com/blog) |
| Follow Builders Blogs | paused | [中央 Feed](https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-blogs.json) |
| Meta Engineering | approved | [官方页面](https://engineering.fb.com/) |
| Microsoft Research | approved | [官方页面](https://www.microsoft.com/en-us/research/) |
| NVIDIA Developer Blog | approved | [官方页面](https://developer.nvidia.com/blog/) |
| AWS Architecture Blog | approved | [官方页面](https://aws.amazon.com/blogs/architecture/) |
| AWS Machine Learning Blog | approved | [官方页面](https://aws.amazon.com/blogs/machine-learning/) |
| The Cloudflare Blog | approved | [官方页面](https://blog.cloudflare.com/) |
| Databricks | pending_review | [官方页面](https://www.databricks.com/blog) |
| OpenAI News | retired | [官方页面](https://openai.com/news/) |
| Anthropic News | retired | [官方页面](https://www.anthropic.com/news) |
| OpenAI API Changelog | retired | [官方页面](https://developers.openai.com/api/docs/changelog) |
| Anthropic Release Notes | retired | [官方页面](https://platform.claude.com/docs/en/release-notes/overview) |
| Gemini API Changelog | retired | [官方页面](https://ai.google.dev/gemini-api/docs/changelog) |
| Azure AI Foundry What's New | retired | [官方页面](https://learn.microsoft.com/en-us/azure/foundry/whats-new-foundry) |

OpenAI News 与 Anthropic News 已迁入 `config/institutional-news-registry.json` 的 information 通道。四个例行版本日志因不满足长期深度档案边界退役；重大变化应通过正式新闻或独立新闻报道进入资讯瀑布。Databricks 的宽泛 Feed 同时包含多种体裁，在能形成稳定的深度栏目过滤前保持 pending_review。

## 课程

| 来源 | 状态 | 入口 |
| --- | --- | --- |
| Google Machine Learning Courses | approved | [官方页面](https://developers.google.com/machine-learning/foundational-courses) |
| Google DeepMind YouTube | approved | [官方频道](https://www.youtube.com/@GoogleDeepMind) |
| Microsoft Research YouTube | approved | [官方频道](https://www.youtube.com/@MicrosoftResearch) |
| NVIDIA Developer YouTube | approved | [官方频道](https://www.youtube.com/@NVIDIADeveloper) |
| Hugging Face YouTube | approved | [官方频道](https://www.youtube.com/@huggingface) |
| Stanford HAI YouTube | approved | [官方频道](https://www.youtube.com/@StanfordHAI) |
| MIT CSAIL YouTube | approved | [官方频道](https://www.youtube.com/@MITCSAIL) |
| NVIDIA Deep Learning Institute | approved | [官方页面](https://www.nvidia.com/en-us/training/) |

## 播客

| 来源 | 状态 | 入口 |
| --- | --- | --- |
| Dwarkesh Podcast | approved | [官方页面](https://www.dwarkesh.com) |
| Lex Fridman Podcast | approved | [官方页面](https://lexfridman.com/podcast/) |
| Latent Space | retired | [官方页面](https://www.latent.space/about) |
| The Cognitive Revolution | approved | [官方页面](https://www.cognitiverevolution.ai/) |
| Google DeepMind: The Podcast | approved | [官方页面](https://deepmind.google/the-podcast/) |
| No Priors | retired | [官方页面](https://www.nopriors.com/) |
| Training Data | retired | [官方页面](https://trainingdata.libsyn.com/) |
| Unsupervised Learning | retired | [官方页面](https://danielmiessler.com/podcast/) |
| The MAD Podcast with Matt Turck | retired | [官方频道](https://www.youtube.com/@DataDrivenNYC/videos) |
| AI & I by Every | retired | [官方播放列表](https://www.youtube.com/playlist?list=PLuMcoKK9mKgHtW_o9h5sGO2vXrffKHwJL) |
| Follow Builders Podcasts | approved | [中央 Feed](https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-podcasts.json) |

Anthropic Engineering、Claude Blog 以及 Follow Builders 当前选择的全部博客原计划由 `feed-blogs.json` 直接进入 SiC documents；该博客 feed 因 72 小时滚动窗口允许合法空集合、无法完成生产 bootstrap，当前暂停，待上游支持历史回填或再次产生可验证内容后复核恢复。Follow Builders 当前选择的全部播客仍由 `feed-podcasts.json` 直接进入 SiC podcasts。Vault2077 默认信任其上游选择，不维护逐源准入名单；两个中央 feed 均为 `failureMode=isolated`，不可用时只报告并保留上一成功快照。

Follow Builders Blogs 不执行本地标题排除规则。招聘、推广或营销内容只要由上游 feed 提供就正常进入 SiC；境内编辑负责忠实翻译和摘要，不重新审核其发布资格。

## 变更规则

- 来源数量、状态、group、kind、入口或准入边界变化时，同一次提交修改本目录与注册表。
- 前台展示来源身份和原始链接，不展示批准流程、采集错误或内部处理状态。
- 调研文档只提供证据，不可绕过本目录直接新增运行时来源。
