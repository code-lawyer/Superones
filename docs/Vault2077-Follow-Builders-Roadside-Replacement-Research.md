---
type: research
status: reference
updated: 2026-08-01
---

# `follow-builders` 替代 Roadside 社区源可行性研究

> 调研快照：2026-08-01
> 上游版本：[`b98abfc`](https://github.com/zarazhangrui/follow-builders/tree/b98abfc829f3379a92b47de3733523c5935c9604)
> 证据范围：上游 README、固定来源配置、生成脚本、GitHub Actions、公开 feed、提交与运行记录、X 官方政策，以及本仓库现行规格和采集合同。
> 文档性质：非规范性研究；除非结论被 ADR、产品规格和来源 bundle 吸收，否则不改变生产行为。

## 1. 结论

**技术上可以接入，但不适合作为 Hacker News 与 Lobsters 的等价替代。**

`follow-builders` 不是社区平台或社区热榜，而是维护者集中挑选的固定 AI 人物、播客和官方博客目录。用它替换两个社区源，会把 Roadside 从“固定个人源 + 社区发现”改成“更多固定个人源”，能明显降量和提高主题聚焦度，但会失去陌生项目、陌生作者和突发社区讨论的发现能力。

推荐顺序如下：

1. 把其 **26 个 X 账号目录作为候选来源清单**，逐账号审查、去重并纳入 Vault2077 自有注册表；
2. 若目标是立刻降低 Roadside 数量，可只对 X 数据做 **7 天影子运行**，暂不删除 Hacker News/Lobsters；
3. 正式生产应由 Vault2077 自有、合规的 X 连接器采集原始帖子；
4. **不建议长期直接依赖其 `main` 分支公开 JSON**，也不建议安装或运行其 skill、远程 prompts、播客全文或博客全文链路；
5. 如果产品决定彻底取消社区发现，应先修改 ADR、Feed 规格、系统交付规格、运行手册和来源 bundle，再实施替换。

| 接入形态 | 判断 | 原因 |
| --- | --- | --- |
| 完全等价替换 Hacker News/Lobsters | 不推荐 | 来源性质不同，会取消社区发现能力 |
| 固定个人源候选目录 | 推荐 | 清单明确、数量有界、与 Roadside 个人表达定位一致 |
| 只读 `feed-x.json` 影子运行 | 有条件可行 | 低成本验证数量和质量，但有许可、时效和供应链风险 |
| 长期直接消费公开中央 feed | 暂不推荐 | 可变 `main`、无 schema/SLA/签名，且完整 X 内容再分发边界不清 |
| 接入 podcasts/blogs 到 Roadside | 不推荐 | 播客和机构博客不属于个人 Roadside 语义，且全文/转录负载与版权风险更高 |

## 2. 两类来源并不等价

Vault2077 现行规格把 Hacker News 与 Lobsters 定义为“社区原生来源”：社区讨论页是 canonical URL，外链只作为 `externalUrl`，不得递归抓取、不得晋升成原站正文。见[信息流设计规格](Vault2077-Feed-Design-Spec.md)、[系统交付规格](Vault2077-System-Delivery-Spec.md)和[统一采集运行手册](Vault2077-Unified-Acquisition-Runbook.md)。当前 bundle 中两者分别使用 Hacker News 官方 Firebase JSON 与 Lobsters JSON，均为独立的 `community_topic` 来源，见[`source-bundle.json`](../config/source-bundle.json)。

`follow-builders` 当前固定配置则包含：

- 26 个具名 X 账号；
- 6 个播客；
- 2 个 Anthropic/Claude 官方博客。

上游明确把产品描述为面向 AI builders 的每日或每周摘要，而不是开放社区热榜。证据见[固定来源配置](https://github.com/zarazhangrui/follow-builders/blob/b98abfc829f3379a92b47de3733523c5935c9604/config/default-sources.json)与[README](https://github.com/zarazhangrui/follow-builders/blob/b98abfc829f3379a92b47de3733523c5935c9604/README.md)。

因此，替换后的真实变化是：

```text
现行 Roadside
├── 34 个固定 X 账号
├── 1 个个人博客
└── 2 个社区原生平台（Hacker News、Lobsters）

候选方向
├── 现有固定个人源
└── follow-builders 中审查通过且未重复的固定 X 账号
```

按 2026-08-01 两份配置计算，`follow-builders` 的 26 个 X 账号中，只有 `karpathy`、`rauchg`、`sama` 3 个已在当前生产 Roadside bundle；其余 23 个是新增候选。这个数字只描述配置交集，不等于 23 个账号已获得生产准入。

## 3. 上游如何生成数据

上游的 [GitHub Actions](https://github.com/zarazhangrui/follow-builders/blob/b98abfc829f3379a92b47de3733523c5935c9604/.github/workflows/generate-feed.yml) 每天 UTC `06:17`（北京时间 `14:17`）运行一次，把三份 feed 和去重状态直接提交回 `main`：

- `feed-x.json`；
- `feed-podcasts.json`；
- `feed-blogs.json`；
- `state-feed.json`。

X 采集器使用 X API v2，按账号读取最近 24 小时，排除回复与转发，每个账号最多取 5 条后保留最多 3 条新帖；26 个账号的理论上限为 78 条/日。X 官方文档确认用户 Posts timeline 支持 `start_time`、排除 replies/retweets 和分页，见[X Timelines Integration Guide](https://docs.x.com/x-api/posts/timelines/integrate)。具体上游实现见[`generate-feed.js`](https://github.com/zarazhangrui/follow-builders/blob/b98abfc829f3379a92b47de3733523c5935c9604/scripts/generate-feed.js)。

最近 10 次公开 feed 提交中，X 日量为 21–48 条，平均 31.2 条；最新样本是 13 个活跃账号、31 条帖子。相比测试中 Hacker News 单源 189 条，数量会显著下降。

播客采用 14 天窗口，但每轮最终只返回一条成功取得转录的节目；博客采用 72 小时窗口，每个博客最多 3 篇全文。它们不适合一并塞入 Roadside：完整转录和博客全文会重新放大模型负载，而且应按播客、机构新闻或 SiC 的既有分类另行审查。

## 4. 稳定性与数据质量

积极证据：截至调研日，最近 15 次定时 Actions 均为成功，仓库也连续产生每日 feed 提交，说明当前服务正在运行。运行记录见[官方 Actions 页面](https://github.com/zarazhangrui/follow-builders/actions/workflows/generate-feed.yml)，提交见[官方 commits 页面](https://github.com/zarazhangrui/follow-builders/commits/main/)。

但它仍不是有稳定合同的数据服务：

- 没有正式 Release 或 tag；
- feed 没有 `schemaVersion`、签名、校验和或兼容性承诺；
- 客户端直接读取可变的 `main`；
- 没有 SLA，GitHub cron 可能延迟；
- 当前 JSON 是“当天增量快照”，下一次运行会覆盖，错过快照可能永久漏数；
- 去重状态约 7 天后剪除，状态损坏则从空状态继续，可能产生重复；
- X 部分账号失败时仍可能发布不完整 feed，遇到 `429` 会停止处理后续账号；
- 消费脚本没有强制检查 feed 是否过期；
- 最新博客 feed 声明 72 小时窗口，却包含 2026-06-18 的文章，说明无日期索引项可先绕过窗口、再从正文得到旧日期。

所以，连续成功只能证明“近期可用”，不能替代 schema、SLA、幂等和来源治理合同。

## 5. 许可证与再发布边界

上游 README 写有“MIT”，但调研快照根目录没有标准 `LICENSE` 文件，GitHub 仓库元数据也未识别许可证。即使代码最终确认采用 MIT，它也只能许可仓库作者有权许可的代码，不能自动授权：

- X 用户的完整帖子、bio 和互动指标；
- 播客完整转录；
- 官方博客全文；
- 下游商业产品的自动再发布。

更关键的是，[X Developer Policy](https://docs.x.com/developer-terms/policy) 对向第三方自动再分发完整 X Content 有明确限制，通常优先允许分发 Post ID/User ID，并要求公开展示保持最新、删除或不可用内容及时移除。其[展示要求](https://docs.x.com/developer-terms/display-requirements)还规定作者、账号、时间、原始链接和品牌归属等展示条件，并明确 X 本身不授予第三方用户内容版权。

公开 `feed-x.json` 包含完整帖子正文并供自动下载；仓库中没有看到 X 书面许可、删除合规流或定期 rehydration 说明。不能据此断言上游违规，因为维护者可能另有许可，但 Vault2077 上线前不能假定该公开 feed 已为下游再发布完成授权。

正式接入前应向维护者确认：

1. 是否允许商业/公开产品自动消费并再发布该 feed；
2. 是否取得 X 对完整对象自动再分发的许可；
3. 如何处理帖子编辑、删除、封禁和转私密；
4. 是否承诺 schema、更新频率和破坏性变更通知。

未确认前，最稳妥的做法是只使用固定账号目录作候选证据，由 Vault2077 自行合规采集。

## 6. 与 AcquisitionRecord 的兼容性

只看 X feed，其字段足以转换为 Roadside 的 `information` 记录。建议映射如下：

| 上游字段 | Vault2077 字段/规则 |
| --- | --- |
| `handle` | 只用于匹配已批准的本地 `sourceId`，不得动态创建来源 |
| `tweets[].id` | `externalId`，并形成稳定 `originContentId=x:status:<id>` |
| `tweets[].url` | `canonicalUrl`、`originUrl`，必须是对应 handle 的 HTTPS X status URL |
| `tweets[].createdAt` | `payload.originalPublishedAt` |
| `generatedAt` | 采集观察时间候选；必须通过新鲜度检查 |
| `tweets[].text` | 不可信原始文本，经长度限制后进入 `originalTitle/originalContent` |
| `name`、`bio` | 只能作观察数据；发布者名称和身份以本地注册表为准 |

现有合同要求 `sourceId` 稳定、`canonicalUrl` 为 HTTPS、`contentHash` 为 SHA-256，Roadside 只能携带 `information` kind，见[`acquisition-contract.ts`](../lib/acquisition-contract.ts)。现有内容合同还要求 X Roadside 记录具有真人身份、`originAccount`、`originContentId` 和原始状态地址，见[`content-contract.ts`](../lib/content-contract.ts)。当前采集器会校验 URL 的 handle 与注册账号一致，并限制响应大小、重定向来源和正文长度，见[`feed_collector.py`](../collector/feed_collector.py)。

需要特别处理的兼容性问题：

- `feed-x.json` 自身 URL 只是运输路径，绝不能成为 canonical URL 或发布者；
- 每个人必须保持独立 `sourceId` 和独立 source report，不能把 `follow-builders` 当成一个来源；
- 引用帖只有 `quotedTweetId`，没有被引用正文和完整 URL expansion，不能凭空补全；
- 上游 X 名单含 `GoogleLabs`、`claudeai` 等机构账号，不满足现有“X Roadside 必须是 person”的合同，必须另行分类，不能伪装成自然人；
- podcasts 有时回退为频道 URL而非单期 URL，不适合作为单期 canonical URL；
- 当前快照式内容存储要求来源缺失、空结果和失败有明确 source report，不能把上游“当天无新帖”误判为来源退出。

## 7. 安全风险与最低防护

直接运行上游 skill 会扩大供应链面：其 `prepare-digest.js` 从可变 `main` 动态读取 feed 和远程 prompts，内容与 prompt 都没有签名；上游 workflow 使用可变 Action 标签和 `npm install`，并持有 `contents: write` 后直接推送主分支。原始帖子、博客与转录也都可能含 prompt injection 文本。

如果进行影子运行，最低要求是：

- 只读取 `feed-x.json` 数据，不安装 skill、不运行 `prepare-digest.js`、不加载远程 prompts；
- 对 `generatedAt` 设置 36 小时 stale 门禁；
- 固定允许的 JSON schema、最大响应字节、最大 26 个账号和最大 78 条/日；
- 账号必须存在于本地 approved 注册表，handle 与 status URL 必须一致；
- 按 Post ID 永久去重，并保留原始 URL；
- 把所有文本当作不可信证据，禁止覆盖系统/编辑指令；
- 失败或部分失败必须进入 source report，不以成功账号掩盖失败账号；
- 不长期镜像完整帖子正文，优先保留 ID、链接和经审核的自有摘要；
- 对帖子删除/编辑建立重新核验和撤稿机制。

## 8. 推荐验证方案

在不修改生产行为的前提下，先做 7 天影子验证：

1. 每天北京时间 15:30–16:30 拉取一次 X feed；不需要沿用 Roadside 每两小时调度；
2. 展平为逐帖候选，但不投递生产 inbox、不公开发布；
3. 与当前 Roadside 账号、Post ID 和 canonical URL 去重；
4. 记录每日总量、活跃账号数、重复率、过期率、缺失/错误账号、人工保留率；
5. 人工评估新增 23 个候选账号的质量和身份分类；
6. 单独验证许可、删除同步和 X 展示义务；
7. 七天后再决定是新增部分固定个人源、彻底移除社区源，还是保留一个有严格上限的社区发现通道。

如果最后决定“只要固定 builders，不再要社区发现”，工程上应直接移除 Hacker News/Lobsters，并把审查通过的账号加入 Vault2077 自有来源目录；**不需要把 `follow-builders` 中央 feed 变成新的永久单点依赖。**

## 9. 最终判断

`follow-builders` 很适合回答“还应该关注哪些 AI 建设者”，也适合验证低量、高聚焦的 Roadside 编辑方向；它不适合回答“Hacker News/Lobsters 社区今天在讨论什么”。

因此最终建议是：

```text
不做等价替换；
把固定 X 名单作为候选目录；
若要降量，只影子接入 X 7 天；
正式采集回归 Vault2077 自有、合规、逐来源的连接器；
许可和删除同步未确认前，不直接长期消费公开完整 feed。
```
