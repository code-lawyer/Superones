# Vault2077 信息管道：开源组件调研与首发建议

> 状态：非规范性调研。调研日期：2026-07-21。只使用项目维护方的 GitHub 仓库、Release 和 GitHub 官方 API 文档作为来源。候选和建议不代表已确认的生产选型，也不替代许可证与安全审查。

## 结论

候选架构是一个**海外采集、境内处理**的窄管道，而不是部署一套通用资讯平台：海外节点只读取获批来源组合中的 RSS、播客 feed、GitHub Trending 和公开仓库 README；它以签名批次将公开文本和元数据送入境内。境内才做正文归一化、去重、事件候选聚合、中文摘要与发布。

推荐最小组合：

1. **GitHub 趋势：**自托管 [NiklasTiede/Github-Trending-API](https://github.com/NiklasTiede/Github-Trending-API)，由海外定时任务调用。
2. **RSS / Atom / JSON Feed：**境外 Python collector 可以使用 [lemon24/reader](https://github.com/lemon24/reader)；若只需轻量 Node 解析器，可以使用 [rbren/rss-parser](https://github.com/rbren/rss-parser)。只读取获批来源组合中明确标注的 feed。
3. **HTML 正文归一化：**境内用 [mozilla/readability](https://github.com/mozilla/readability) 提取正文为纯文本；不要把它当成 HTML 消毒器。
4. **README：**由海外节点调用 GitHub 官方 README endpoint，连同 `readme_sha`、仓库元数据和原文一次性传入境内；境内 LLM 不读取境外 GitHub。
5. **LLM：**首发保留项目既定的 Provider Adapter；若要统一不同境内模型服务，可增加 [LiteLLM](https://github.com/BerriAI/litellm)。只有确定自托管模型时才引入 [vLLM](https://github.com/vllm-project/vllm)。

## 候选与判断

| 能力 | 项目 | 许可证与活跃度（截至调研日） | 适配判断 |
| --- | --- | --- | --- |
| GitHub 趋势 | [Github-Trending-API](https://github.com/NiklasTiede/Github-Trending-API) | MIT；仓库声明 FastAPI API、Docker、非 root 运行与 healthcheck；[v2.0.0](https://github.com/NiklasTiede/Github-Trending-API/releases/tag/v2.0.0) 于 2026-04-29 发布。 | **首选。**提供日/周/月及语言维度的 JSON，适合独立海外容器。它抓取 GitHub Trending HTML，因此必须封装为适配器，并保留官方 API 的兜底快照；不能让前台或境内服务直接依赖它。 |
| 原生 feed 采集 | [reader](https://github.com/lemon24/reader) | BSD-3-Clause；项目 README 覆盖 Atom、RSS、JSON Feed、OPML 和 feed discovery；[仓库元数据](https://api.github.com/repos/lemon24/reader) 显示 2026-07-13 有推送。 | **首选（Python collector）。**白名单、持久化和调度都在 collector 自己控制，避免把读取器产品当作内容后台。 |
| 轻量 feed 解析 | [rss-parser](https://github.com/rbren/rss-parser) | MIT；仓库说明可将 URL 或 XML 解析为 JavaScript 对象；[仓库元数据](https://api.github.com/repos/rbren/rss-parser) 显示 2026-03-25 有推送。 | **Node 备选。**适合现有 TypeScript 队列的最小抓取器；不提供采集计划、白名单或持久化，必须由 Vault2077 实现。 |
| 网页正文提取 | [Readability](https://github.com/mozilla/readability) | Apache-2.0；Mozilla 的独立 Reader View 库；[仓库元数据](https://api.github.com/repos/mozilla/readability) 显示 2026-07-09 有推送。 | **首选（境内）。**仅把提取后的 `textContent` 送给 LLM。维护方明确说明它不负责消毒不可信 HTML，因此输入及输出均不得原样渲染。 |
| 复杂文档转 Markdown | [MarkItDown](https://github.com/microsoft/markitdown) | MIT；维护方声明支持把 PDF、Office、HTML 等转为 Markdown；[v0.1.6](https://github.com/microsoft/markitdown/releases/tag/v0.1.6) 于 2026-05-26 发布，且[仓库](https://api.github.com/repos/microsoft/markitdown) 2026-07-20 有推送。 | **可选，非首发必需。**只有白名单来源需要解析 PDF/Office 公告时启用；不要让它扩大抓取范围。 |
| LLM 统一网关 | [LiteLLM](https://github.com/BerriAI/litellm) | 核心目录为 MIT、`enterprise/` 另有许可证；GitHub API 的 SPDX 字段为 `NOASSERTION`，应以[仓库 LICENSE](https://github.com/BerriAI/litellm/blob/main/LICENSE)完成逐项审查；[仓库元数据](https://api.github.com/repos/BerriAI/litellm) 显示 2026-07-21 有推送。 | **可选。**能把 Provider Adapter 变成 OpenAI 兼容的统一入口。若采用，锁定镜像 digest 和依赖 hash，并在升级前检查其安全公告；不是 MVP 的先决条件。 |
| 自托管推理 | [vLLM](https://github.com/vllm-project/vllm) | Apache-2.0；OpenAI-compatible serving；[v0.23.0](https://github.com/vllm-project/vllm/releases/tag/v0.23.0) 于 2026-06-12 发布，且[仓库](https://api.github.com/repos/vllm-project/vllm) 2026-07-21 有推送。 | **后置。**仅当已有大陆 GPU、选定模型及模型许可审查时启用；首发可调用合规的境内模型 API。 |
| 无 feed 的站点补充 | [RSSHub](https://github.com/DIYgod/RSSHub) | AGPL-3.0；项目维护活跃，[仓库元数据](https://api.github.com/repos/DIYgod/RSSHub) 显示 2026-07-21 有推送。 | **隔离式备选，不进首发核心。**覆盖面大，但网络服务使用前必须完成 AGPL 合规评审；仅能对人工批准的站点开放路由。 |

不建议把老的 `huchenme/github-trending-api` 作为主依赖：即便能工作，也不如上表项目近期发布、含健康检查及 Docker 运行边界的版本适合作为首发基础。所有 Trending HTML 抓取都属于易变上游，必须以错误率监测和官方 API 兜底为前提。

## 首发管道与数据契约

```text
境外：RSS/播客来源组合 ─┐
境外：Trending API ───┼─> collector batch（签名、加密、幂等键）
境外：GitHub README ──┘                 │
                                         ▼
境内：Ingest API → 原始对象存储 → 队列 → 纯文本归一化/去重
                                                │
                                                ▼
                                  候选事件聚合 → LLM 翻译/摘要 → Schema 校验 → 发布
```

每条跨境记录最小字段如下；不得包含后台会话、运营信息、用户邮箱或 LLM 密钥：

```json
{
  "idempotency_key": "sha256(source_id + canonical_url + content_hash)",
  "source_id": "github-trending",
  "kind": "rss_item | podcast_episode | github_trend | github_readme",
  "canonical_url": "https://…",
  "published_at": "2026-07-21T00:00:00Z",
  "fetched_at": "2026-07-21T00:05:00Z",
  "content_hash": "sha256:…",
  "payload": { "title": "…", "text": "…", "metadata": {} }
}
```

GitHub 的 [Get a repository README](https://docs.github.com/en/rest/repos/contents#get-a-repository-readme) endpoint 对公开仓库可无认证使用，并支持返回原始内容；响应同时含 `sha`、默认分支所指版本及下载链接。海外 collector 应存储并传输 `readme_sha`：相同 SHA 不重复送入 LLM，改变时才建立新的 SiC 项目说明。GitHub 官方也说明未认证 REST API 只有每 IP 60 请求/小时，而常规认证额度为 5,000 请求/小时；因此生产 collector 使用只读、服务端保管的 token，并记录 `x-ratelimit-*` 响应头和退避状态。[官方限额说明](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)

## 实施顺序与上线门槛

1. 先实现 `github.snapshot`：在海外容器运行 Trending API，固定每日/每周快照，取项目元数据和 README 后投递境内 Ingest API。
2. 再实现 `source.fetch`：使用获批来源组合中明确标注的公开通道，不抓取任意 URL；保存原始 XML、ETag/Last-Modified、canonical URL 与内容指纹。具体来源规模另行决定。
3. 境内实现 `raw.normalize` 与 `raw.deduplicate`：只输出受长度限制的纯文本；LLM 只能在时间窗口与实体检索给出的少量候选中判定是否合并，不能扫描全库自由归并。
4. 最后接 `content.translate`、`content.summarize`、`event.publish`：所有模型输出以 JSON Schema 验证；失败自动重试一次，仍未通过、低置信度或没有来源链接的内容隔离且不发布。

上线前必须能证明：单来源可暂停；相同内容不会重复发布；每条公开内容都有原链接、抓取时间和“AI 摘要”标记；README 仅作内部分析材料而不整篇公开；所有失败任务都有可重试和死信记录。这些门槛与 [Vault2077 设计规格](Vault2077-Design-Spec.md) 的跨境、去重和可追溯要求一致。
