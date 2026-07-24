# Vault2077 统一信息管线运行手册

> 状态：统一采集、签名投递、境内持久化和严格处理主链已实现。本文以 2026-07-24 的代码和全量试跑为准。

## 1. 单一主链

```text
GitHub Actions（境外）
  ├─ 读取全部获批来源注册表
  ├─ 抓取 Vault 资讯、SiC 内容、模型/项目/Skill/MCP 榜单
  ├─ 为每个来源生成 succeeded / partial / empty / failed 报告
  ├─ 生成统一 AcquisitionBatch 并保存原始 artifact
  └─ HMAC 签名投递
          ↓
境内 VPS /api/internal/acquisition
  ├─ 限流、验签、时钟窗口和 Schema 校验
  ├─ 原始正文与状态原子落盘
  └─ 重复批次幂等、异文同 ID 拒绝
          ↓
境内 VPS /api/internal/acquisition/process
  ├─ 资讯：境内 LLM 翻译、摘要和事件判断
  ├─ 论文/课程/播客：境内 LLM 翻译和摘要
  ├─ 榜单：确定性落库，不调用 LLM
  └─ 成功后确认；失败批次保留并等待下一轮重试
```

境内处理器禁止重新访问境外原页。需要供 LLM 使用的正文材料必须在境外采集阶段进入批次。

## 2. “全部”的验收定义

每轮必须做到：

1. 注册表内每个 active/approved 来源都产生且只产生一份来源报告；不能抽样、静默跳过或用旧数据伪装本轮成功。
2. 采集窗口内被 adapter 接受的每条记录都进入统一批次；不能只取每个来源的最新一条再处理。
3. 每个批次都必须获得境内接收回执，并由 Worker 进入终态。
4. 任意资讯被隔离、任意 SiC 记录缺少 LLM 编辑结果，批次都不能标记为成功。
5. `empty` 表示本轮无新增，是健康状态；`partial` 和 `failed` 必须在 Action 中可见；任何 `failed` 都让 Action 失败并保留 artifact。

常规增量抓取使用 12 小时时间窗。它覆盖窗口内的全部新记录，但不等于对来源全部历史内容做一次性回填。历史回填应使用独立批次和限速策略，不能挤占常规管线。

## 3. 当前来源清单

2026-07-24 的注册表包含 235 个逻辑来源：

- Vault：201 个来源；
- SiC 固定内容：27 个来源；
- 排行榜：7 个来源。

边境计划的 GitHub Star 来源是动态来源。当前本地数据中没有已验证报名，因此本轮没有动态记录；上线前仍需将“境内导出待观察仓库 → 境外读取 GitHub → 境内回传快照”接入同一批次协议。

## 4. GitHub Actions 必需 Secrets

统一工作流为 `.github/workflows/collect-content.yml`。以下配置缺失时不得上线：

```text
VAULT2077_DOMESTIC_ACQUISITION_URL=https://<国内域名>/api/internal/acquisition
VAULT2077_DOMESTIC_ACQUISITION_PROCESS_URL=https://<国内域名>/api/internal/acquisition/process
VAULT2077_PIPELINE_SHARED_SECRET=<至少 32 字节随机值>
VAULT2077_PIPELINE_WORKER_SECRET=<可选；为空时使用 shared secret>
VAULT2077_GITHUB_READ_TOKEN=<可选；为空时使用 github.token>
VAULT2077_SMITHERY_API_KEY=<Skill/MCP>
VAULT2077_GHARCHIVE_BIGQUERY_PROJECT=<GitHub 24H/7D>
VAULT2077_GCP_WORKLOAD_IDENTITY_PROVIDER=<Google WIF Provider 完整名称>
VAULT2077_GCP_SERVICE_ACCOUNT=<只授予 BigQuery 查询所需权限的服务账号>
```

工作流设置 `VAULT2077_REQUIRE_DOMESTIC_DELIVERY=true`。因此 URL 或共享密钥缺失时任务会直接失败，不允许只采集不投递却显示绿色。

工作流通过 GitHub OIDC 和 Google Workload Identity Federation 为每次运行生成短期访问令牌，不保存长期 Google 私钥，也不要求人工轮换 `VAULT2077_GHARCHIVE_BIGQUERY_ACCESS_TOKEN`。

## 5. 境内 VPS 配置

```text
VAULT2077_DATA_DIR=/srv/vault2077/data
VAULT2077_PIPELINE_SHARED_SECRET=<与 Action 相同>
VAULT2077_PIPELINE_WORKER_SECRET=<与 Action 相同或留空>

VAULT2077_LLM_BASE_URL=https://<OpenAI-compatible-provider>/v1
VAULT2077_LLM_API_KEY=<secret>
VAULT2077_LLM_MODEL=<model-id>
VAULT2077_LLM_TIMEOUT_MS=120000
```

OpenRouter 试运行可以使用：

```text
VAULT2077_LLM_BASE_URL=https://openrouter.ai/api/v1
VAULT2077_LLM_API_KEY=<OpenRouter key>
VAULT2077_LLM_MODEL=<你选择的模型 ID>
```

不要把 Key 写进 `.env.example`、GitHub artifact、日志或 Git 提交。实际 VPS 使用只对服务账户可读的环境文件。

## 6. 验证

代码验证：

```bash
npm test
npm run typecheck
npm run build
```

境外全量采集：

```bash
npm run acquisition:collect
```

用真实采集批次和本地模拟 LLM 回放完整链路：

```bash
node scripts/run-acquisition-full-replay-e2e.mjs \
  .collector-output/<run>/acquisition-batches
```

2026-07-24 的本地真实试跑结果：

```text
来源报告：235
统一批次：4
抓取记录：496
资讯处理：317
SiC 内容处理：177
榜单处理：2
最终队列：4 succeeded / 0 pending / 0 processing / 0 failed
```

这次回放证明传输和境内处理主链能够消费所有已抓到记录。它不证明每个境外源都可用：同轮仍有 36 个源失败，主要来自缺少本地凭据、目标站网络超时和地区/反爬限制。

## 7. 健康判定与恢复

一轮只有同时满足以下条件才算全绿：

- 所有来源状态均不是 `failed`；
- 所有批次都有接收回执；
- Worker 返回 `ok: true`；
- 队列 `pending=0`、`processing=0`、`failed=0`；
- 资讯和 SiC 严格处理没有隔离或缺失；
- artifact 中的批次、来源和记录计数与回执一致。

失败恢复时保留原始批次和原 `batchId`。修复网络、凭据、LLM 或磁盘后重新触发 Worker；不要手工编辑 JSON，也不要生成新 ID 绕过失败记录。

持久卷至少备份：

```text
acquisition-inbox/
content-store.json
sic-content-store.json
sic-snapshots.json
sic-github-rankings.json
sic-extension-snapshots.json
mvp-store.json
```

当前文件存储只支持单写实例。扩容到多副本前必须先迁移到支持事务、锁和备份恢复演练的数据库/对象存储组合。
