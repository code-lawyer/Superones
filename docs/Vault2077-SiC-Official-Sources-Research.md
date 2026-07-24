# Vault2077 SiC：档案与课程首批正式来源目录

> 调研日期：2026-07-23
> 结论：以下清单是建议直接进入 SiC `approved` 状态的**完整来源目录**，不是候选池。每个条目都由发布方自营；接入后读取其整个已定义频道，不按单篇文章、视频主题或作者再做选择。

## 准入口径

“档案”接受技术机构的正式、可持续订阅的发布频道，因此研究、产品/工程进展、系统卡、行业与社会影响判断以及正式新闻可以并存。它不是狭义 API 文档镜像库：只采集发布方明确发布的文章或版本条目，不做网页 diff，也不把文档站的每一次静态页面修改当成事件。

“课程”接受机构或研究组织正式维护的课程目录和视频频道。YouTube 是分发平台，**来源身份仍是频道的机构所有者**；视频 RSS 只读取该固定频道的新视频。

下列端点已在调研当日以只读 `HEAD` 核验：Google Research、Google DeepMind、OpenAI、Microsoft Research、NVIDIA Developer、Meta Engineering 的 feed 都返回 `200`；Anthropic 的官方 `sitemap.xml`、`/news` 与 `/research` 返回 `200`，但其 `news/rss.xml`、`research/rss.xml` 均为 `404`，故不能以第三方 RSSHub 替代。

## 档案：8 个正式发布频道

