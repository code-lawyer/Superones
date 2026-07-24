# Vault2077 信源核验与运行清单

> 核验日期：2026-07-22
> 范围：TrendRadar、Horizon、follow-builders、BestBlogs、CloudFlare-AI-Insight-Daily、PrismFlowAgent、Glance 的固定提交。
> 口径：核查这些项目实际引用的上游发布渠道和采集入口，不评价或部署这些项目本身。

## 结果

- 从固定提交中抽取并应用视频范围门禁后，注册表保留 475 个去重逻辑信源、486 个入口；19 项动态或缺少凭据的配置单独记为 unresolved。上游出现的 44 个 YouTube 频道不会进入注册表。
- 对保留入口逐个发起格式感知的在线探测，当前有 384 个入口确认返回预期内容。
- 其余入口包括：37 个需授权、15 个被目标站点拒绝、80 个当前网络错误、4 个超时、6 个上游 5xx、2 个明确失效、1 个其他 HTTP 错误、1 个内容格式不符。
- 按“排除大陆来源平台、不按内容语言过滤、排除视频专属通道”的生产准入规则重新生成后，运行 bundle 为 201 个 active，其中 RSS/Atom 183 个、结构化接口 18 个；255 个候选留在 pending，19 个非目标频道继续 excluded。active 中包含 7 个主要语言标为中文的 X 通道，这是语言与平台归属分离后的预期结果。
- 行情、Twitch 和无法静态枚举成员的 Folo 动态列表不进入 Vault 信息流 bundle；GitHub Trending 保留为 SiC 信号。

“可用”只表示在核验时刻、核验网络中，入口可达且返回了与连接器相符的内容；它不是永久 SLA。生产每轮仍会全量遍历启用信源，并记录逐源失败。

## 可审计产物

- [`config/source-registry.json`](../config/source-registry.json)：逻辑信源、全部入口、发现证据、固定提交、逐入口状态和未解析项。
- [`Vault2077-Source-Registry.csv`](./Vault2077-Source-Registry.csv)：便于人工逐行查看和筛选的 486 入口清单。
- [`config/source-bundle.json`](../config/source-bundle.json)：境外采集器实际读取的去重运行清单，以及未进入运行态的 pending 项和原因。
- [`Vault2077-Source-Audit-Research.md`](./Vault2077-Source-Audit-Research.md)：逐仓库代码与配置拆解、动态来源边界和交叉去重依据。

## 再生成流程

1. 人工同意调研项目或其固定提交发生变化。
2. 运行 `npm run sources:extract -- --audit-root <固定提交目录>`，生成未经分类和在线核验的注册表。
3. 运行 `npm run sources:classify`，应用确定性规则与受控实体覆盖表。
4. 运行 `npm run sources:audit`；对失败项可使用 `--retry-failed true` 做长超时复核。
5. 确认全部入口都有 `checkedAt`、全部通道都有分类来源和置信度，再运行 `npm run sources:bundle`。
6. 提交注册表、CSV、bundle 和对应代码；生产仅消费提交内的 bundle。

重新执行第 2 步会有意清空旧分类和健康状态，因此第 2—5 步必须按顺序完成。动态 Folo 列表、X 官方 API、Twitch、LWN 订阅源等仍需合法凭据或外部成员清单；在这些条件满足前不得标为已验证可用。
