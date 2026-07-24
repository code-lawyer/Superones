# 信息管道运行说明

> 状态：当前 MVP 实现手册，不修改产品规则。最后按代码复核：2026-07-23。规范冲突时，以 `docs/README.md` 所列规范性文件为准。

## 1. 已实现拓扑

```text
GitHub Actions（境外）
  ├─ Vault 信息流
  │   source-bundle.json
  │     → Python / collector.horizon_raw_export
  │     → 规范化、分包、HMAC 签名
  │     → POST /api/internal/content（境内）
  │     → 不可变队列 → POST /api/internal/content/process
  │     → OpenAI-compatible 编辑与事件编排
  │     → data/content-store.json → /feed
  │
  └─ SiC 学院
      config/sic-source-registry.json
        → Node 22 / scripts/collect-sic-overseas.ts
        → .collector-output/sic-content.json
        → Bearer + HTTPS
        → POST /api/internal/sic/content（境内）
        → 注册表复核、受限编辑增强、合并落盘
        → data/sic-content-store.json → /sic

GitHub Actions（境外）──唤醒──→ POST /api/internal/sic/snapshot（境内）
                                      ├─ GitHub Trending / GH Archive / GitHub REST
                                      ├─ Hugging Face / OpenRouter
                                      └─ skills.sh / Smithery
                                      → 三组独立快照文件 → /sic
```

境外 GitHub Actions 作业现在同时使用 Python 3.12 和 Node.js 22。Python CLI 只服务 Vault 信息流；Node 脚本只服务 SiC 固定来源。整个境外作业仍不使用浏览器、数据库或 LLM，也不持有用户数据、后台密码、BigQuery 凭据、Smithery 密钥或境内模型密钥。

`collector/horizon_raw_export.py` 以固定 commit 的 Horizon 采集适配器作为内部实现；Horizon 的 AI、文章全文抓取、日报、通知、MCP 与发布功能都不会被导入或运行。检出仓库后必须执行 `git submodule update --init --recursive`。虽然两条采集路径目前位于网站仓库并共用一个工作流，部署职责仍然独立于境内站；未来拆仓时必须同时带走 `collector/`、`scripts/collect-sic-overseas.ts`、SiC 采集所需的 `lib/sic-*.ts`、两个来源配置和锁定依赖。

境内接收和模型处理已解耦。接收接口只在验签与契约通过后持久化原始正文并返回 `202`，不会等待 LLM。Worker 失败时批次保留为 `failed`，下一次调用继续尝试；新 `pending` 批次优先，历史失败不会饿死整条队列。

SiC 不是 Vault 信息流队列的一部分。SiC 内容接口在同一个请求内完成包校验、必要的中文编辑增强与文件合并；模型未配置或原页无法访问时，原始标题、摘要和链接仍会落盘。SiC 排行榜快照则由境内接口直接访问各指标上游，境外 Actions 只负责定时和鉴权。

## 2. 调度与采集边界

`.github/workflows/collect-content.yml` 在 UTC `04:17 / 10:17 / 16:17 / 22:17` 启动，对应北京时间 `12:17 / 18:17 / 00:17 / 06:17`。每轮按最近正式截止点计算采集窗口并保留默认 12 小时重叠，以抵御 Actions 延迟和上游短暂失败。

当前作业顺序固定为：

1. 检出仓库与子模块，安装 Node/Python 锁定依赖并运行 Python collector 测试；
2. 运行 Vault 信息流采集、签名发送和可选处理触发；
3. 调用境内 `/api/internal/sic/snapshot`，由境内站刷新各类榜单快照；
4. 在境外运行 `scripts/collect-sic-overseas.ts`，生成 SiC 固定源包并提交 `/api/internal/sic/content`；
5. 无论成功失败都上传 `.collector-output`，保留 14 天；
6. 任一 SiC 接口返回 `ok != true`、HTTP 错误或脚本失败时，在保留另一条 SiC 任务结果后将作业标记失败。

SiC URL 或 `VAULT2077_SIC_COLLECTOR_SECRET` 缺失时，对应步骤当前会明确输出 `skipping` 并以成功状态退出。因此“工作流绿色”不能单独证明 SiC 已启用；上线验收必须检查两个 URL、一个密钥和实际响应。

采集器每轮遍历 `source-bundle.json` 的全部 active 信源：