| ID | 来源与官方入口 | 固定采集端点 | 完整接入范围 | 采用原因 |
| --- | --- | --- | --- | --- |
| `google-research-blog` | [Google Research Blog](https://research.google/blog/) | [RSS](https://research.google/blog/rss/) | 此 RSS 的全部文章。 | Google Research 直接发布研究成果，覆盖 AI、软件系统、量子、健康、气候与科学计算；能让 SiC 的“硬核技术”不局限于生成式 AI。 |
| `google-deepmind-blog` | [Google DeepMind Blog](https://deepmind.google/blog/) | [RSS](https://deepmind.google/blog/rss.xml) | 此 RSS 的全部文章。 | Google DeepMind 的一手研究、模型、科学智能和产品能力发布集中于此；研究与组织观点在同一正式频道中天然共存，符合“档案”定义。 |
| `openai-news` | [OpenAI News](https://openai.com/news/) | [RSS](https://openai.com/news/rss.xml) | 此 RSS 的全部文章。 | OpenAI 用同一官方新闻发布研究、产品/工程进展、安全与社会影响说明；完整接入能保留机构自己的叙事与发布时间，而不依赖媒体转述。 |
| `anthropic-news-and-research` | [Anthropic News](https://www.anthropic.com/news) 与 [Anthropic Research](https://www.anthropic.com/research) | [官方 sitemap](https://www.anthropic.com/sitemap.xml)，仅把 `/news/` 与 `/research/` 两个发布频道的新增 URL 作为事件 | 两个列明频道内的全部正式文章。 | Anthropic 没有可用的一方 RSS；官方 sitemap 是其稳定公开清单。将 `news` 和 `research` 明确为一个组合来源，既完整保留其研究、产品、安全、社会影响表达，也不会误收 careers、法律页或帮助中心。 |
| `meta-engineering` | [Meta Engineering](https://engineering.fb.com/) | [RSS](https://engineering.fb.com/feed/) | 此 RSS 的全部文章。 | Meta 自营的工程发布频道，能够补足大规模基础设施、模型训练/部署、开源工程和系统实践；比宽泛的公司新闻源更符合 SiC。 |
| `microsoft-research-blog` | [Microsoft Research](https://www.microsoft.com/en-us/research/) | [RSS](https://www.microsoft.com/en-us/research/feed/) | 此 RSS 的全部文章。 | Microsoft Research 的正式研究档案覆盖 AI、系统、HCI、量子与科学计算，并含研究人员对产业/社会问题的正式表达。 |
| `nvidia-developer-blog` | [NVIDIA Developer Blog](https://developer.nvidia.com/blog/) | [Atom](https://developer.nvidia.com/blog/feed/) | 此 Atom 的全部文章。 | NVIDIA Developer 是 NVIDIA 自营工程频道，覆盖 CUDA、推理、加速计算、机器人、仿真和 AI 基础设施；相较 NVIDIA 泛公司博客，技术密度和边界都更稳定。 |
| `official-release-notes` | [OpenAI Release Notes](https://openai.com/products/release-notes/)、[Anthropic Release Notes](https://docs.anthropic.com/en/release-notes/overview)、[Gemini API Changelog](https://ai.google.dev/gemini-api/docs/changelog)、[Azure AI Foundry What’s New](https://learn.microsoft.com/en-us/azure/ai-foundry/whats-new) | 四个官方、日期化的 release-note/changelog 页面；仅读取各页面明确列出的版本条目 | 四个频道的全部正式版本条目。 | 大公司技术文档最有价值的“近日更新”通常在 changelog，而不是整站文档 diff。把它们聚为一个只含正式版本条目的来源，能补齐模型、API、工具和平台能力变化，同时避免把整个文档库误当内容流。 |

### `official-release-notes` 为什么是一个组合来源

这四个页面的共同边界是“发布方以日期和版本/能力变化为单位发布的正式条目”，而不是相似的主题。它们在用户体验上构成一个连贯的“官方技术更新档案”：同一内容组、同一事件语义、同一采集规则。它们不包括普通文档页、SDK commit、状态页或第三方教程。

## 课程：8 个机构维护的课程/技术视频来源

| ID | 来源与官方入口 | 固定订阅端点 | 完整接入范围 | 采用原因 |
| --- | --- | --- | --- | --- |
| `google-ml-courses` | [Google Machine Learning Courses](https://developers.google.com/machine-learning/foundational-courses) | [课程目录](https://developers.google.com/machine-learning/foundational-courses) | 目录列出的全部课程与新增/更新模块；它是目录型来源，不把每个普通开发者文档页纳入。 | Google 自营、结构化的 ML 课程入口。其 [Machine Learning Crash Course](https://developers.google.com/machine-learning/crash-course) 明确提供视频、交互可视化和练习，适合作为基础到前沿的长期学习锚点。 |
| `google-deepmind-video` | [Google DeepMind YouTube](https://www.youtube.com/@GoogleDeepMind) | [频道 RSS](https://www.youtube.com/feeds/videos.xml?channel_id=UCP7jMXSY2xbc3KCAE0MHQ-A) | 官方频道的全部新视频。 | Google DeepMind 以研究人员讲解、研究演示和公开对谈发布前沿模型、AI for Science、机器人等内容；是其文字档案的原始视频补充。 |
| `microsoft-research-video` | [Microsoft Research YouTube](https://www.youtube.com/@MicrosoftResearch) | [频道 RSS](https://www.youtube.com/feeds/videos.xml?channel_id=UCFtEEv80fQVKkD4h1PF-Xqw) | 官方频道的全部新视频。 | Microsoft Research 直接发布研究讲座、学术活动和研究人员演讲；与其档案 RSS 同属一手机构，但以可观看的讲解形式服务学习。 |
| `nvidia-developer-video` | [NVIDIA Developer YouTube](https://www.youtube.com/@NVIDIADeveloper) | [频道 RSS](https://www.youtube.com/feeds/videos.xml?channel_id=UCBHcMCGaiJhv-ESTcWGJPcw) | 官方频道的全部新视频。 | NVIDIA Developer 的 CUDA、推理、加速计算、机器人和工程 workshop 可将档案中的技术发布延展为实践材料，且频道由 NVIDIA 官方维护。 |
| `hugging-face-video` | [Hugging Face YouTube](https://www.youtube.com/@huggingface) | [频道 RSS](https://www.youtube.com/feeds/videos.xml?channel_id=UCHlNU7kIZhRgSbhHvFoy72w) | 官方频道的全部新视频。 | Hugging Face 是开源模型生态的基础设施提供者；其官方 workshop、课程与发布讲解对模型、工具链和开源实践有直接价值。 |
| `stanford-hai-video` | [Stanford HAI YouTube](https://www.youtube.com/@StanfordHAI) | [频道 RSS](https://www.youtube.com/feeds/videos.xml?channel_id=UC-EnprmCZ3OXyAoG7vjVNCA) | 官方频道的全部新视频。 | Stanford HAI 是大学官方 AI 研究机构。完整接入其公开课程、研究报告和讲座，也允许其正式的人本/社会议题内容与技术教育并列，而非由 SiC 人为切割。 |
| `mit-csail-video` | [MIT CSAIL YouTube](https://www.youtube.com/@MITCSAIL) | [频道 RSS](https://www.youtube.com/feeds/videos.xml?channel_id=UCfplsUBZ2IZitni1qzsjnRQ) | 官方频道的全部新视频。 | MIT CSAIL 是官方研究实验室，适合覆盖机器人、视觉、AI systems 与计算机科学研究演讲，补足产业机构以外的前沿教育来源。 |
| `nvidia-deep-learning-institute` | [NVIDIA Deep Learning Institute](https://www.nvidia.com/en-us/training/) | [官方培训目录](https://www.nvidia.com/en-us/training/) | 目录所列全部自定进度与讲师课程；仅在出现新课程或明确的课程实体更新时生成事件。 | NVIDIA DLI 是 NVIDIA 自营的结构化训练目录，补足 NVIDIA Developer 的视频形式，并为 GPU、深度学习、生成式 AI、加速计算与机器人提供正式课程入口。 |

### 关于“课程目录”和“频道 RSS”的事件语义

- YouTube 频道：一个新视频即一条正式发布事件，直接按官方频道 RSS 拉取。
- Google 课程目录：一个新课程或新模块才是事件；不得把教材页面的纯排版/措辞更新伪造成课程更新。实现时应保存课程 ID/URL 和公开更新时间，未发生课程实体变化则不产生内容卡片。

## 明确不接入的来源类型

1. 个人技术博客、论文解读、复现站和社交账号：即使作者极具声望，也无法满足 SiC 当前“官方发布源”边界。
2. 全量 arXiv、全量技术文档站、网页 diff 和 Git commit：它们缺乏已经定义好的发布事件，噪声会把 SiC 变成信息流或变更监控器。
3. 第三方 RSS 代理（特别是 Anthropic 的 RSSHub 路由）：不是发布方维护，不能替代 Anthropic 已验证的官方 sitemap。
4. 机构的宽泛公司新闻室、招聘、投资者和营销渠道：除非它本身是上表列出的技术/研究发布频道，否则不因“官方”而自动纳入。

## 实施落点

1. 将本文件中 16 个 ID 写入 `config/sic-source-registry.json` 并标记为 `approved`；其中 5 个 RSS、1 个 Atom、1 个 sitemap 组合源、4 个 release-note 页面、6 个 YouTube RSS 与 2 个官方课程目录。
2. `anthropic-news-and-research` 应使用标准 XML sitemap 解析，不使用第三方转码；仅承认两个预先固定的路径前缀。
3. `official-release-notes` 只规范化页面中已经按日期发布的条目；若某供应商取消这种正式条目结构，应暂停该子频道，而不是抓整站文档 diff。
4. 内容卡片须保留源 ID、发布方、原始 URL 与原始发布时间，确保用户可回到原始官方材料。

## 主要一手证据

- [Google Machine Learning Crash Course](https://developers.google.com/machine-learning/crash-course) 明确说明其包含视频、交互可视化与动手练习；[基础课程目录](https://developers.google.com/machine-learning/foundational-courses)列出课程入口。
- [OpenAI News RSS](https://openai.com/news/rss.xml)、[Google DeepMind RSS](https://deepmind.google/blog/rss.xml)、[Google Research RSS](https://research.google/blog/rss/)、[Microsoft Research RSS](https://www.microsoft.com/en-us/research/feed/)、[NVIDIA Developer Atom](https://developer.nvidia.com/blog/feed/) 与 [Meta Engineering RSS](https://engineering.fb.com/feed/) 均为发布方自有的标准订阅端点。
- [Anthropic 官方 sitemap](https://www.anthropic.com/sitemap.xml) 是其无 RSS 条件下可用的一方公开 URL 清单；正式内容边界固定为 [News](https://www.anthropic.com/news) 与 [Research](https://www.anthropic.com/research)。
- 每个视频订阅 URL 都使用 YouTube 的公开频道 feed 格式 `https://www.youtube.com/feeds/videos.xml?channel_id=…`，并链接至相应机构的官方频道主页以供人工复核。
