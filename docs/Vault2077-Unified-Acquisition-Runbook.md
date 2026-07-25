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
| `rankings` | 每小时唤醒 | 按任务 | 无编辑模型 | 平台原生榜、Frontier 定时观察和公开任务 |

当前仓库的 `collect-content.yml` 已支持四通道，但 rankings 仍为每日两次，且存在独立 `frontier-hourly.yml`。在这两项合并前，生产发布门禁不通过；不要把当前部分实现解释为规范已完成。

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
- Frontier 延迟：检查 rankings 每小时唤醒、任务积压和签名 observation；不得从境内后台直连 GitHub。

## 7. 备份与恢复

预览文件不构成生产备份。生产 v1 备份 PostgreSQL 并定期实际恢复；若未来启用对象存储，再把原始包与归档纳入清单。记录日期、负责人、恢复点、耗时和结果。