- 只允许无凭据的公网 HTTPS 地址及安全 HTTPS 重定向；DNS 解析到内网、回环、链路本地或保留地址时拒绝请求。
- Horizon 适配器负责 RSS/Atom/JSON Feed、Hacker News、GitHub REST 与 OSS Insight；Lobsters 保留一个独立的结构化 JSON 小适配器。任何需要浏览器或 HTML 页面索引的连接器都不进入运行时。
- 单源默认最多取 20 条，单源失败只记入报告，不阻塞其他来源和已有批次发送。
- GitHub 趋势候选由境外补齐仓库元数据与 README 快照；境内 LLM 不需要访问境外仓库。
- 原始内容中的 HTML 转为可读文本；原始语言、标题、正文、作者、发布时间和原链保留，中文结果写入独立字段。
- 每包最多 200 条且不超过 1.75 MB；包体和 `batchId` 固定后，网络重试必须复用完全相同的正文。
- 每次运行保存包文件和 `report.json` 为 Actions artifact，保留 14 天。报告按逻辑来源记录 `success / partial / empty / failure`、抓取数、入包数、拒绝数、耗时和错误；`partial` 表示已经保留有效原文，但同一来源的某个辅助请求失败。

YouTube 和其他视频专属信源在注册表生成期删除；运行时若再次发现 YouTube 配置会直接失败。大陆来源平台被排除，但 X、GitHub 等国际平台上的中文内容不受语言过滤。

SiC 固定源使用另一套边界：

- 只读取 `config/sic-source-registry.json` 中 `status=approved` 的 27 个来源；每个来源只能属于论文、档案、课程、播客之一。
- 支持官方 RSS/Atom、sitemap、日期化索引、课程目录、YouTube 官方频道 Feed、官方 API 和播客 Feed；不做全站 diff，不临时筛选单条内容。
- 单来源最多保留 40 个候选，sitemap 最多检查 20 个原页，来源并发为 6；上游默认超时 20 秒、正文上限 8 MiB。
- 跳转后的最终 origin 必须仍在该来源的 `homeUrl`、`endpoint` 或显式 `allowedRedirectOrigins` 集合中。当前只有 Anthropic Release Notes 显式允许跳转到 `https://platform.claude.com`。
- Latent Space 只有带音频 enclosure/media 的条目进入播客组；课程、论文和日期索引均使用来源专属路径规则，避免把导航页当更新。
- 境外包保留每个来源的 `success / empty / failure` 报告。单源失败不阻断其他来源；全部来源失败时脚本失败，不提交空包。
- 境内只对每个来源的最新条目尝试一次受限原页读取，为中文编辑提供正文材料；读取失败回退到境外包中的摘要，绝不阻止入库。也就是说，境外承担完整发现，境内仍需要对获批原页具备可选的 HTTPS 出口。

## 3. 配置

### 3.1 GitHub Actions Secrets

| Secret | 必需 | 说明 |
| --- | --- | --- |
| `VAULT2077_DOMESTIC_INGEST_URL` | 是 | `https://<境内域名>/api/internal/content` |
| `VAULT2077_DOMESTIC_PROCESS_URL` | 建议 | `https://<境内域名>/api/internal/content/process`；不填则由 ingest URL 推导 |
| `VAULT2077_PIPELINE_SHARED_SECRET` | 是 | HMAC 与默认 Worker Bearer 密钥，至少 32 字节随机值 |
| `VAULT2077_GITHUB_READ_TOKEN` | 建议 | 只读公开仓库；不填时使用 `github.token` |
| `VAULT2077_SIC_COLLECTOR_SECRET` | SiC 必需 | 与境内站相同的独立 Bearer 密钥；缺失时两个 SiC 步骤会跳过 |
| `VAULT2077_SIC_SNAPSHOT_URL` | SiC 必需 | `https://<境内域名>/api/internal/sic/snapshot` |
| `VAULT2077_SIC_CONTENT_URL` | SiC 必需 | `https://<境内域名>/api/internal/sic/content` |

Actions 中不得配置 LLM、后台、数据库或用户数据密钥。

