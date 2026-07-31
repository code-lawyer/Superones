---
type: source-audit
status: reference
updated: 2026-07-30
---

# Vault2077：Akta News Signals 信源审计

> 审计对象：[akta.pro](https://akta.pro/) 的 News Signals API
> 审计时间：2026-07-30
> 证据范围：仅使用 Akta/Wokelo 的[产品页](https://akta.pro/news-signals)、[API 文档](https://docs.akta.pro/)、[公开 OpenAPI](https://docs.akta.pro/openapi.json)、[定价页](https://akta.pro/pricing)、[服务条款](https://akta.pro/legal?tab=terms)、[隐私政策](https://akta.pro/legal?tab=privacy)和[更新日志](https://docs.akta.pro/changelog)。未使用第三方测评。
> Vault 当前口径：允许第三方聚合源，但生产采集必须通过稳定 API/RSS；Vault 不抓文章网页、不运行无头浏览器；不使用中文信息源；资讯瀑布保存文章级原始信息，事件簿只能综合资讯瀑布中的记录。

## 1. 结论

**Akta 在技术传输方式上合格，但当前不能直接加入 Vault2077 的公开生产资讯瀑布。建议状态为 `contract-pending`，不是 `active`。**

主要判断：

1. **接口方式合格。** News Signals 是带 API Key 的同步 JSON GET API，不要求 Vault 访问新闻网页，也不需要 DOM、Cookie、Playwright 或无头浏览器。
2. **可以取得文章级记录。** `group_articles=false` 时应按文章拉取；`group_articles=true` 才启用事件级去重。文章对象包含标题、原文 URL、发布时间、作者、原始语言、正文、AI 摘要及分类字段。
3. **标准接口不能可靠执行“排除中文信息源”。** 它只有出版商黑名单，没有出版商白名单；`publisher` 在官方示例中还可能为空。若要采用，必须根据原文 URL 域名在 Vault 侧执行英语来源白名单，而不能依赖 Akta 的 `publisher` 或单条内容语言。
4. **增量采集能力不够完整。** API 提供日期窗口和 offset 分页，但没有公开的游标、`updated_since`、快照 token、排序参数或 webhook。可用重叠时间窗加本地去重缓解，但公开文档不足以证明实时插入时绝不漏数。
5. **公开再分发许可是阻断项。** 自助版条款只授予“内部业务用途”的可撤销许可，并明确禁止未经相关权利人同意重新发布、再分发、转售或再许可 API 返回的原始新闻内容。条款还限制公开展示、聚合和商业利用 API 内容。Vault 的公开资讯瀑布不属于纯内部用途。
6. **公开 SLA 不足。** 自助版只有速率上限和邮件支持，没有公开的可用性百分比、响应时间、数据新鲜度或事故补偿承诺；专属 SLA 只在 Enterprise 方案中出现。
7. **接口与文档仍在快速变化。** 2026-07-09 的更新刚增加开放查询、实体字段和事件级去重，并发生过 `industry` 参数的 breaking change；OpenAPI、示例和产品页之间还存在字段及调用方式不一致。

因此，在取得书面商用/公开展示授权、完成真实 API 样本测试并明确 SLA 前，不应把 Akta 登记成生产信源。它可以先作为候选供应商进入商务与技术验证。

## 2. 适配性评分

| 维度 | 结果 | 说明 |
| --- | --- | --- |
| 结构化 API | 通过 | HTTPS JSON GET；`x-api-key` 鉴权 |
| 无网页抓取 | 通过 | Vault 只请求 Akta API；无需访问文章网页 |
| 文章级原始记录 | 条件通过 | 必须显式使用 `group_articles=false` |
| 原文归因 | 部分通过 | 有 canonical `url`、作者、语言和 `publisher`，但官方示例出现空 `publisher` |
| 英语来源白名单 | 不通过 | 标准 API 无 publisher allowlist；只能黑名单排除 |
| 时间过滤 | 通过 | 支持 `start_date`、`end_date` |
| 稳健增量同步 | 部分通过 | 只有 offset 分页，无公开 cursor/updated-since/snapshot 机制 |
| 公开瀑布再分发 | 不通过 | 自助条款限内部用途，并限制原始内容的再发布/再分发 |
| 公开 SLA | 不通过 | Enterprise 可谈专属 SLA；未公开数值承诺 |
| 当前生产建议 | 暂不启用 | `contract-pending` |

## 3. API 接口与认证

官方 [OpenAPI](https://docs.akta.pro/openapi.json) 声明生产服务器为：

```text
https://api.akta.pro/api
```

新闻接口为：

```http
GET /v1/news
x-api-key: <API_KEY>
```

即完整地址：

```text
https://api.akta.pro/api/v1/news
```

所有端点通过请求头 `x-api-key` 鉴权。无效或缺失密钥返回 `401`；本次无密钥连通性探测确认接口返回 `application/json`，没有跳转到登录页或 HTML 挑战页。API Key 只能放在境外采集器服务端，不能进入浏览器、客户端代码或公共仓库。

需要注意：Akta [News Signals 产品页](https://akta.pro/news-signals) 的演示标签出现过 `POST /v1/news/stream`，但同页代码、API Reference 和 OpenAPI 均使用 `GET /v1/news`。集成时应以 OpenAPI 和正式 API Reference 为准，并将契约快照固化到测试中。

## 4. 请求参数、筛选与分页

[News API Reference](https://docs.akta.pro/api-reference/news-signals) 和 OpenAPI 公开的主要参数如下：

| 参数 | 用途 | Vault 判断 |
| --- | --- | --- |
| `company` | 公司网站或 Akta UUID | 可用于公司监控 |
| `industry` | 逗号分隔的 Akta 行业 code | 需先调用免费 Industry Search |
| `query` | 开放式主题查询 | 可用于 AI、算力、监管等主题，但召回逻辑不透明 |
| `title` | 标题搜索 | 可作窄查询 |
| `start_date` / `end_date` | `YYYY-MM-DD` 时间窗口 | 可构造轮询窗口，但只有日粒度 |
| `limit` | 默认 10，最大 1000 | 适合批量拉取 |
| `offset` | 跳过前 N 条 | offset 分页 |
| `group_articles` | 将同一事件的相似文章分组 | 瀑布必须显式设为 `false` |
| `news_score_list` | `High/Medium/Low/all` | 不应用于原始瀑布，否则会提前丢弃低分文章 |
| `countries` | 事件国家 | 不是出版商国家 |
| `blacklisted` | 排除出版商域名 | 只有排除，没有标准版白名单 |
| `type_list` | 新闻事件类型 | 可用于专题查询，不宜成为唯一入口 |
| `sentiment_list` | 情绪过滤 | 不应用于原始瀑布 |
| `entity_*_list` | 人物、地点、产品、事件实体 | 可用于观察名单 |
| `naics/sic/iptc/iab_code_list` | 分类代码 | 可用于主题细分 |

所有启用的过滤条件按 AND 关系组合。[Best Practices](https://docs.akta.pro/docs/news-signals/best-practices) 特别提醒，错误参数名可能被静默忽略，例如必须使用 `sentiment_list`，不能写 `sentiment`。这意味着 Vault 适配器必须对请求参数做白名单校验，并在合约测试中验证过滤确实生效。

### 4.1 没有服务端语言过滤

公开 OpenAPI 中不存在 `language` 或 `original_language` 请求参数。响应虽然带 `original_language`，但只能在拉取后过滤。

Vault 的新原则判断的是**信息源身份**，不是单条文章语言：英语媒体的作者偶尔使用中文，仍可保留。因此不能简单丢弃 `original_language != EN` 的文章。正确做法是：

1. 从 `url` 提取可注册域名；
2. 只允许进入 Vault 自有“英语/国际信息源白名单”的域名；
3. `publisher` 和 `original_language` 只作为校验、展示及异常告警字段；
4. 未识别域名、短链、跳转域名和空 URL 一律进入隔离区，不直接发布。

标准方案只能用 `blacklisted` 排除已知域名，无法主动限定来源集合。产品页把“Publisher Management / Custom Publishers”列为 Enterprise 定制能力，因此若要把 Akta 作为主要上游，应要求 Enterprise 提供服务端 publisher allowlist。

### 4.2 增量与分页风险

响应提供 `total`、`count`、`limit` 和 `offset`。公开资料没有说明：

- 默认排序字段及升降序；
- 同一发布时间的稳定次序；
- 抓取过程中新增文章是否会导致 offset 漂移；
- 新闻记录更新或删除的语义；
- `id` 是否永久稳定；
- cursor、snapshot token 或 `updated_since`；
- 面向新闻流的 webhook。

产品页宣称可以“paginate without offset drift”，但公开 API 契约仍只有 offset，且没有公开快照语义，不能仅凭营销文案作生产保证。

若后续获得许可并试用，最低限度的增量策略应为：

```text
每轮使用重叠 24–48 小时的 start_date/end_date
→ 逐页读取到空页或覆盖 total
→ 以 Akta id + canonical URL 做幂等去重
→ 保存每轮 total/count/offset 和页面指纹
→ 发现 total 在分页期间变化时重跑整个窗口
→ 定期回扫更长窗口处理迟到和修订记录
```

这只能降低漏数概率。正式采购前仍应要求 Akta 书面说明排序、快照、迟到数据、删除/修订和 ID 稳定性。

## 5. 响应内容与来源归因

[API Overview](https://docs.akta.pro/docs/news-signals/overview) 和官方示例显示文章记录可包含：

- `id`
- `title`
- `url`
- `publisher`
- `published_date`
- `author`
- `original_language`
- `full_text`
- `word_count`
- `ai_summary`
- `sentiment` / `sentiment_score`
- `industries`
- `tags`
- `company_mentions`
- `article_type`
- `is_press_release` / `is_opinion` / `is_breaking`
- IPTC、IAB、NAICS、SIC 分类
- `entities`
- `newsworthiness_score`
- `group_id`

其中 `url` 在 OpenAPI 中被描述为原始文章的 canonical URL，这是最重要的原文归因字段。`full_text` 是 Akta 获取并处理后的文章正文，付费墙或受限制文章可能为空；`ai_summary` 明确是机器生成内容。

### 5.1 文章级与事件级的边界

Akta 并非只返回事件摘要。默认接口的基本对象是文章；`group_articles=true` 才开启同一事件的相似文章分组。2026-07-09 的[更新日志](https://docs.akta.pro/changelog)称该参数提供“event-level deduplication”。

Vault 的使用边界应固定为：

```text
资讯瀑布：group_articles=false，只接收文章级记录
事件簿：只消费已经进入资讯瀑布的文章
Akta group_id：最多作为事件候选提示，不作为最终事件或唯一证据
```

不能用 `group_articles=true` 的单一代表记录替换原始文章集合，否则会在进入 Vault 之前丢失来源多样性，破坏“事件簿来自资讯瀑布综合整合”的产品原则。

### 5.2 归因质量仍需真实样本验证

官方文档声称返回 publisher metadata，但多个官方响应示例中 `publisher` 是空字符串。`url` 可以让 Vault 从域名恢复出版商身份，但仍需处理：

- URL 是聚合页、短链或转载页；
- canonical URL 与实际权利人不一致；
- 同一出版商多个域名；
- 联合发布、通讯社转载及新闻稿；
- `publisher` 与 URL 域名冲突。

因此 Akta 的 `publisher` 不能直接成为 Vault 的 canonical publisher。应以 Vault 自有域名注册表为准，并保留 Akta 原值用于审计。

## 6. Schema 成熟度

Akta 宣传“deterministic schemas”，但本次检查发现公开 OpenAPI、API Reference 和示例之间存在明显差异：

- OpenAPI 的 `NewsArticle` 未声明示例中出现的 `id`、`word_count`、`group_id`、实体、文章类型和多项标志；
- OpenAPI 使用 `types`、`news_score`，示例使用 `tags`、`newsworthiness_score`；
- OpenAPI 将 `published_date` 描述为 `YYYY-MM-DD`，示例实际返回带时间的 ISO 时间戳；
- OpenAPI 称 `original_language` 为 ISO 639-1，示例使用大写 `EN`；
- OpenAPI 对国家代码的描述与示例中的三字母值不一致；
- 产品演示标签与正式 GET endpoint 不一致；
- 2026-07-09 更新曾对 `industry` 参数做 breaking change。

这些问题不证明接口不可用，但说明当前不能把文档声明直接当成严格生产契约。适配器需保留未知字段、宽容解析日期/大小写，同时使用固定样本做 schema drift 告警。

## 7. 定价、限额与 SLA

根据[官方定价](https://akta.pro/pricing)和[Rate Limits](https://docs.akta.pro/getting-started/rate-limits)：

| 方案 | 信用点价格 | 默认限速 | 新闻历史 |
| --- | ---: | ---: | --- |
| Pay as you go | $0.05 / credit | 100 请求/分钟 | 6 个月 |
| Subscription | $0.04 / credit | 200 请求/分钟 | 定价页称 1 年 |
| Enterprise | 定制 | 定制 | 15 年以上 |

News Signals 计费为：

```text
0.1 credit / API call + 0.01 credit / 返回文章
```

按 PAYG 计算：

- 返回 100 条的一次调用：`1.1 credits = $0.055`
- 返回 1000 条的一次调用：`10.1 credits = $0.505`
- 10 次调用共返回 10,000 条：`101 credits = $5.05`

注意，[API Reference](https://docs.akta.pro/api-reference/news-signals) 写有“非 Enterprise 只能回看 6 个月”，而定价页又称 Subscription 可回看 1 年，二者不完全一致。采购前必须让供应商确认实际 entitlement。

公开资料没有给出自助方案的：

- 月度请求或新闻条数总额度；
- 可用性百分比；
- 响应延迟承诺；
- 新闻进入 Akta 的最大延迟；
- 故障通知和补偿；
- 数据覆盖率或出版商数量承诺。

Enterprise 页面只写“Dedicated SLA and support”，没有公开数值。Vault 若依赖 Akta，应至少约定可用性、P95 延迟、内容新鲜度、事故通知、schema 变更提前期和退出时的数据保留权。

## 8. 版权、再分发与数据使用限制

[Akta Terms & Conditions](https://akta.pro/legal?tab=terms)（页面标示最后更新 2026-05-11）是当前最重要的阻断项：

- 自助版许可是有限、非独占、不可转让、不可再许可、可撤销的许可，并限定于用户自己的内部业务用途；
- 允许用途同样限定为构建和运行内部应用及工作流；
- 未经书面同意，不得把 API 作为独立商业产品转售、再许可或白标；
- API 新闻来自第三方出版商并经过 AI 处理，Wokelo 不是这些内容的权利人；
- 未经相关权利人同意，不得重新发布、再分发、转售或再许可 API 返回的原始新闻内容；
- 用户自行负责遵守底层出版商条款和版权法；
- 条款不保证 API 内容的使用不会侵犯第三方权利；
- API/Content/Marks 的复制、聚合、再发布、公开展示、传输、分发或商业利用也受到限制，除非条款明确允许或取得书面许可；
- 输出可能包含错误或遗漏，不能作为金融、法律、投资或编辑决策的唯一依据。

Vault2077 是面向公众展示的资讯产品，因此不能把“已付 API 费用”理解成自动取得新闻内容的公开发布权。即使只展示标题、摘要、作者和原文链接，也应让 Akta 在 Enterprise MSA 或补充协议中明确授权：

1. 哪些响应字段可以持久化；
2. 哪些字段可以向公众展示；
3. 是否允许展示 Akta AI 摘要；
4. 是否允许 Vault 生成自己的翻译、摘要和事件综合；
5. 是否允许保留历史记录；
6. 合同终止后哪些数据必须删除；
7. 是否需要展示 Akta 或底层出版商 attribution；
8. 出版商投诉、撤稿和版权下架如何传递；
9. Akta 是否对授权范围、数据来源合规和第三方索赔承担责任。

没有上述书面授权时，Akta 只能用于内部评估，不能进入公开资讯瀑布；由于 Vault 事件簿只能来自资讯瀑布，它也不能作为隐藏的事件簿事实来源。

## 9. 如果商务条款解决，建议的接入边界

只有在取得明确公开展示/再分发许可后，才进入以下技术试点：

### 9.1 采集配置

```text
method: GET
endpoint: https://api.akta.pro/api/v1/news
authentication: x-api-key
group_articles: false
news_score_list: all
sentiment_list: all
limit: 1000
time window: overlapping
```

不允许：

- 跟随 `url` 抓正文；
- 以浏览器补全付费墙文章；
- 在 API 失败后降级到网页抓取；
- 使用 `group_articles=true` 的代表记录替代文章流；
- 用 AI 摘要覆盖原始标题和原文链接；
- 把 Akta 当成 canonical publisher。

### 9.2 Vault 字段映射

| Akta 字段 | Vault 用途 |
| --- | --- |
| `id` | transport record ID；需验证稳定性 |
| `title` | 原始标题 |
| `url` | canonical URL 与本地精确去重键 |
| `publisher` | 保留原值；不可直接作为 canonical publisher |
| URL 域名 | 映射 Vault 出版商白名单 |
| `published_date` | 原始发布时间；解析兼容日期和时间戳 |
| `author` | 原始作者 |
| `original_language` | 记录及告警，不单独决定来源是否合法 |
| `full_text` | 默认仅内部处理；是否可保存/展示取决于合同 |
| `ai_summary` | 标为 Akta 派生字段，不属于原始资讯 |
| `group_id` | 非权威事件候选信号 |
| 分类/实体/情绪 | 派生 enrichment，不覆盖 Vault 原始字段 |

### 9.3 上线门槛

至少完成 14 天隔离试跑并满足：

- API 请求成功率不低于 99%；
- `url` 非空率 100%；
- URL 可映射到批准出版商的比例达到预设门槛；
- `publisher` 空值率、错配率有量化结果；
- 重叠轮询没有可复现的漏数；
- 同一 URL 和同一 Akta ID 的字段修订语义明确；
- Schema drift 测试覆盖官方文档中的已知不一致；
- 版权/下架流程经过演练；
- 合同明确允许公开瀑布和事件簿的目标用法。

## 10. 给 Akta 商务/工程团队的必问清单

1. 标准 `/v1/news` 是否保证 `group_articles=false` 返回每一篇独立文章？参数省略时的默认值是什么？
2. `group_id` 是否稳定、会否重算？能否取得一个事件的完整成员列表？
3. 默认排序是什么？offset 分页如何实现“无漂移”？是否有隐藏或规划中的 cursor/snapshot/updated-since？
4. 新闻 `id` 是否永久稳定？文章修订、撤稿、删除如何通知？
5. `publisher` 为什么会在官方样本中为空？可否保证 URL、publisher 和 author 的完整率？
6. 是否可以按 publisher allowlist、publisher country/type 和 source language 在服务端过滤？
7. Enterprise “Custom Publishers”能否被严格限定为英语来源白名单？
8. 全文来自何种许可或采集安排？哪些出版商允许全文持久化和下游公开展示？
9. 能否书面授权 Vault 公开展示标题、作者、出版商、摘要和原文链接，并允许生成翻译、摘要和事件综合？
10. 是否需要逐条展示 Akta attribution？底层出版商 attribution 的具体格式是什么？
11. 自助、Subscription 和 Enterprise 的历史窗口究竟分别是多少？
12. 可提供怎样的 uptime、P95 latency、freshness、schema-change notice 和事故通知 SLA？

## 11. 最终决策

| 用法 | 当前决策 |
| --- | --- |
| 直接作为公开资讯瀑布生产信源 | **拒绝，等待合同授权** |
| 作为事件簿的独立外部信源 | **禁止**；事件簿只能消费资讯瀑布 |
| 以 `group_articles=true` 直接生成事件 | **禁止** |
| 内部隔离技术试用 | **可以**，但不得公开展示或混入生产事件 |
| 未来 Enterprise 接入 | **有条件可行**：书面再分发权 + publisher allowlist + 增量/SLA 验证 |

一句话概括：**Akta 是一个有吸引力的文章聚合与结构化 API，但目前更像“内部情报供应商”，还不是可以无条件嵌入公开资讯产品的新闻授权源。它通过了“API 而非网页抓取”的技术门槛，却尚未通过 Vault 的来源治理、增量可靠性和公开再分发许可门槛。**
