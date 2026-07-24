# Vault2077 SiC：Hugging Face 模型周榜与数据接口研究

> 研究日期：2026-07-23
> 状态：历史研究证据，不是当前运行规范。现行实现只对官方累计下载 Top 1000 候选做每日快照并计算约 7 日增量；平台榜展示为 Top 5/10。以 SiC 专项规格和部署手册为准。

## 1. 结论

建议为 SiC 增加一个独立榜单：

**Hugging Face 近 7 日模型下载增长榜**

这项数据能够反映开源模型在 Hugging Face Hub 生态中的近期采用热度，但不能称为“模型调用量”或“全行业模型使用量”。

Hugging Face 提供官方公开 Hub API，可以取得全站公开模型及其当前下载指标；但官方没有直接提供“过去 7 日下载量”字段。SiC 需要保存每日累计下载快照，以两个时间点的差值计算 7 日下载增量。

## 2. 已确认的官方接口

官方入口：

- [Hub API Endpoints](https://huggingface.co/docs/hub/api)
- [`huggingface_hub` 搜索与列表指南](https://huggingface.co/docs/huggingface_hub/en/guides/search)
- [`HfApi.list_models`](https://huggingface.co/docs/huggingface_hub/main/en/package_reference/hf_api)

官方 Python SDK 支持：

```python
from huggingface_hub import HfApi

api = HfApi(token=HF_TOKEN)
models = api.list_models(
    sort="downloads",
    direction=-1,
    expand=[
        "downloads",
        "downloadsAllTime",
        "trendingScore",
        "pipeline_tag",
    ],
)
```

底层公开接口可以使用：

```tex
GET https://huggingface.co/api/models
    ?sort=downloads
    &direction=-1
    &limit=20
    &expand[]=downloads
    &expand[]=downloadsAllTime
    &expand[]=trendingScore
    &expand[]=pipeline_tag
```

2026-07-23 实际请求返回 HTTP 200，无需登录即可读取公开模型。返回字段包括：

- `_id`：Hub 内部稳定标识；
- `id`：`organization/model-name`；
- `downloads`；
- `downloadsAllTime`；
- `trendingScore`；
- `pipeline_tag`。

## 3. 指标的准确含义

根据官方 [`ModelInfo`](https://huggingface.co/docs/huggingface_hub/v1.3.0/en/package_reference/hf_api)：

- `downloads`：模型过去 30 日的下载次数；
- `downloads_all_time` / `downloadsAllTime`：模型创建以来的累计下载次数；
- `trending_score` / `trendingScore`：Hugging Face 当前 Trending Score。

没有发现以下官方字段：

- `downloads_7d`；
- `weekly_downloads`；
- `weekly_inference_calls`；
- 可供外部使用的单模型调用次数。

因此：

```tex
delta_7d =
  downloadsAllTime(当前快照)
  - downloadsAllTime(最接近 7 天前的有效快照)
```

参考快照窗口可沿用 GitHub 7D 榜的规则：允许距离当前时间 6–8 天；没有合格参考快照时显示“数据不足”，不得显示零。

## 4. 为什么不能叫“模型调用量”

Hugging Face 官方的 [Models Download Stats](https://huggingface.co/docs/hub/models-download-stats) 说明：

- 下载计数由 Hub 服务文件时在服务端统计；
- 每个模型或集成库使用特定 query file，避免把一个分片模型的多个文件简单重复计算；
- 对 query file 的 `GET` 和 `HEAD` 请求都会计数；
- 它不是独立用户数，也不是模型推理请求数。

下载量还会受到自动化构建、依赖安装、缓存与模型仓库组织方式影响。它适合表示“Hub 模型资产采用热度”，不能表示：

- 模型实际生成了多少 Token；
- API 被调用多少次；
- 独立用户数量；
- 闭源模型的行业份额；
- 模型能力或质量。

## 5. “周榜”的来源辨析

Hugging Face 官方模型页提供：

- Most Downloads：按过去 30 日下载量排序；
- Trending：按 `trendingScore` 排序。

官方 SDK也支持 `downloads` 和 `trending_score` 排序，但官方没有公开说明 `trendingScore` 的完整算法与固定 7 日窗口。因此不能把 Trending Score 直接翻译成“周下载量”。

社区项目 [`cfahlgren1/hub-stats`](https://huggingface.co/datasets/cfahlgren1/hub-stats) 每日保存全 Hub 当前统计，包含 `downloads`、`downloadsAllTime` 和 `trendingScore`。它在 Hugging Face 官方 CLI 文档示例中被用于数据查询，但仓库位于个人命名空间，不是 Hugging Face 官方承诺的数据 API。

社区数据集 [`DS2UVA/hf-hub-daily-downloads-full`](https://huggingface.co/datasets/DS2UVA/hf-hub-daily-downloads-full) 使用上述每日快照的 Git 历史，按累计下载量差值重建全站每日下载序列。它证明 7 日榜可以实现，也适合作为校验和故障回填候选，但不应成为首选权威源。

## 6. 推荐的数据方案

### 权威源

使用 Hugging Face 官方 Hub API 和官方 `huggingface_hub` SDK。

### 身份

使用 Hub `_id` 作为模型稳定身份，`id` 作为可变展示路径。模型改名后，历史数据继续归属同一个 `_id`。

### 快照

每天至少保存一次：

```tex
HuggingFaceModelSnapsho
  hub_id
  model_id
  captured_a
  downloads_30d
  downloads_all_time
  trending_score
  pipeline_tag
  private
  disabled
```

### 计算

```tex
delta_7d = current.downloads_all_time - reference.downloads_all_time
```

- 原始负数保留，以反映上游计数修正；
- 排名时使用 `max(0, delta_7d)`；
- 同分依次使用 30 日下载量、Trending Score、规范化模型名；
- 排名数据不允许由 LLM 生成或修改。

### 发现范围

如果产品声称“全站周榜”，采集任务必须遍历全部公开模型，而不能只读取当前 30 日 Top N。只采集候选集合时，页面必须明确叫“热门模型周榜”，不能宣称全站。

Hugging Face 当前模型规模已达到数百万。官方接口支持分页和 `expand` 精简字段，但完整遍历仍是较重的日常任务。可以：

1. 使用账号 Token 提高稳定性；
2. 只请求计算所需字段；
3. 使用 SDK 的分页与 429 自动等待；
4. 每日一次全量身份/累计值快照，日内只刷新热门候选；
5. 以社区每日快照作交叉校验，不把它当权威真值。

## 7. 接口限流

官方 [Hub Rate Limits](https://huggingface.co/docs/hub/main/rate-limits) 将模型搜索归入 Hub API 桶，并采用 5 分钟固定窗口。

2026-07-23 的匿名实测响应头为：

```tex
RateLimit-Policy: "fixed window";"api";q=500;w=300
```

额度会随账号等级和平台策略变化，生产实现应读取响应头并使用官方 SDK 的重试能力，不能把当前数值写死。

## 8. 页面建议

- 榜单名：**Hugging Face 近 7 日模型下载增长**
- 折叠：Top 10
- 展开：Top 20
- 榜单行只显示：模型名、近 7 日下载增量
- 点击详情显示：
  - Hugging Face 模型地址；
  - 少于 200 字的中文介绍；
  - 许可证；
  - 数据不足或模型不可用状态

不在榜单行展示 Trending Score、任务类型、累计下载量或方法说明，避免增加视觉负担。

## 9. 布局建议

它不应成为 GitHub 三榜旁边的第四个窄列：

- GitHub 三榜观察代码仓库趋势；
- Hugging Face 榜观察模型资产采用趋势；
- 两者指标语义、对象和详情字段不同。

建议保持 GitHub 三榜上沿一致、同一行不变；Hugging Face 模型榜作为下方“AI 模型生态”中的一张横向或较宽榜单，与模型评测、Epoch AI 等数据卡形成新的数据层级。
