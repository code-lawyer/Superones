# Vault2077 统一信息管线运行手册

> 状态：四通道采集、签名投递、境内串行队列、LLM 并发池和平台原生榜单已经进入同一主链。本文以 2026-07-24 的实现为准。

## 1. 四个独立通道

全部时间按北京时间理解，GitHub Actions 的 cron 已换算为 UTC：

| 通道 | 北京时间 | 窗口 | LLM |
|---|---|---:|---|
| `information` | 双数小时 `:05` | 12 小时重叠 | 是 |
| `roadside` | 双数小时 `:55` | 12 小时重叠 | 是 |
| `sic` | `07:25 / 19:25` | 24 小时重叠 | 是 |
| `rankings` | `07:55 / 19:55` | 12 小时 | 否 |

每次工作流只生成一个通道的批次。GitHub Actions 按通道使用独立 `concurrency` 组，避免 GitHub 自动取消其他通道的等待任务；真正的全局串行边界位于境内 Inbox，Worker 一次只领取一个批次，因此不同内容通道不会同时压向 LLM。LLM 默认并发为 2；单批超过 30 分钟写入 `LANE_PROCESSING_SLOW` 告警，不自动提高并发。

统一批次必须包含：

```text
lane
scheduleId
windowFrom
windowUntil
```

重复投递相同 `batchId` 与正文只返回已有回执；相同 ID 的不同正文被拒绝。内容层继续按内容哈希、规范 URL 和 X status ID 去重。

## 2. 主链

```text
GitHub Actions（境外）
  ├─ 按 lane 读取获批来源
  ├─ 抓取窗口内全部可接受记录，禁止单源截断
  ├─ 逐源生成 succeeded / partial / empty / failed
  ├─ 生成不可变 AcquisitionBatch 与 artifact
  └─ HMAC 签名投递
          ↓
国内 VPS /api/internal/acquisition
  ├─ 限流、验签、时钟窗口与 Schema 校验
  ├─ 原始正文和来源状态原子落盘
  └─ 幂等接收并进入全局队列
          ↓
国内 VPS /api/internal/acquisition/process
  ├─ information：翻译、摘要、事件判断
  ├─ roadside：翻译、摘要、事件判断
  ├─ sic：翻译与摘要
  ├─ rankings：按平台原序落库，不调用 LLM
  └─ 成功确认；失败保留并等待重试
```

境内处理器禁止回源访问境外页面。供 LLM 使用的材料必须随境外批次送达。

## 3. 来源与榜单政策

- 资讯瀑布不接受 `originPlatform=x` 的原生内容。
- 名人说只接受 `publisherKind=person`，当前白名单为 34 个已核验自然人。
- RSS 返回的 handle 必须和注册 handle 完全一致，否则来源失败。
- 机构、项目和媒体的 X 账号不进入名人说；其动态只能从官网、Newsroom、Blog、Release 或研究档案进入资讯。
- GitHub 只展示官方 Trending 的 Today、This week、This month。
- Hugging Face 展示官方 Trending 顺序。
- OpenRouter 展示官方 `top-weekly` 顺序。
- skills.sh 展示 All Time、Trending 24h、Hot。
- MCP 榜暂时删除。
- 不保存历史累计量来推算 GitHub、Hugging Face 或 Skill 增量。

每个榜单条目保存 `provider`、`providerView`、`providerRank`、`providerMetric`、`capturedAt`、`sourceUrl`，展示层不得重排。

## 4. 必需配置

GitHub Actions 仅需要：

```text
VAULT2077_DOMESTIC_ACQUISITION_URL=https://<国内域名>/api/internal/acquisition
VAULT2077_DOMESTIC_ACQUISITION_PROCESS_URL=https://<国内域名>/api/internal/acquisition/process
VAULT2077_PIPELINE_SHARED_SECRET=<至少 32 字节随机值>
VAULT2077_PIPELINE_WORKER_SECRET=<可选；默认复用 shared secret>
```

公开来源使用内建 `github.token`，不需要 GH Archive、Google Cloud、Smithery、Vercel OIDC、Hugging Face 或 X Token。

国内 VPS 需要：

```text
VAULT2077_DATA_DIR=/srv/vault2077/data
VAULT2077_PIPELINE_SHARED_SECRET=<与 Action 相同>
VAULT2077_PIPELINE_WORKER_SECRET=<与 Action 相同或留空>
VAULT2077_LLM_BASE_URL=https://<OpenAI-compatible-provider>/v1
VAULT2077_LLM_API_KEY=<secret>
VAULT2077_LLM_MODEL=<model-id>
VAULT2077_LLM_TIMEOUT_MS=120000
VAULT2077_LLM_CONCURRENCY=2
```

不要把 API Key 写入仓库、artifact 或日志。

## 5. 验证

```bash
npm test
npm run typecheck
npm run build
python -m unittest discover -s collector/tests -p "test_*.py"
```

本地完整真实试跑前，在当前终端安全设置三个 LLM 环境变量，然后运行：

```bash
npm run pipeline:local
```

脚本按 `information → roadside → sic → rankings` 顺序运行，不再把所有数据同时送入模型。结果写入独立运行目录，`/pipeline` 展示四通道队列、逐源健康度和最终内容。

仅验证某个境外通道：

```bash
VAULT2077_ACQUISITION_LANE=rankings npm run acquisition:collect
```

GitHub Actions 的手动触发允许选择通道，并可在国内 VPS 尚未接入时关闭 `require_delivery`，只验证境外抓取和 artifact。

## 6. 健康判定

一轮只有同时满足以下条件才算全绿：

- 注册来源都有来源报告，没有静默跳过；
- 窗口内记录没有被单源上限截断；
- 所有批次都有境内回执并进入终态；
- `pending=0`、`processing=0`、`failed=0`；
- 内容通道没有无法解释的隔离；
- 榜单顺序和平台原始响应一致；
- 详情地址返回 HTTP 200；
- 同一批次重投不重复调用 LLM。

`empty` 是健康状态；`partial` 和 `failed` 必须显式显示并使正式采集任务失败。失败恢复时保留原批次和 `batchId`，修复网络、模型或磁盘后重跑 Worker，不能生成新 ID 绕过失败。

持久卷至少备份：

```text
acquisition-inbox/
content-store.json
sic-content-store.json
direct-rankings.json
mvp-store.json
```

当前文件存储只支持单写实例。扩容前必须迁移到具备事务、锁与备份恢复能力的存储。
