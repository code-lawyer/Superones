---
type: runbook
status: active
updated: 2026-07-25
---

# Vault2077 统一采集运行手册

本手册只描述当前统一采集入口及目标生产操作。历史 ContentBatch、SiC 独立推送和 Frontier 独立刷新命令不再作为有效操作。

## 1. 通道

| 通道 | 北京时间 | 重叠 | 处理 | 说明 |
| --- | --- | --- | --- | --- |
| `information` | 偶数小时 `:05` | 12h | 境内编辑处理 | 正式资讯 |
| `roadside` | 偶数小时 `:55` | 12h | 境内编辑处理 | 个人/社区发布 |
| `sic` | `07:25`、`19:25` | 24h | 境内编辑处理 | 论文、档案、课程、播客 |
| `rankings` | 每小时唤醒 | 按任务 | 无编辑模型 | 平台原生榜与 Frontier 失败回退任务 |

当前仓库的 `collect-content.yml` 已支持四通道，rankings 在每小时 `:35` 处理平台榜和 Frontier 公开回退任务。Frontier 参赛名单观察与季度结算由境内 scheduler 每小时执行 `npm run frontier:tick`；仓库提供 `deploy/systemd/vault2077-frontier-tick.{service,timer}` 模板，境外 GitHub Actions 不再承担业务时钟。

### 1.1 内容主路由

- `information`：第三方新闻、批准的机构新闻入口、获准项目的重大 GitHub Release。
- `roadside`：自然人公开表达、个人博客，以及 Hacker News/Lobsters 的社区原生条目。
- `sic`：批准的论文、深度档案、课程与播客固定入口。
- 机构宽泛混合 Feed 保持待审；不得在境内用 LLM 决定同一条内容究竟送往 information 还是 sic。
- Hacker News/Lobsters 条目的讨论页是 canonical URL；`externalUrl` 只供展示与人工访问，采集器不得请求该外链，也不得产生发现候选文件。

### 1.2 首次上线回填

首次生产开放前执行一次 `bootstrap`，不得把第一次日常增量运行当作上线基线：

1. 固定来源 bundle revision，并确认所有目标来源仍为 approved。
2. SiC 按论文、档案、课程、播客分组运行；每个 approved 来源至少取得最近一条合格内容，即使其发布时间早于 24 小时窗口。
3. Vault 只读取最近 30 天新闻型内容，按正常规则形成资讯与事件，不做“每源至少一条”的陈旧填充。
4. 将结果拆成有界小批次，先完成一组的 `sic_editorial` 或 `vault_editorial` 处理再投递下一组；不得一次性启动全部模型请求。
5. 核对每条内容的原始发布时间、来源、稳定 ID 和处理状态，确认公开页面不会把回填日期显示成原始发布日期。
6. 保存 bootstrap 报告和失败来源清单；只补跑失败/缺失来源，随后再启用 incremental 计划任务。

当前采集合同、workflow 和采集器已经支持显式 `runMode=bootstrap`：Vault 使用 30 天窗口，SiC 绕过日常窗口并按 approved 来源保留最近一条，批次仍使用同一签名和幂等合同。代码能力已就绪不等于上线基线已经完成；正式开放前仍须在目标生产修订上执行、保存逐来源报告并补跑失败来源。

## 2. 本地验证

```powershell
npm.cmd run docs:check
npm.cmd run typecheck
npm.cmd test
python -m unittest discover -s collector/tests -p "test_*.py"
npm.cmd run build
npm.cmd run test:acquisition:e2e
```

验证四通道完整本地演练：

```powershell
npm.cmd run pipeline:local
```

该命令使用临时数据目录启动本地站点、采集四通道、投递统一 inbox、处理并生成报告。报告中的 `/pipeline` 仅供本地诊断。

## 3. 手动运行通道

```powershell
$env:VAULT2077_ACQUISITION_LANE='information'
$env:VAULT2077_SCHEDULE_ID='manual-information-001'
npm.cmd run acquisition:collect
```

可选 lane 为 `information`、`roadside`、`sic`、`rankings`。手动运行必须使用唯一 schedule ID；生产投递还需要接收 URL 和签名密钥。

## 4. 发布配置

采集侧至少配置：

- `VAULT2077_DOMESTIC_ACQUISITION_URL`
- `VAULT2077_DOMESTIC_ACQUISITION_PROCESS_URL`
- `VAULT2077_PIPELINE_SHARED_SECRET`
- `VAULT2077_PIPELINE_WORKER_SECRET`
- `VAULT2077_REQUIRE_DOMESTIC_DELIVERY=true`

境内侧至少配置签名/worker 密钥、来源 bundle 与允许 revision、生产数据库，以及两个逻辑频道编辑配置：

