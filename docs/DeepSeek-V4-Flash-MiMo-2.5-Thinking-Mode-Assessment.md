---
type: research
status: reference
updated: 2026-08-02
---

# DeepSeek-V4-Flash 与 MiMo-V2.5 思考模式评估

> 资料截止：2026-08-02。本文只使用 DeepSeek 与 Xiaomi MiMo 的官方文档、官方模型页面和官方发布说明；没有用聚合平台、媒体评测或社区推测补齐空白。

## 结论

Vault2077 当前的大多数信息处理任务**没有必要开启思考模式**。建议采用“默认关闭、按任务升级”的策略：

- `information` / `roadside` 的翻译、标题改写、单条摘要、结构化字段提取：关闭。
- SiC 的单篇标题翻译、简介和两三句话摘要：关闭。
- 普通事件匹配与标签分类：第一遍关闭；只有语义边界模糊、来源互相冲突或需要跨多条材料消歧时才开启第二遍思考。
- 事件合成、影响判断、多来源矛盾处理，以及真正需要跨段推导的技术研究材料：开启。
- `rankings` 与 Frontier 的确定性处理：继续不用 LLM，更不存在开启思考的问题。

原因不是这两个模型“不能推理”，而是它们都是**可切换的双模式模型**。思考模式主要提高复杂、多步任务的准确率，同时会产生额外推理 token、挤占输出额度并增加延迟。翻译、压缩摘要和固定 Schema 抽取通常是受约束的转换任务，思考收益有限；非思考模式还能让低温度参数真正生效，更适合稳定的批量 JSON 生产。

## 1. 型号名称核验

### DeepSeek

