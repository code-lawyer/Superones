---
type: source-catalog
status: active
updated: 2026-07-24
---

# Vault2077 SiC 来源目录

本目录是 SiC 内容来源的规范清单，与 `config/sic-source-registry.json` 同步。运行时共 29 个 approved 来源；注册表另保留 1 个 retired 来源。

## 准入规则

- 论文：接入边界明确、长期维护的论文发现来源，不把全量论文库变成信息流。
- 档案：只接入机构自营的研究、工程、发布、版本记录和正式观点。
- 课程：接入机构自营课程目录或官方频道 feed；频道只提供条目元数据和原始链接，不下载、转录或再发布视频/音频。
- 播客：按权威主理人或机构准入整档节目，不按单集嘉宾或主题筛选。
- approved 来源完整接纳其准入边界内的正式更新；retired 来源保留原因但不进入运行时。

## 论文

| 来源 | 状态 | 入口 |
| --- | --- | --- |
| Hugging Face Daily Papers | approved | [官方页面](https://huggingface.co/papers) |
| AI Papers of the Week | retired | [历史入口](https://github.com/dair-ai/AI-Papers-of-the-Week) |

退役原因：Hugging Face Daily Papers 已提供日、周、月与趋势视图，继续保留第二份人工周报会重复发现。

## 档案

| 来源 | 状态 | 入口 |
| --- | --- | --- |
| Google Research Blog | approved | [官方页面](https://research.google/blog/) |
| Google DeepMind Blog | approved | [官方页面](https://deepmind.google/blog/) |
| OpenAI News | approved | [官方页面](https://openai.com/news/) |
| Anthropic News | approved | [官方页面](https://www.anthropic.com/news) |
| Anthropic Research | approved | [官方页面](https://www.anthropic.com/research) |
| Meta Engineering | approved | [官方页面](https://engineering.fb.com/) |
| Microsoft Research | approved | [官方页面](https://www.microsoft.com/en-us/research/) |
| NVIDIA Developer Blog | approved | [官方页面](https://developer.nvidia.com/blog/) |
| OpenAI API Changelog | approved | [官方页面](https://developers.openai.com/api/docs/changelog) |
| Anthropic Release Notes | approved | [官方页面](https://platform.claude.com/docs/en/release-notes/overview) |
| Gemini API Changelog | approved | [官方页面](https://ai.google.dev/gemini-api/docs/changelog) |
| Azure AI Foundry What's New | approved | [官方页面](https://learn.microsoft.com/en-us/azure/foundry/whats-new-foundry) |

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
| Latent Space | approved | [官方页面](https://www.latent.space/about) |
| The Cognitive Revolution | approved | [官方页面](https://www.cognitiverevolution.ai/) |
| Google DeepMind: The Podcast | approved | [官方页面](https://deepmind.google/the-podcast/) |
| No Priors | approved | [官方页面](https://www.nopriors.com/) |
| Training Data | approved | [官方页面](https://trainingdata.libsyn.com/) |
| Unsupervised Learning | approved | [官方页面](https://danielmiessler.com/podcast/) |

## 变更规则

- 来源数量、状态、group、kind、入口或准入边界变化时，同一次提交修改本目录与注册表。
- 前台展示来源身份和原始链接，不展示批准流程、采集错误或内部处理状态。
- 调研文档只提供证据，不可绕过本目录直接新增运行时来源。