### 3.2 境内 VPS

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `VAULT2077_PIPELINE_SHARED_SECRET` | 是 | 必须与 Actions 完全一致 |
| `VAULT2077_PIPELINE_WORKER_SECRET` | 否 | 单独保护 Worker；为空时复用 shared secret |
| `VAULT2077_DATA_DIR` | 是 | 持久卷目录；保存批次队列和发布内容 |
| `VAULT2077_LLM_BASE_URL` | 上线处理时 | OpenAI 兼容 base URL，通常以 `/v1` 结尾 |
| `VAULT2077_LLM_API_KEY` | 上线处理时 | 境内模型密钥 |
| `VAULT2077_LLM_MODEL` | 上线处理时 | 模型名称 |
| `VAULT2077_LLM_TIMEOUT_MS` | 否 | 单次请求超时，默认 30000，限制 5000–120000 ms |
| `VAULT2077_SIC_COLLECTOR_SECRET` | SiC 必需 | 两个 SiC 内部接口的 Bearer 密钥；后端兼容回退到 shared secret，但正式工作流不会自动使用该回退 |
| `GITHUB_TOKEN` | 强烈建议 | 补齐上榜仓库当前 Star、README 和许可证；与 Actions 的 `VAULT2077_GITHUB_READ_TOKEN` 不是同一配置位置 |
| `VAULT2077_GHARCHIVE_BIGQUERY_PROJECT` | 24H/7D 榜必需 | 可查询 GH Archive 公共数据集的 Google Cloud 项目 ID |
| `VAULT2077_GHARCHIVE_BIGQUERY_ACCESS_TOKEN` | 24H/7D 榜必需 | 最小权限短期访问令牌 |
| `VAULT2077_SMITHERY_API_KEY` | MCP 必需 | MCP 优选/飙升榜必需；无 skills.sh OIDC 时也为 Skill 回退源 |
| `VERCEL_OIDC_TOKEN` | 条件必需 | Vercel 环境提供的短期 OIDC；用于 skills.sh 精选与累计采用量，不应在普通 VPS 长期伪造 |

LLM 三项目前可以保持空白。此时接收接口仍正常返回 `202` 并保存批次；处理接口返回 `503`、`code=MODEL_NOT_CONFIGURED` 和 `deferred=true`。日后填入三项配置后重新调用处理接口即可恢复，无需重新采集或发送。

境外采集器还接受 `VAULT2077_HORIZON_CONCURRENCY`（默认 24）控制逻辑来源并发；`VAULT2077_COLLECTOR_CONCURRENCY` 继续控制 HTTP 连接上限。GitHub 适配器应配置 `GITHUB_TOKEN`，否则本地或独立 runner 会触发公开 GitHub API 限流；仓库工作流默认回退到 `github.token`。

标准模型请求为：

```http
POST <VAULT2077_LLM_BASE_URL>/chat/completions
Authorization: Bearer <VAULT2077_LLM_API_KEY>
Content-Type: application/json
```

正文使用 `model`、`messages`、`temperature` 和 `response_format: {"type":"json_object"}`；读取 `choices[0].message.content` 中的 JSON。资讯采用有界批量处理，一次完成翻译、摘要和近 30 天事件归类；批内最多 6 条、约 48,000 输入字符，最多 4 个模型请求并发。每次模型调用失败自动重试一次。

SiC 内容编辑复用同一组 LLM 变量，但不进入 Vault 信息流 Worker：仅处理每个固定来源尚未拥有完整中文编辑字段的最新条目，每批最多 6 条。已保存的中文标题、一句话说明和摘要会按稳定条目 ID 复用；模型缺失或失败时保留原始内容，下一轮继续尝试。

### 3.3 境内网络出口矩阵

| 用途 | 境内站需要访问 |
| --- | --- |
| GitHub Trending | `raw.githubusercontent.com` 的固定结构化镜像 |
| GitHub 24H/7D | `bigquery.googleapis.com` |
| 仓库详情 | `api.github.com` |
| Hugging Face 榜 | `huggingface.co/api/models` |
| OpenRouter 榜 | `openrouter.ai/api/v1/models?sort=top-weekly` |
| Skill | 有 OIDC 时 `skills.sh/api/v1`；否则 `api.smithery.ai` |
| MCP | `api.smithery.ai` |
| SiC 中文编辑增强 | 27 个获批来源的原始 HTTPS 页面，可失败降级 |
| LLM | `VAULT2077_LLM_BASE_URL` 对应的境内 OpenAI-compatible 服务 |

