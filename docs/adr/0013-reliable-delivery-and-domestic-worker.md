---
type: adr
status: accepted
updated: 2026-07-25
amended-by: ADR-0015
---

# ADR-0013：境外可靠投递与境内独立消费

## 决策

统一采集采用单向、幂等、至少一次投递：

1. GitHub Actions 只负责读取批准的境外公开来源、形成不可变批次，并向境内唯一接收入口投递。
2. 投递失败只以同一 `batchId` 和完全相同的请求体做最多四次有界指数退避；每次请求重新生成时效签名。
3. 签名请求携带 `X-Vault2077-Key-Id`。境内通过版本化密钥环短暂同时接受新旧密钥，采集侧只使用活动密钥。
4. 境内接收完成并持久化 inbox 后立即返回 `202`。GitHub Actions 不调用 LLM、不等待处理、不持有 worker 密钥。
5. 境内 `vault2077-acquisition-worker.timer` 每五分钟消费 inbox。领取使用 claim token；处理失败最多六次指数退避后进入 `quarantined`，不要求境外重新采集。成功记录保留 30 天，隔离记录保留 180 天后自动清理。
6. `/api/internal/acquisition/process` 只保留给回环环境的本地演练和紧急人工诊断，不是公网生产接口。
7. 公网反向代理在内部命名空间只开放精确的 `POST /api/internal/acquisition` 与只读 `GET /api/internal/frontier/tasks`。前者执行边缘限速后接收签名批次；后者用独立只读密钥返回已脱敏公开任务。其余 `/api/internal/*` 全部拒绝。

## 理由

跨境网络和 GitHub 定时任务都可能延迟或短暂失败。把采集、投递和境内 LLM 处理串成一个长请求，会让任一提供方或网络故障拖垮整条管线，也会使境外运行单元获得不必要的内部处理权限。现有 PostgreSQL inbox 已提供幂等、租约、重试和隔离，独立境内 worker 能直接利用这些能力。

## 安全与轮换

- Nginx 必须覆盖 `X-Forwarded-For` 与 `X-Real-IP`，Node 端口只监听回环地址。
- 生产必须使用 `VAULT2077_PIPELINE_SIGNING_KEYS` 和 `VAULT2077_PIPELINE_ACTIVE_KEY_ID`，不得继续使用单值共享密钥。
- 敏感数据使用独立的 `VAULT2077_DATA_KEYS` 与活动密钥 ID；新密文携带版本，旧密文仅在旧密钥仍保留于密钥环时可读。
- 同一密钥不得跨签名、私人数据、后台会话、审计、健康检查或 worker 鉴权复用。

## 结果

- 境外和境内处理可以分别告警、补跑和扩容。
- GitHub 投递成功只证明批次已安全进入境内 inbox，不代表内容已经发布。
- 生产必须同时监控 GitHub 通道新鲜度、投递结果、inbox 积压、worker 退出码和最终发布时间。
- GitHub 定时任务可能延迟或丢弃，因此运维必须保留人工 `workflow_dispatch` 补跑能力和新鲜度告警。