- `vault_editorial`：处理 information、roadside 及 Vault 事件编排；
- `sic_editorial`：只处理 sic 内容；
- `rankings`：不得使用编辑模型。

每个编辑配置分别设置主处理提供方、受控备用、队列并发、每周期预算、超时与熔断阈值。批次按固定时刻错峰进入 inbox，worker 再按配置的有界并发消费；不得把一个批次内的全部记录同时发起模型请求。密钥不得进入仓库、日志或 artifact。

当前实现已按 `vault_editorial` 与 `sic_editorial` 读取两套主/备用提供方、超时、批大小、并发和单轮请求预算；生产不接受旧的全局 `VAULT2077_LLM_*` 兼容配置。PostgreSQL inbox 可由并发 worker 通过 `SKIP LOCKED` 领取不同批次，两类业务写入不同聚合事务。正式开放前仍须用目标提供方完成容量、切换和长时间积压演练，并保存提供方/模型/Schema 版本审计证据。

Frontier 境内侧另配置只读 GitHub 服务端凭证和 tick 鉴权。交互式核验先写报名再尝试短时直读；失败必须保持待验证并写公开回退任务。每小时观察只读取境内事实源中的当前已验证仓库，保存最近成功时间、限流信息和失败分类；页面不触发 GitHub 请求。

直读使用短超时、有界并发、持久化限速、五分钟缓存与 ETag/Last-Modified 条件请求。失败任务由 `/api/internal/frontier/tasks` 只输出赛季、报名 ID 与公开仓库标识；rankings 通道读取 GitHub 后以 `repository_observation` 回传，成功写入后删除任务。该任务不得包含邮箱、挑战正文或运营备注。

## 5. 成功标准

一次通道运行只有同时满足以下条件才成功：

1. 来源解析完成并生成带 `sourceReports` 的批次；
2. 境内接收成功且 `batchId` 可追踪；
3. 处理完成或明确进入可重试状态；
4. 最后成功时间只在完整发布后推进；
5. artifact 不包含私人资料或密钥。

bootstrap 还必须证明每个 approved SiC 来源存在最近一条合格记录或有明确的可恢复失败；“来源可访问但日常窗口为空”不算基线完成。

“采集完成但未投递”不得在生产计划任务中显示绿色。

## 6. 故障处理

- 签名/重放拒绝：核对密钥、原始请求体、时间戳、`batchId` 与时钟，不得放宽验证。
- 未知来源修订：隔离批次，先审核并部署注册表，再重放。
- 主路由冲突：若同一 endpoint 或同一原始 URL 同时出现在机构新闻与 SiC 档案来源中，阻止部署来源 bundle，先修注册表。
- 单一来源失败：允许其他来源继续，但按新鲜度告警，不得虚构数据补齐。
- 处理失败：保留 inbox，以同一 `batchId` 幂等重试，不重新采集制造重复批次。
- 单个编辑配置积压：只降低该配置的消费速度或暂停其新任务，保持另一配置继续处理；不得临时把积压任务随机撒到未登记的提供方。
- 主处理提供方失败：达到既定阈值后切换该配置的受控备用，记录切换原因、起止时间、提供方/模型/提示版本；恢复主提供方前先以非发布探针验证。
- 预算耗尽或限流：保留队列并延后消费，不降低事实校验、绕过 Schema 或发布未经处理的原始内容。
- 初始化来源为空：检查连接器是否错误套用了日常时间窗口；不得用另一来源内容、演示数据或不合格条目代填。
- Frontier 交互核验延迟：检查境内 GitHub 快速路径的超时、限流和凭证；失败记录必须已进入公开回退任务。
- Frontier 排名延迟：检查境内每小时观察、当前参赛名单、上一成功快照，以及 rankings 回退任务积压和签名 observation。

## 7. 备份与恢复

预览文件不构成生产备份。生产 v1 备份 PostgreSQL 并定期实际恢复；若未来启用对象存储，再把原始包与归档纳入清单。记录日期、负责人、恢复点、耗时和结果。

## 8. 健康检查

监控服务使用独立 `VAULT2077_HEALTH_SECRET` 读取 `GET /api/internal/health`。检查覆盖数据库迁移与延迟、inbox retryable/quarantined、Vault/SiC 新鲜度、平台榜 stale、Frontier 回退积压和两套编辑配置。返回 `503` 表示至少一项 degraded；告警平台必须保留开始时间、恢复时间和处置记录，不能只以进程存活代替业务健康。

部署前先在最终生产环境变量下运行 `npm run deploy:check`。该门禁拒绝文件预览、无 TLS 数据库、示例密钥、任何本地后台密码变量、同主机公开/管理入口、不完整身份网关配置、旧共享模型配置、缺失的独立处理密钥和不完整的两套编辑配置；警告不会阻断启动，但必须在发布记录中解释。