不需要为 SiC 配置 `OPENROUTER_API_KEY`。当前 OpenRouter 榜只保存官方 `top-weekly` 顺序，前台用名次表示，没有公开 Token 数值。

## 4. 接口契约

统一迁移入口 `POST /api/internal/acquisition` 已可接收 `AcquisitionBatch` v1。它复用下述 HMAC 请求头与签名输入，限制原始正文不超过 8 MB，验签和 Schema 通过后把不可变正文写入 `VAULT2077_DATA_DIR/acquisition-inbox` 并返回 `202`。同 ID、同正文重投返回重复状态；同 ID、不同正文返回 `409`。该入口目前尚未连接 Worker 或 GitHub Actions，不能替代以下兼容入口；部署时仍须保持单写实例。

境外发送：

- `X-Vault2077-Batch-Id`
- `X-Vault2077-Timestamp`：Unix 秒，允许前后 5 分钟
- `X-Vault2077-Signature: sha256=<base64url hmac>`

签名输入固定为：

```text
timestamp + "." + batchId + "." + sha256(exact_raw_body)
```

`POST /api/internal/content` 的主要状态：

- `202`：首次接收或尚未处理的重复包已持久化；
- `200`：同正文、同 ID 且已经处理成功的重复包；
- `400/413`：JSON、Schema、数量或字节限制错误；
- `401`：时间戳或签名无效；
- `409`：同一 `batchId` 被用于不同正文；
- `503`：无法安全持久化。

`POST /api/internal/content/process` 使用 `Authorization: Bearer <worker-secret>`，正文为 `{"maxBatches":20}`。它领取队列、处理内容并原子更新发布库。管理员登录后访问 `GET /api/admin/content` 可同时查看发布状态和 `pending / processing / succeeded / failed` 队列计数。

### 4.1 SiC 固定源包与内容接口

`scripts/collect-sic-overseas.ts` 生成版本 1 JSON：

```json
{
  "version": 1,
  "collectedAt": "ISO-8601",
  "items": [],
  "reports": []
}
```

`POST /api/internal/sic/content` 使用 `Authorization: Bearer <VAULT2077_SIC_COLLECTOR_SECRET>` 和 `Content-Type: application/json`。生产环境不接受无正文的“由境内直接抓取”调用。接收端执行：

- 请求体最多 8 MiB；
- `collectedAt` 与当前时间差不得超过 48 小时；
- 最多 2,000 个 items、200 个 reports；
- `sourceId` 必须仍为当前 approved 来源，URL 必须为该来源允许的 HTTPS origin；
- 服务端重新计算条目 ID并覆盖来源名称、发布者和内容组，不信任包内同名字段；
- 缺失的来源报告按 failure 补齐。

状态码：

- `200`：所有来源均为 success/empty，`ok=true`；
- `207`：至少一个来源 failure，但成功来源已合并落盘，`ok=false, partial=true`；
- `400`：生产环境缺包；
- `401`：Bearer 无效；
- `429`：同一来源 IP 每小时超过 8 次；
- `503`：包格式、时效、数量、落盘或全部处理失败。

### 4.2 SiC 快照接口

`POST /api/internal/sic/snapshot` 使用同一 Bearer，不需要正文。它并发刷新模型、GitHub 和扩展生态三组采集器；每组内部又按 provider/board 独立保存成功结果。

- `200`：全部逻辑榜刷新成功，`ok=true`；
- `207`：任一逻辑榜失败，成功榜仍落盘，`ok=false, partial=true`；
- `401`：Bearer 无效；
- `429`：同一来源 IP 每小时超过 12 次；
- `503`：三组采集器全部失败或无法安全落盘。

不要只检查 HTTP 是否为 2xx；`207` 必须视为告警。仓库工作流会同时检查响应 JSON 的 `.ok`。

两个 SiC 端点的 IP 限速当前保存在单个 Node.js 进程内，重启会清零，也不在多副本间共享。它是误调用保护，不是完整的边缘防护；生产反向代理仍应限制请求体、覆盖可信 `X-Forwarded-For`、隐藏 Authorization/正文日志并只允许预期的 Actions 出口或受控调用方。

## 5. 数据与恢复

持久卷中至少包含：