`deepseek-v4-flash` 是 DeepSeek 官方 API 的有效模型 ID。官方当前列出的模型版本为 `DeepSeek-V4-Flash-0731`；上下文 1M，最大输出 384K，同时支持非思考和思考模式，默认开启思考。[DeepSeek 模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing) [DeepSeek V4 官方发布说明](https://api-docs.deepseek.com/news/news260424/)

旧 ID `deepseek-chat` 与 `deepseek-reasoner` 已在北京时间 2026-07-24 23:59 弃用；不能再把它们当作 V4 Flash 的长期接入名。[DeepSeek 模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)

### Xiaomi MiMo

官方有效模型 ID 是 `mimo-v2.5`，不是 `mimo-2.5`。官方模型列表同时列有 `mimo-v2.5-pro`，但本文所称“MiMo 2.5”按通用版本理解为 `mimo-v2.5`。[MiMo 模型列表 API](https://mimo.mi.com/docs/en-US/api/model/list-models) [MiMo-V2.5 官方模型页](https://mimo.mi.com/models/mimo-v2.5)

旧的 `mimo-v2-flash` 已于 2026-06-30 下线；此前曾自动路由到 `mimo-v2.5`，现在不应再用旧 ID 配置生产环境。[MiMo 模型弃用公告](https://mimo.mi.com/docs/en-US/updates/deprecate)

## 2. 官方能力、控制方式与运行代价

| 项目 | `deepseek-v4-flash` | `mimo-v2.5` |
|---|---|---|
| 模式 | 思考 / 非思考；默认思考 | 思考 / 非思考；默认思考 |
| Chat Completions 开关 | `thinking: {"type":"enabled"}` 或 `disabled` | `thinking: {"type":"enabled"}` 或 `disabled` |
| 思考强度 | OpenAI Chat Completions 用顶层 `reasoning_effort`；V4 Flash 官方映射支持 `low`、`high`、`max` | Chat Completions 只有开关；Responses API 的 `none` 关闭，`low` / `medium` / `high` 均开启，但官方明确称三档当前效果相同 |
| 思考输出 | `reasoning_content` 与最终 `content` 分离返回 | Chat Completions 返回 `reasoning_content`；Responses API 以 reasoning 输出事件/usage 字段体现 |
| 采样参数 | 思考模式下 `temperature`、`top_p`、`presence_penalty`、`frequency_penalty` 均不生效 | 思考模式下 `temperature` 与 `top_p` 被强制为 1.0 / 0.95 |
| 上下文 / 最大输出 | 1M / 384K | 1M / 128K（官方 Chat 文档中 `mimo-v2.5` 的默认 `max_completion_tokens` 为 32K） |
| 结构化输出 | JSON Output | Structured Output / JSON mode |
| 工具调用 | 支持；思考工具链必须回传完整 `reasoning_content` | 支持；多轮工具链必须回传完整 `reasoning_content`，否则可能 400 |
| 官方限额 | 账户并发 2,500 | 100 RPM、10M TPM |

DeepSeek 参数与映射见[思考模式](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode)和[Chat Completion API](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/)；限额见[Rate Limit & Isolation](https://api-docs.deepseek.com/quick_start/rate_limit)。MiMo 开关和输出上限见[OpenAI Chat Completions API](https://mimo.mi.com/docs/en-US/api/chat/openai-api)，Responses 档位语义见[Responses API](https://mimo.mi.com/docs/zh-CN/api/chat/responses)，模型限额见[模型总览](https://mimo.mi.com/docs/quick-start/summary/model)。

### 延迟

- DeepSeek 官方只定性说明 V4 Flash 相比 V4 Pro 参数更小、响应更快，没有公布可用于容量设计的固定首 token 延迟或 tokens/s；因此不能从官方资料给出“开启思考增加多少秒”的数字。[DeepSeek V4 官方发布说明](https://api-docs.deepseek.com/news/news260424/)
- MiMo 官方明确说明开启深度思考会增加响应延迟，复杂任务尤其明显，并建议流式返回；同样没有给出固定增幅。[MiMo 深度思考指南](https://mimo.mi.com/docs/usage-guide/passing-back-reasoning_content)

对当前非流式批处理而言，思考内容在最终 JSON 之前生成，即使不展示给用户，也会增加单请求占用时间。具体增幅必须用生产提示词、相同输入和相同时间窗压测，不能套用官方之外的测评数字。

### 计费与输出额度

两家的 `mimo-v2.5` / `deepseek-v4-flash` 当前按量价格恰好相同，但这只是官方价目表中的事实，不应据此推断模型同源：

| 每百万 token | 国内输入缓存命中 | 国内输入缓存未命中 | 国内输出 | 海外输入缓存命中 | 海外输入缓存未命中 | 海外输出 |
|---|---:|---:|---:|---:|---:|---:|
| 两个模型当前官方价格 | ¥0.02 | ¥1.00 | ¥2.00 | $0.0028 | $0.14 | $0.28 |

来源：[DeepSeek 模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)；[MiMo 按量计费](https://mimo.mi.com/docs/en-US/price/pay-as-you-go)。

思考模式的成本影响来自额外的推理输出：

- DeepSeek 的 usage 把 `reasoning_tokens` 列为 `completion_tokens` 的明细，价目表按输入和输出 token 计费；因此可以确定，思考越长，计费输出量通常越高。[DeepSeek Chat Completion API](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/) [DeepSeek 模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)
- MiMo 的 `max_completion_tokens` 同时限制思考内容与最终回答；思考过长会压缩最终答案空间。官方也明确称关闭/降低推理可减少推理 token 消耗。[MiMo 深度思考指南](https://mimo.mi.com/docs/usage-guide/passing-back-reasoning_content) [MiMo Responses API](https://mimo.mi.com/docs/zh-CN/api/chat/responses)

所以，即使输出单价很低，批量资讯处理也不应把默认思考当成“免费质量增益”：它同时消耗钱、延迟和最终 JSON 的 token 空间。

## 3. Vault2077 任务级建议

| 当前任务 | 建议 | 理由 |
|---|---|---|
| `information_batch_editorial`：翻译、标题、摘要、固定 JSON | 默认关闭 | 主要是忠实转换和压缩；需要低随机性、低延迟和完整 JSON |
| `roadside` 人物动态处理 | 默认关闭 | 文本通常短，重点是忠实翻译和来源边界，不需要长链推导 |
| `sic-latest-source-editorial`：单篇标题、简介、2–3 句摘要 | 默认关闭 | 固定 Schema 的单文档总结；思考易增加成本但不自然增加事实来源 |
| `event_classification`：已有事件 / 候选 / 独立 | 首轮关闭，疑难项开启 | 大多数是语义匹配；跨来源别名、时间关系、观点冲突时才值得二次推理 |
| `event_editorial`：事件标题、判断、摘要、意义、实体、引用 | 开启 | 需要综合多来源、保留分歧、建立引用与结论关系，是明确的多步分析任务 |
| 深度 SiC 研究综合、论文方法比较 | 开启 | 需要跨段逻辑、术语约束、方法与结论区分 |
| 榜单、票数、Frontier 仓库观察 | 不调用 LLM | 属于确定性数据处理，现有设计正确 |

如果暂时不做“疑难项第二遍”，最务实的第一阶段是：`vault_editorial` 和普通 `sic_editorial` 全部关闭思考，只把独立的事件合成调用设为开启。上线后用抽样标注比较非思考与思考的事实错误率、事件误并率、JSON 失败率、P95 延迟和每条成本，再决定是否扩大开启范围。

## 4. 两个模型之间如何分工

官方资料不足以证明其中一个在 Vault2077 的中文资讯翻译、事件误并或 SiC 摘要上必然更好；官方基准也不是本项目的生产提示词。因此不建议只凭“推理模型”标签决定主备。

可采用以下保守分工假设，并通过同一金标集验证：

- `deepseek-v4-flash`：文本批处理主候选。官方定位是快速、经济的文本推理与 Agent 模型，提供真实的 `low/high/max` 思考级别，且最大输出更长。[DeepSeek V4 官方发布说明](https://api-docs.deepseek.com/news/news260424/) [DeepSeek 思考模式](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode)
- `mimo-v2.5`：需要图片、视频或音频原生理解时有明确优势；纯文本思考只有开/关的实际差异，不能期待 `low` 与 `high` 带来不同质量/成本档位。[MiMo-V2.5 官方模型页](https://mimo.mi.com/models/mimo-v2.5) [MiMo Responses API](https://mimo.mi.com/docs/zh-CN/api/chat/responses)

这只是基于官方产品能力的路由建议，不是质量排名。正式主备选择仍应以 Vault2077 自己的盲测为准。

## 5. 当前接入的关键兼容性风险

仓库当前的 OpenAI-compatible 客户端向 `/chat/completions` 固定发送：

```json
{
  "temperature": 0.1,
  "response_format": { "type": "json_object" },
  "reasoning": { "effort": "...", "exclude": true }
}
```

这里存在两个直接问题：

1. 如果不传仓库的 `*_REASONING_EFFORT`，请求里不会出现任何思考开关；而两个官方模型都默认开启思考，所以“环境变量留空”并不等于关闭思考。
2. 仓库的 `reasoning: {effort, exclude}` 不是两个模型官方 Chat Completions 的开关格式。DeepSeek Chat Completions 要求 `thinking.type`，强度使用顶层 `reasoning_effort`；MiMo Chat Completions 同样要求 `thinking.type`。MiMo 只有在 `/v1/responses` 协议中才使用 `reasoning.effort`，而该协议的请求与响应结构又不同于当前 `/chat/completions` 客户端。[DeepSeek 思考模式](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode) [MiMo Chat Completions API](https://mimo.mi.com/docs/en-US/api/chat/openai-api) [MiMo Responses API](https://mimo.mi.com/docs/zh-CN/api/chat/responses)

此外，当前固定的 `temperature: 0.1` 在 DeepSeek 思考模式下无效，在 MiMo 思考模式下会被强制改为 1.0；这与结构化编辑任务想要的低随机性相反。[DeepSeek 思考模式](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode) [MiMo 模型超参数](https://mimo.mi.com/docs/en-US/api/guidance/model-hyperparameters)

因此，实施本建议前需要把“是否思考”做成明确的**任务级布尔参数**，再由 provider adapter 转为各家协议，而不是只依赖通用 `reasoning_effort`：

```text
任务策略 thinking=off/on
  ├─ DeepSeek Chat Completions → thinking.type=disabled/enabled
  │                             + reasoning_effort=low/high/max（仅开启时）
  └─ MiMo Chat Completions     → thinking.type=disabled/enabled
```

若主备分别使用两家模型，业务层应只依赖共同语义 `off/on`；DeepSeek 的细粒度 effort 可作为适配器优化，不能成为业务正确性的前提。

## 6. 建议的首版策略

```yaml
thinking_policy:
  default: disabled
  tasks:
    information_batch_editorial: disabled
    information_editorial: disabled
    sic-latest-source-editorial: disabled
    event_classification: disabled
    event_editorial: enabled
    sic_research_synthesis: enabled
```

建议同时记录每次请求的 `provider`、`model`、`thinking_enabled`、实际 `reasoning_tokens`、总输出 token、耗时、JSON 校验结果与任务类型。没有这些审计字段，就无法判断开启思考究竟改善了质量，还是只增加了延迟和成本。

## 最终判断

两个模型虽然都具备推理能力且默认进入思考模式，但 Vault2077 不是通用聊天或代码 Agent：绝大多数调用是有来源边界、短输出、固定 Schema 的信息加工。**生产默认应明确关闭思考，仅在事件合成、冲突消歧和深度研究综合中开启。** 当前客户端不能用现有通用 `reasoning` 字段可靠实现这一策略，接入前必须按官方协议显式发送 `thinking.type`。
