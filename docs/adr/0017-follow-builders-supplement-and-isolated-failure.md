---
type: adr
status: accepted
updated: 2026-08-01
amends: ADR-0005, ADR-0008, ADR-0015
---

# Follow Builders 补充来源与隔离失败策略

## 决策

Hacker News 与 Lobsters 从生产运行来源中退役，不再承担 roadside 社区发现。Follow Builders 作为补充来源，不作为发布者或单一聚合来源：其获准自然人 X 账号按标准化 handle 与现有 X 注册表去重后，各自保留独立 source ID、原作者和 canonical X URL；Google Labs、Claude 等机构 X 账号不进入 roadside。

Follow Builders 清单中的播客和官方博客按 SiC 的既有内容组与准入合同处理。重复来源沿用 SiC 现有官方入口；新增来源直接访问节目官方 RSS 或机构官方 sitemap，不复制 Follow Builders 中央 feed 的播客转录或博客全文。

Follow Builders 补充来源的失败策略固定为 `isolated`。中央 X feed 的网络失败、过期、结构异常、超量或身份校验失败必须进入逐来源报告和告警，但不得把 acquisition workflow 置为失败，不得阻止其他来源形成和投递批次。未知来源和未显式标记为 `isolated` 的来源继续采用 fail-closed 的阻断策略。

中央 X feed 允许无新帖账号不出现在本轮账号数组中；仅当账号缺席且 feed 同时携带顶层 `errors` 时，才判定该账号可能因上游部分失败而缺失，并保留上一成功快照。每条帖子必须有合法 `createdAt`，且 URL 中的 handle/status ID 必须与注册表和帖子 ID 一致。Claude Blog 的非深度营销公告由注册表正则规则在候选准入阶段排除。

## 接口与限制

- 中央 X feed 在一次采集进程内只请求一次，多个作者共享缓存结果；
- feed 必须使用 24 小时窗口，生成时间不得超过 36 小时；
- 最多 26 个账号、每账号最多 3 条、全 feed 最多 78 条；
- 每条内容必须通过 handle、Post ID、canonical URL 和发布时间校验；
- 26 个上游 X 账号中，3 个与现有来源重复，2 个机构账号排除，新增 21 个个人来源；
- 所有文本按不可信外部输入处理，不加载上游 Skill 或远程 prompts。

## 结果

Roadside 从“个人来源 + 两个社区来源”调整为“现有个人来源 + 有界个人补充来源”。系统接受失去 Hacker News/Lobsters 社区发现能力，以换取更可控的数量和主题聚焦。Follow Builders 不可用时，该补充内容可能缺席或保留上一成功快照，但其他来源和统一 workflow 必须继续工作。
