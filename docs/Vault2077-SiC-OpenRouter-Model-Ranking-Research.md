# Vault2077 SiC：OpenRouter 模型使用榜研究

> 研究日期：2026-07-23
> 状态：历史研究证据，不是当前运行规范。本文的授权日 Token 聚合是未实施候选；现行代码不读取 `OPENROUTER_API_KEY`，只保留公开 `sort=top-weekly` 官方顺序并以名次展示。以 SiC 专项规格和部署手册为准。

## 1. 结论

OpenRouter 模型榜适合成为 SiC 的第五个趋势榜，但它的准确名称不应是“模型调用量榜”。

建议名称：**OpenRouter 周模型使用榜**。
排名指标：**过去 7 日在 OpenRouter 处理的 Token 总量**。

它反映的是 OpenRouter 平台中的真实推理采用，而不是所有 AI 平台、更不是全行业总使用量。它与 Hugging Face 的“开源模型下载增长榜”形成互补：

| 榜单 | 观察对象 | 指标 |
|---|---|---|
| Hugging Face 近 7 日模型下载增长 | 开源模型资产采用 | Hub 文件下载增量 |
| OpenRouter 周模型使用 | 可经 OpenRouter 调用的模型 | 平台内过去一周处理 Token |

## 2. 官方榜单与公开接口

[OpenRouter Rankings](https://openrouter.ai/rankings) 明确写明：

- Top Models 是“Weekly usage of models across OpenRouter”；
- Top models by task 按 OpenRouter 内的 spend share 排名；
- Market Share 是 OpenRouter 内模型作者的 text request share；
- 该站点把排名描述为基于实时 benchmark 与 OpenRouter 数百万用户的真实使用数据。

官方模型列表接口支持无需登录的周榜排序：

```tex
GET https://openrouter.ai/api/v1/models?sort=top-weekly
```

官方 [Models API 文档](https://openrouter.ai/docs/guides/overview/models) 定义：

```tex
sort=top-weekly / most-popular
  = most tokens processed in the last week
```

2026-07-23 实测该接口返回 HTTP 200，不需要 API Key，且返回顺序即周度 Token 使用排名。但响应只含模型元数据，不含每个模型的周 Token 数。

## 3. 数值数据接口

官方提供：

```tex
GET https://openrouter.ai/api/v1/datasets/rankings-daily
Authorization: Bearer <OPENROUTER_API_KEY>
```

官方文档称其为 [Daily token totals for top 50 models](https://openrouter.ai/docs/api/api-reference/datasets/get-rankings-daily)。它返回：

- 每日 Top 50 模型；
- 稳定模型版本标识 `model_permaslug`；
- `total_tokens`；
- `as_of`、`start_date`、`end_date`；
- 每日一个 `other` 行，汇总 Top 50 之外的全部模型。

Token 总量是 `prompt_tokens + completion_tokens`，与官方 rankings 图表一致。接口要求有效 OpenRouter API Key，实测未携带凭证返回 HTTP 401。官方说明其限流为每个 Key 30 次/分钟、每个账户 500 次/日。

## 4. 推荐采集方案

### 排名来源

使用公开的 `GET /api/v1/models?sort=top-weekly` 获取当前周排名。

### 数值来源

使用已授权的 `GET /api/v1/datasets/rankings-daily` 获取每日 Top 50 的 `total_tokens`，按最近七个完整自然日累计为周 Token 总量。

```tex
weekly_tokens(model) = sum(daily_total_tokens, last 7 complete UTC days)
```

### 身份

使用 `model_permaslug` 作为历史身份；展示名称和当前模型路由可随版本更新。不要把 `:free` 变体、`latest` 别名或 OpenRouter 路由器和底层固定版本混为一个模型。

### 失败降级

如果数值接口授权失效或滞后：保留最近成功的数值快照，并显示最后成功更新时间；不要伪造零值。公开 `top-weekly` 排序只可作为顺序校验，不能填补缺失 Token 数。

## 5. 重要边界

1. 指标是 OpenRouter 内 Token 使用量，不是请求次数。不同供应商的 tokenizer 不同，单个 Token 不能被理解为跨模型完全同质量的计算量；它仍可表达该平台内的使用热度。
2. 只覆盖 OpenRouter 已列出的模型及经由该平台的流量，不代表 OpenAI、Anthropic、Google 等厂商的全部直连使用。
3. Top 50 日数据足以支持 SiC 的 Top 10/Top 20 周榜；它不能支持“全模型精确周榜”的长尾分析。
4. 用户不应看到“行业市占率”“最强模型”这类误导性措辞。页面只表达“OpenRouter 周使用”。

## 6. 页面建议

- 榜单名：**OpenRouter 周模型使用**
- 折叠：Top 10；展开：Top 20
- 榜单行：模型名、周处理 Token 总量
- 详情页：OpenRouter 模型地址、少于 200 字的中文介绍、模型提供商/发布方、可用上下文长度
- 不显示成本、基准分、请求数或“市场份额”，这些指标的口径与主榜不同

## 7. SiC 五榜结构

1. GitHub 官方 Trending
2. GitHub 全站 24H Star 增长
3. GitHub 全站 7D Star 增长
4. Hugging Face 近 7 日模型下载增长
5. OpenRouter 周模型使用

前三项观察开源代码仓库趋势；第四项观察开源模型资产的下载采用；第五项观察跨闭源与开源模型在一个统一推理入口中的真实使用热度。
