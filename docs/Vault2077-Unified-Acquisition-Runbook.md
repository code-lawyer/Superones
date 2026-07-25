---
type: runbook
status: active
updated: 2026-07-24
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

当前仓库的 `collect-content.yml` 已支持四通道，但 rankings 仍为每日两次，尚未达到每小时处理到期平台榜和 Frontier 回退任务的目标。`frontier-hourly.yml` 当前触发境内 Frontier 业务刷新，不是第二套境外采集器；生产前仍应把它迁移为受监控的境内后台调度，避免用 GitHub Actions 充当长期业务时钟。

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

境内侧至少配置签名/worker 密钥、来源 bundle 与允许 revision、生产数据库，以及三个内容通道使用的编辑提供方。rankings 不使用编辑模型。密钥不得进入仓库、日志或 artifact。

Frontier 境内侧另配置只读 GitHub 服务端凭证和 tick 鉴权。交互式核验先写报名再尝试短时直读；失败必须保持待验证并写公开回退任务。每小时观察只读取境内事实源中的当前已验证仓库，保存最近成功时间、限流信息和失败分类；页面不触发 GitHub 请求。

## 5. 成功标准

一次通道运行只有同时满足以下条件才成功：

1. 来源解析完成并生成带 `sourceReports` 的批次；
2. 境内接收成功且 `batchId` 可追踪；
3. 处理完成或明确进入可重试状态；
4. 最后成功时间只在完整发布后推进；
5. artifact 不包含私人资料或密钥。

“采集完成但未投递”不得在生产计划任务中显示绿色。

## 6. 故障处理

- 签名/重放拒绝：核对密钥、原始请求体、时间戳、`batchId` 与时钟，不得放宽验证。
- 未知来源修订：隔离批次，先审核并部署注册表，再重放。
- 单一来源失败：允许其他来源继续，但按新鲜度告警，不得虚构数据补齐。
- 处理失败：保留 inbox，以同一 `batchId` 幂等重试，不重新采集制造重复批次。
- Frontier 交互核验延迟：检查境内 GitHub 快速路径的超时、限流和凭证；失败记录必须已进入公开回退任务。
- Frontier 排名延迟：检查境内每小时观察、当前参赛名单、上一成功快照，以及 rankings 回退任务积压和签名 observation。

## 7. 备份与恢复

预览文件不构成生产备份。生产 v1 备份 PostgreSQL 并定期实际恢复；若未来启用对象存储，再把原始包与归档纳入清单。记录日期、负责人、恢复点、耗时和结果。