- `inbound-batches/*.json`：不可变原始正文、哈希、状态、尝试次数和最近错误；
- `content-store.json`：事件、资讯、隔离记录、批次回执和发布版本。
- `sic-content-store.json`：SiC 固定来源更新、采集报告及中文编辑结果。
- `sic-snapshots.json`：Hugging Face 与 OpenRouter 独立 provider 快照，保留最近 31 个日桶；
- `sic-github-rankings.json`：Trending、24H、7D 独立 board 快照，保留最近 31 个日桶；
- `sic-extension-snapshots.json`：Skill 与 MCP 独立 provider 快照，使用 6 小时桶并保留最近 124 个桶。

备份以上全部内容及部署平台中的密钥配置。三个快照库支持从 v1 迁移到 v2；JSON 损坏不会被静默当成空库，页面只会让对应板块进入空状态并等待运维修复。恢复时：

1. 暂停 Actions 工作流；
2. 停止境内写进程并恢复同一 `VAULT2077_DATA_DIR`；
3. 恢复原 shared/worker secret 与 LLM 配置；
4. 启动单实例，调用 process 接口处理 `pending/failed`；
5. 手动调用一次 SiC snapshot 和 content，确认不是 `207`；
6. 检查 `/feed`、`/sic` 和 `/api/admin/content` 后恢复 Actions。

若 Actions 发送失败，从 artifact 取出对应 `vault2077-*.json`，使用原 `batchId`、原正文和同一签名算法重放。不要编辑包文件；修改后会成为冲突正文。若模型供应商暂时不可用，只需等待恢复后重调 process，不能删除入站批次。

当前文件适配器适合单实例 MVP：同一持久目录只能由一个境内 Node.js 实例写入。多副本部署前必须迁移到具有事务、唯一约束和队列租约的数据库/消息队列适配器。

SiC 公开读取的保鲜规则：

- GitHub 三个 board、Hugging Face、OpenRouter、Skill、MCP 分别按自己的最后成功时间判断，超过 36 小时即只让对应榜单进入空状态；
- 固定源内容按整个内容库的 `updatedAt` 判断，超过 36 小时四组全部进入空状态；
- 单来源 failure/empty 不删除该来源的上次成功内容；本轮 success 的来源以新结果替换。页面最终仍只取每个来源最新一条、每组最多 6 条；
- Hugging Face 只有找到距离当前约 7 天、允许前后 1 天的参考快照才计算周增量；
- Skill/MCP 飙升榜只有找到距离当前约 24 小时、允许前后 8 小时的参考桶才显示正增量。

## 6. 验证命令

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:pipeline:e2e
npm.cmd run test:acquisition:e2e
python -m unittest discover -s collector/tests -p "test_*.py"
git submodule update --init --recursive
python -m collector.horizon_raw_export
node --conditions=react-server --experimental-strip-types scripts/collect-sic-overseas.ts .collector-output/sic-content.json
npm.cmd run content:validate-packets -- .collector-output
```

`test:pipeline:e2e` 会在随机本地端口启动生产构建和模拟 OpenAI 兼容服务，验证错误签名返回 `401`、正确包返回 `202`、Worker 完成事件沉淀，以及 `/feed` 公开发布。它使用临时目录并在结束后清理。

`test:acquisition:e2e` 会启动生产构建，向统一入口发送真实 HMAC 请求，验证首次 `202`、同正文重复识别、同 ID 异文 `409` 和原始签名正文落盘。该演练同样使用临时目录并自动清理。

## 7. 来源变更

`source-registry.json` 是审计登记，`source-bundle.json` 是运行子集。禁止直接手改 bundle。来源变化依次执行：

```powershell
npm.cmd run sources:extract
npm.cmd run sources:classify
npm.cmd run sources:audit
npm.cmd run sources:bundle
```

分类人工覆盖只修改 `config/source-classification-overrides.json`。来源增减必须经过人工同意；健康失败不会自动删除来源。低置信度资讯可以进入资讯瀑布，但不计入事件晋升所需的独立发布者数量。

SiC 使用独立的 `config/sic-source-registry.json`。变更时必须同时复核来源身份、内容组、固定 HTTPS 入口、允许跳转 origin、完整接入边界和采用理由；只有状态改为 `approved` 才会进入下一轮采集。SiC 目前没有自动生成该注册表的命令，也不得用 Vault 信息流的 bundle 工具覆盖它。变更后至少运行 Node 测试、类型检查、一次境外脚本和一次生产接口手动触发。
