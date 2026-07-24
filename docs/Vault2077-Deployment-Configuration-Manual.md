# Vault2077 配置与部署手册

> 状态：运行手册，持续完善。最后按代码复核：2026-07-24。本文记录已经落地的配置、部署、验证和恢复方式，不修改产品规则。当前版本覆盖边境计划、Vault 信息管道与 SiC 学院。
>
> 2026-07-24 起，Vault、SiC 和各类榜单改用统一 AcquisitionBatch 主链。本文第 12.3–12.7 节中的旧分散端点仅保留迁移背景；当前部署、Secrets 和验收步骤以 [统一信息管线运行手册](Vault2077-Unified-Acquisition-Runbook.md) 为准。

## 1. 手册范围与原则

本手册面向同时维护境内站与境外站的部署人员。边境计划包含公开页面、报名和验证、排行榜、奖品捐献、管理后台、定时更新与季度结算；Vault 信息流与 SiC 学院共享境外 GitHub Actions 的定时唤醒，但在国内站分别保存各自的数据。

当前 MVP 必须遵守三条部署原则：

1. 边境计划只能有一个权威写入后端，不能让境内外两个实例分别保存报名和奖池数据。
2. 所有能够读取或写入边境计划数据的服务必须使用同一把数据密钥，并访问同一份持久化数据。
3. 每小时任务只允许调用权威后端；重复调用不会重复结算，但不得把任务分别指向两个独立实例。

## 2. 当前实现及其限制

### 2.1 数据存储

当前边境计划将以下数据写入部署实例工作目录下的 `data/mvp-store.json`：

- 报名记录与 GitHub 验证结果；
- 加密后的报名 Email；
- Star 快照与赛季排行榜；
- 奖品捐献、确认和分配状态；
- 赛季结算结果与冠军仓库记录。

文件写入采用临时文件替换，能够防止单个 Node.js 进程内的并发写入破坏文件，但它不支持多实例、多容器或境内外两套文件之间的同步。

因此，以下部署方式当前不可用：

- 两个地区各运行一个可以报名和捐献的独立实例；
- 多个无状态 Serverless 实例分别写本地文件；
- 容器重启后会丢失工作目录、但没有挂载持久卷的部署；
- 多个进程或副本同时挂载并写同一个普通 JSON 文件。

### 2.2 外部依赖

权威后端必须能够稳定访问：

- `api.github.com`：读取仓库公开状态、Fork、归档、许可证和 Star；
- `raw.githubusercontent.com`：读取参赛仓库中的挑战文件；
- GitHub Actions 的入站 HTTPS 请求：触发每小时更新和季度结算。

`GITHUB_TOKEN` 只能改善 GitHub API 配额，不能解决网络不可达问题。

## 3. 境内外推荐拓扑

### 3.1 当前 MVP 推荐方案

选择一个能够稳定访问 GitHub、拥有持久磁盘的 Node.js 服务作为“边境计划权威后端”。考虑到 GitHub 连通性，通常优先选择境外节点，但最终位置必须结合个人信息跨境要求决定。

```text
境外站 ───────────────┐
                     ├─ /api/frontier/* ──→ 边境计划权威后端
境内站（反向代理）─────┘                         │
                                                ├─ data/mvp-store.json
GitHub Actions ── POST /api/internal/frontier/tick
                                                └─ GitHub API / Raw Content
```

具体要求：

- 权威后端负责报名、验证、排行榜、捐献、后台审核和结算的全部读写。
- 境内站如需展示同一套边境计划，必须把相关 API 反向代理到权威后端，不能使用自己的本地数据文件。
- 浏览器页面继续使用同源 `/api/...` 地址，由站点网关完成转发，避免在前端暴露新的跨域配置。
- `/api/admin/frontier`、管理员登录接口和 Cookie 应位于同一个权威域名或经过保持 Cookie 属性的同源代理。
- GitHub Actions 的任务地址只指向权威后端。

### 3.2 不能直接双活的原因

如果境内外站点各自运行当前代码并接受写入，将立即出现：

- 同一仓库可以在两边重复报名；
- 两边的 Star 基线、排行榜和奖池不同；
- 一个赛季可能产生两个冠军和两次抽奖；
- Email 加密数据和人工确认状态无法可靠合并。

在改为共享数据库并实现事务、唯一约束和跨区部署策略之前，边境计划不得启用双写或双活。

### 3.3 必须先确认的数据位置

报名和捐献都会收集 Email。若权威后端部署在境外，Email 和赛事记录会在境外保存；若这些数据必须留在境内，则不能直接采用境外权威存储方案。

该决定需要在生产开放报名前由业务、隐私和基础设施负责人确认。当前代码尚未实现“境内保存个人信息、境外只代理 GitHub 查询”的拆分架构。

## 4. 配置归属总表

| 配置项 | 权威网站后端 | 境内展示/代理站 | GitHub Actions | 是否敏感 | 作用 |
| --- | --- | --- | --- | --- | --- |
| `VAULT2077_DATA_KEY` | 必需 | 不应配置，除非直接访问同一数据 | 不需要 | 是 | 加密和解密报名、捐献 Email |
| `GITHUB_TOKEN` | 强烈建议 | 不需要 | 不需要 | 是 | 提高边境计划验证及 SiC GitHub 榜项目补全的 API 请求额度 |
| `VAULT2077_FRONTIER_TICK_SECRET` | 必需 | 不需要 | 必需，且与后端相同 | 是 | 验证每小时任务请求 |
| `VAULT2077_FRONTIER_TICK_URL` | 不需要 | 不需要 | 必需 | 否 | 权威后端定时任务完整地址 |
| `VAULT2077_ADMIN_PASSWORD` | 必需 | 不需要 | 不需要 | 是 | 登录共享管理后台 |
| `VAULT2077_ADMIN_SESSION_SECRET` | 必需 | 不需要 | 不需要 | 是 | 签署八小时管理员会话 |
| `VAULT2077_PIPELINE_SHARED_SECRET` | 境内内容站必需 | 境内站承担内容接收时必需 | 必需 | 是 | 验证境外公开内容批次 HMAC |
| `VAULT2077_PIPELINE_WORKER_SECRET` | 境内内容站建议 | 同左 | 不需要 | 是 | 单独保护境内内容 Worker |
| `VAULT2077_DATA_DIR` | 必需 | 同左 | 不需要 | 否 | 持久保存边境计划、Vault 信息流与 SiC 快照/固定源内容 |
| `VAULT2077_LLM_BASE_URL` / `API_KEY` / `MODEL` | 内容处理时必需 | 同左 | 不需要 | Key 是 | 标准 OpenAI Chat Completions 配置 |
| `VAULT2077_DOMESTIC_INGEST_URL` / `PROCESS_URL` | 不需要 | 不需要 | 必需 | URL 否 | Actions 向境内站发送并触发处理 |
| `VAULT2077_SIC_COLLECTOR_SECRET` | SiC 境内站必需 | 同左 | 必需，且与境内站相同 | 是 | 保护 SiC 快照与固定源采集内部接口 |
| `VAULT2077_SIC_SNAPSHOT_URL` / `CONTENT_URL` | 不需要 | 不需要 | 必需 | URL 否 | Actions 调用 SiC 模型/排行榜快照与固定源采集接口 |
| `VAULT2077_SMITHERY_API_KEY` | SiC 境内站必需 | 同左 | 不需要 | 是 | MCP 榜必需；无 skills.sh OIDC 时同时提供 Skill 回退数据 |
| `VERCEL_OIDC_TOKEN` | Vercel 上的 SiC 站按请求提供 | 同左 | 不需要 | 是 | 可用时从 skills.sh 读取精选集合和累计采用量；24H 飙升仍由本地快照差计算 |
| `VAULT2077_GHARCHIVE_BIGQUERY_PROJECT` | GitHub 24H/7D 榜必需 | 同左 | 不需要 | 否 | 查询 GH Archive 公共数据集的 Google Cloud 项目 ID |
| `VAULT2077_GHARCHIVE_BIGQUERY_ACCESS_TOKEN` | GitHub 24H/7D 榜必需 | 同左 | 不需要 | 是 | 仅用于 GH Archive 的新增 Star 聚合 |

“不应配置”表示该节点不应承担边境计划数据读写。如果未来改用共享数据库，应重新审查此表。

## 5. 环境变量说明

### 5.1 `VAULT2077_DATA_KEY`

- 位置：权威网站后端的生产环境变量。
- 要求：使用密码生成器产生的长随机值，不要使用人类可猜测的口令。
- 作用：服务端通过 AES-256-GCM 加密报名者和捐献者 Email。
- 关键风险：丢失后，已有 Email 无法恢复；直接更换后，旧数据无法解密。
- 运维要求：保存到部署平台 Secret Manager，并另做受控离线备份。轮换前必须先实现数据重加密迁移。

### 5.2 `GITHUB_TOKEN`

- 位置：权威网站后端。
- 要求：使用权限最小化、能够读取公开仓库信息的 Token；不需要仓库写权限。
- 作用：提高 GitHub API 配额，降低报名验证和每小时更新遇到限流的概率。
- 注意：挑战文件通过 `raw.githubusercontent.com` 读取，Token 不能替代网络连通性。

### 5.3 `VAULT2077_FRONTIER_TICK_SECRET`

- 位置：权威网站后端和 GitHub Actions Secrets，两处值必须完全一致。
- 要求：至少使用 32 字节随机值，不与管理员密码、数据密钥或其他模块密钥复用。
- 作用：GitHub Actions 通过请求头 `x-vault2077-frontier-secret` 携带该值；后端使用常量时间比较验证请求。
- 失败表现：缺失或不一致时，任务返回 HTTP `401`；生产后端缺少配置时会拒绝执行。

### 5.4 `VAULT2077_FRONTIER_TICK_URL`

- 位置：GitHub Actions Secrets。
- 格式：`https://<权威域名>/api/internal/frontier/tick`。
- 作用：告诉每小时工作流应调用哪个生产实例。
- 要求：必须使用 HTTPS，不能指向预览部署、境内外镜像中的非权威实例或会随发布改变的临时域名。

该 URL 本身通常不敏感，但放入 Actions Secrets 可以统一管理环境差异。

### 5.5 管理后台变量

`VAULT2077_ADMIN_PASSWORD` 是共享管理后台密码；`VAULT2077_ADMIN_SESSION_SECRET` 用于签署管理员 Cookie。两者只配置在权威后端，必须分别生成，不能复用。

管理员会话有效期为八小时，生产 Cookie 使用 `Secure`、`HttpOnly` 和 `SameSite=Strict`。如果境内站通过跨域方式直接访问境外后台，这些 Cookie 不会自动成为跨域会话，因此应使用权威域名登录后台或采用同源代理。

### 5.6 SiC 学院变量

- `VAULT2077_SIC_COLLECTOR_SECRET`：配置在 SiC 境内站与 GitHub Actions Secrets；使用独立的至少 32 字节随机值，不得复用 Vault 信息管道或边境计划密钥。两个 SiC 内部接口均以 Bearer 方式验证该值。
- `VAULT2077_SIC_SNAPSHOT_URL`：仅配置在 Actions，格式为 `https://<境内域名>/api/internal/sic/snapshot`。
- `VAULT2077_SIC_CONTENT_URL`：仅配置在 Actions，格式为 `https://<境内域名>/api/internal/sic/content`。
- `VAULT2077_SMITHERY_API_KEY`：配置在 SiC 境内站，用于 Smithery 官方 Skill 与 MCP Registry API。该密钥不得下发到浏览器；非 Vercel 部署同时依赖它生成 Skill 与 MCP 榜，Vercel 部署仍依赖它生成 MCP 榜。
- `VERCEL_OIDC_TOKEN`：由支持 Vercel OIDC 的部署环境按请求提供时，服务端优先调用 skills.sh 官方精选和全量累计采用量接口。普通 VPS 不伪造或长期保存该令牌，直接使用 Smithery Skill 回退路径。skills.sh Trending 不是 24H 数值来源，飙升榜始终由相隔约 24 小时的累计量快照差计算。
- `VAULT2077_GHARCHIVE_BIGQUERY_PROJECT` 与 `VAULT2077_GHARCHIVE_BIGQUERY_ACCESS_TOKEN`：仅配置在 SiC 境内站。前者是可查询 GH Archive 公共数据集的项目 ID；后者为最小权限、可轮换的短期访问令牌。当前应用不会自行用 service account 换取或刷新 access token，部署平台必须负责到期前轮换并监视 `401/403`；否则 24H/7D 会进入部分失败。两者缺失时，GitHub 24H/7D 新增 Star 榜必须保持空状态，不得使用综合热度、旧演示数据或零值替代。
- SiC 固定来源的中文标题、一句话说明和内容摘要复用 `VAULT2077_LLM_BASE_URL`、`VAULT2077_LLM_API_KEY` 与 `VAULT2077_LLM_MODEL`。三项缺失时原始更新仍会采集，但双语编辑等待后续已配置的采集任务补齐；不得因此丢弃来源更新。

`GITHUB_TOKEN` 仍为强烈建议项：SiC 用它补齐上榜仓库的 Star、README 与许可证；没有它时系统可运行，但更容易触及 GitHub 公共 API 限流。

## 6. GitHub Actions 配置

工作流文件为 `.github/workflows/frontier-hourly.yml`，默认在每个 UTC 小时的第 7 分钟执行，也支持在 GitHub 页面手动触发。

在 GitHub 仓库中进入：

`Settings → Secrets and variables → Actions → New repository secret`

添加：

```text
VAULT2077_FRONTIER_TICK_URL=https://<权威域名>/api/internal/frontier/tick
VAULT2077_FRONTIER_TICK_SECRET=<与权威后端完全相同的随机密钥>
```

不要把真实值写入 `.env.example`、工作流文件、Issue、构建日志或聊天记录。

任务执行顺序为：

1. 更新当前北京时区自然季度的 Star 快照；
2. 查找已经到达结算时间但尚未结算的赛季；
3. 重新检查仓库机器资格和挑战文件；
4. 固化最终榜单、冠军和随机奖品分配；
5. 保存结算结果。已有结算记录时不会再次抽奖。

## 7. 权威后端部署步骤

### 7.1 部署前

- 确认运行时为 Node.js，内部定时接口不能部署为 Edge Runtime。
- 确认实例能够访问 GitHub API 和 Raw Content 域名。
- 挂载持久卷，使 `<应用工作目录>/data` 在重新部署、重启和故障切换后仍然存在。
- 确认只有一个 Node.js 实例或一个写入副本访问该 JSON 文件。
- 配置本手册第 4 节列出的后端环境变量。
- 记录权威域名、数据保存地区、负责人和备份位置。

### 7.2 首次发布

1. 部署应用但暂不开放报名入口。
2. 检查 `data/mvp-store.json` 已在持久卷中创建，且 Web 进程具有读写权限。
3. 通过页面完成一条测试报名，验证挑战文件流程。
4. 提交一件测试奖品，在后台完成确认。
5. 手动触发一次 GitHub Actions 工作流。
6. 检查工作流返回成功，排行榜显示新的更新时间。
7. 删除测试数据或使用专门的非生产赛季环境重新部署正式数据文件。
8. 完成备份后再开放正式报名。

### 7.3 境内站接入

境内站的网关至少需要将以下路径转发到权威后端：

```text
/api/frontier/*
/api/internal/frontier/tick   # 通常仅 GitHub Actions 使用，不建议经公共镜像转发
/api/admin/frontier
/api/admin/login
/api/admin/logout
```

若后台只允许在权威域名访问，则境内站不需要代理 `/api/admin/*`。代理必须保留请求方法、正文、Cookie、状态码和 `Content-Type`，并设置合理的超时。不得缓存报名、验证、捐献、管理和定时任务响应。

## 8. 数据、密钥与备份

### 8.1 必须备份的内容

- `data/mvp-store.json`；
- Vault 信息流的 `inbound-batches/` 与 `content-store.json`，以及 SiC 的 `sic-snapshots.json`、`sic-github-rankings.json`、`sic-extension-snapshots.json`、`sic-content-store.json`；
- `VAULT2077_DATA_KEY` 的受控离线副本；
- GitHub Actions 与部署平台的配置清单，但不在普通文档中记录真实 Secret；
- 每次季度结算后的只读导出。

### 8.2 建议的 MVP 备份策略

- 数据文件至少每日备份一次；
- 赛季结算前立即备份一次；
- 结算成功后立即生成不可变备份；
- 保留最近一次可恢复版本和历次季度结算版本；
- 每季度至少演练一次“恢复数据文件 + 使用原数据密钥解密后台 Email”；每次统一发布前演练一次 SiC 四个数据文件恢复后重新快照。

### 8.3 恢复顺序

1. 暂停 GitHub Actions 定时任务和公开写入。
2. 停止权威后端写进程。
3. 恢复 `data/mvp-store.json` 和原 `VAULT2077_DATA_KEY`。
4. 启动单一实例并检查后台能够读取报名和捐献 Email。
5. 检查最近赛季是否已经结算，避免将旧备份恢复到已完成结算之前。
6. 手动执行一次每小时任务，确认无重复抽奖后恢复公开入口。

## 9. 上线验证

### 9.1 自动任务鉴权

不携带密钥调用接口，应返回 `401`：

```bash
curl --request POST https://<权威域名>/api/internal/frontier/tick
```

在受控终端中携带正确密钥，应返回 `200`：

```bash
curl --request POST \
  --header "x-vault2077-frontier-secret: <临时从 Secret Manager 注入>" \
  https://<权威域名>/api/internal/frontier/tick
```

不要把真实密钥直接写入可被 Shell 历史、CI 日志或工单保存的命令。

### 9.2 功能验收

- 报名只能接受公开、非 Fork、未归档且有可识别许可证的仓库；
- 验证文件在报名时能够通过检查；
- 排行榜在工作流运行后更新时间发生变化；
- 净新增 Star 可以为负数，不被改成零；
- 捐献者 Email 不出现在公开接口或页面；
- 未经后台确认的奖品不进入公开奖池；
- 结算时再次检查挑战文件，删除文件的项目失去资格；
- 同一赛季重复执行结算不会产生第二套抽奖结果；
- 境内外访问看到同一报名数量、同一排行榜和同一奖池。

## 10. 常见故障

| 现象 | 优先检查 | 处理方向 |
| --- | --- | --- |
| Actions 返回 `401` | 两端 `TICK_SECRET` 是否一致 | 重新同步 Secret，避免尾随空格或换行 |
| Actions 返回 `503` | 后端日志、数据文件权限、GitHub 连通性 | 修复持久卷或外部网络后重新手动触发 |
| 报名提示 GitHub 暂不可用 | `api.github.com`、`raw.githubusercontent.com` 连通性与配额 | 检查出口网络和 `GITHUB_TOKEN` |
| 部署后报名全部消失 | `data` 是否位于临时文件系统 | 恢复备份并挂载持久卷 |
| 境内外排行榜不同 | 是否出现两套本地 `mvp-store.json` | 立即停止其中一侧写入，确定唯一权威数据 |
| 后台 Email 无法解密 | `VAULT2077_DATA_KEY` 是否改变 | 恢复原密钥，不要用新密钥覆盖数据 |
| 排行榜不再更新 | Actions 是否启用、URL 是否仍指向当前权威域名 | 修复 URL 后手动触发并核对更新时间 |
| 季末未结算 | 北京时间边界、Actions 执行记录和 GitHub 检查失败 | 保持原数据，排障后重跑同一幂等任务 |

## 11. 边境计划上线检查清单

- [ ] 已确定唯一权威后端和数据所在地区。
- [ ] 已确认 Email 的保存地区符合当前隐私和合规要求。
- [ ] `data` 使用持久卷，且只有一个写入实例。
- [ ] `VAULT2077_DATA_KEY` 已配置并完成离线备份。
- [ ] `GITHUB_TOKEN` 权限最小化且 GitHub 两个域名连通。
- [ ] 两个管理员变量分别生成并配置。
- [ ] `TICK_SECRET` 在后端与 GitHub Actions 中完全一致。
- [ ] `TICK_URL` 指向权威生产域名，不指向预览或镜像实例。
- [ ] 无密钥调用定时接口返回 `401`。
- [ ] 手动 Actions 运行成功且排行榜更新时间改变。
- [ ] 境内外站点读取同一套排名和奖池。
- [ ] 报名、捐献、后台确认和测试赛季结算完成全链路演练。
- [ ] 数据文件、数据密钥和季度结果备份均可恢复。

## 12. Vault 信息管道与 SiC 学院部署

### 12.1 境内 VPS 安装与启动

境内内容站与境外 GitHub Actions 是两个独立部署单元。境内 VPS 运行 Next.js 网站、Vault 接收接口/队列 Worker/LLM 调用、SiC 固定源包接收与编辑增强，以及 SiC 排行榜快照；不运行境外的完整来源发现脚本。生产环境统一建议使用 Node.js 22 LTS、单个写入实例和持久化磁盘。

在境内 VPS 执行：

```bash
git clone <网站仓库地址> /srv/vault2077
cd /srv/vault2077
npm ci
npm run build
install -d -m 750 /var/lib/vault2077/data
```

将生产变量写入仅 root 可读的 `/etc/vault2077/content.env`，不要提交到仓库：

```text
NODE_ENV=production
VAULT2077_DATA_DIR=/var/lib/vault2077/data
VAULT2077_PIPELINE_SHARED_SECRET=<至少 32 字节随机值>
VAULT2077_PIPELINE_WORKER_SECRET=<可选的另一随机值>
VAULT2077_SIC_COLLECTOR_SECRET=<至少 32 字节的独立随机值>
GITHUB_TOKEN=<建议配置的公开仓库只读 Token>
VAULT2077_GHARCHIVE_BIGQUERY_PROJECT=<启用 24H/7D 榜时必填>
VAULT2077_GHARCHIVE_BIGQUERY_ACCESS_TOKEN=<启用 24H/7D 榜时必填>
VAULT2077_SMITHERY_API_KEY=<启用 MCP 与非 Vercel Skill 榜时必填>
VAULT2077_LLM_BASE_URL=
VAULT2077_LLM_API_KEY=
VAULT2077_LLM_MODEL=
VAULT2077_LLM_TIMEOUT_MS=30000
```

启动命令为 `npm run start -- -p 3000`。建议交给 systemd 或部署平台托管，并配置自动重启；无论使用何种托管方式，都必须保证同一 `VAULT2077_DATA_DIR` 由单个写入实例独占。反向代理只需将 HTTPS 请求转发至该实例，不能缓存内部接口：

```text
POST /api/internal/content          ← GitHub Actions，必须保留请求体和 X-Vault2077-* 请求头
POST /api/internal/content/process  ← Worker 触发，必须保留 Authorization 请求头
POST /api/internal/sic/snapshot     ← GitHub Actions，必须保留 Authorization 请求头
POST /api/internal/sic/content      ← GitHub Actions，必须保留 Authorization 请求头
GET  /api/admin/content             ← 登录后台后查看队列与发布状态
GET  /feed
GET  /sic
```

防火墙只开放 HTTPS；内部处理接口仍必须依赖 Bearer 密钥，不能仅依赖来源 IP。完成部署后先检查 `https://<域名>/feed` 能正常返回，再继续配置 Actions。

最小 systemd 单实例示例：

```ini
[Unit]
Description=Vault2077
After=network-online.target

[Service]
Type=simple
User=vault2077
Group=vault2077
WorkingDirectory=/srv/vault2077
EnvironmentFile=/etc/vault2077/content.env
ExecStart=/usr/bin/npm run start -- -p 3000
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ReadWritePaths=/var/lib/vault2077/data

[Install]
WantedBy=multi-user.target
```

`/etc/vault2077/content.env` 应为 `root:vault2077`、权限 `0640`；数据目录应为 `vault2077:vault2077`、权限 `0750`。反向代理对普通页面使用常规超时，对 `/api/internal/content/process`、`/api/internal/sic/content` 和 `/api/internal/sic/snapshot` 建议提供至少 300 秒 upstream read timeout，因为内容编辑和多个独立上游请求在当前实现中位于同步 HTTP 生命周期内。SiC content 的代理请求体上限至少设为 10 MiB，以容纳应用层允许的 8 MiB 包和协议开销；不得记录 Authorization 头或请求正文。代理应覆盖而不是盲目信任客户端传入的 `X-Forwarded-For`，否则当前按 IP 的内存限速可被伪造。不要把这些内部路由部署到短执行时限的 Edge Runtime。

### 12.2 境内内容站配置

境内站必须是拥有持久磁盘的单写实例。把 `VAULT2077_DATA_DIR` 指向持久卷，并配置：

```text
VAULT2077_PIPELINE_SHARED_SECRET=<至少 32 字节随机值>
VAULT2077_PIPELINE_WORKER_SECRET=<可选的另一随机值>
VAULT2077_DATA_DIR=<持久卷绝对路径>
VAULT2077_LLM_BASE_URL=
VAULT2077_LLM_API_KEY=
  VAULT2077_LLM_MODEL=
  VAULT2077_SIC_COLLECTOR_SECRET=<至少 32 字节的独立随机值>
  GITHUB_TOKEN=<建议配置>
  VAULT2077_GHARCHIVE_BIGQUERY_PROJECT=
  VAULT2077_GHARCHIVE_BIGQUERY_ACCESS_TOKEN=
  VAULT2077_SMITHERY_API_KEY=
```

LLM 三项可以先留空。此时 `/api/internal/content` 仍会验签、校验和保存批次；`/api/internal/content/process` 返回可恢复的 `MODEL_NOT_CONFIGURED`。选择境内供应商后按标准 OpenAI `/chat/completions` 格式填写三项并重启，再触发 process 即可消化队列。

持久卷需同时备份 `inbound-batches/`、`content-store.json`、`sic-snapshots.json`、`sic-github-rankings.json`、`sic-extension-snapshots.json` 与 `sic-content-store.json`。这些文件体系不得由多实例同时写入。管理员登录后可通过 `/api/admin/content` 检查 Vault 内容版本、数量、隔离数量和队列状态。

SiC 榜单由境内接口直接访问上游，因此境内出口至少要允许：

```text
raw.githubusercontent.com
api.github.com
bigquery.googleapis.com
huggingface.co
openrouter.ai
api.smithery.ai
skills.sh                 # 仅使用 Vercel OIDC 时
27 个获批固定来源的原始 HTTPS origin
<VAULT2077_LLM_BASE_URL 的 origin>
```

固定来源的完整发现发生在境外；境内仅对每个来源的最新条目尝试一次受限原页读取，为中文编辑补充正文材料。该请求失败时自动使用境外包摘要，不阻断落盘，因此原页出口是“增强依赖”而不是内容接收的硬依赖。`OPENROUTER_API_KEY` 不是当前部署变量；OpenRouter 只使用公开 `top-weekly` 顺序。

非 Vercel VPS 不应手工写入长期 `VERCEL_OIDC_TOKEN`。它需要 `VAULT2077_SMITHERY_API_KEY` 同时承担 Skill 回退和 MCP 主数据。Vercel 部署即使获得 OIDC，也仍需 Smithery 密钥生成 MCP 榜。

### 12.3 境外 GitHub Actions

工作流为 `.github/workflows/collect-content.yml`，每日按北京时间 06:17、12:17、18:17、00:17 运行，也支持手动触发。它固定使用 Node.js 22、Python 3.12、`npm ci` 和锁定的 Python requirements。Actions Secrets 配置：

```text
VAULT2077_DOMESTIC_INGEST_URL=https://<境内域名>/api/internal/content
VAULT2077_DOMESTIC_PROCESS_URL=https://<境内域名>/api/internal/content/process
VAULT2077_PIPELINE_SHARED_SECRET=<与境内完全相同>
VAULT2077_GITHUB_READ_TOKEN=<可选的只读 Token>
VAULT2077_SIC_COLLECTOR_SECRET=<与境内 SiC 配置完全相同>
VAULT2077_SIC_SNAPSHOT_URL=https://<境内域名>/api/internal/sic/snapshot
VAULT2077_SIC_CONTENT_URL=https://<境内域名>/api/internal/sic/content
```

境外环境不配置 LLM、管理员、数据加密、BigQuery、Smithery、Vercel OIDC 或用户相关 Secret。采集器访问冻结 bundle 与 `config/sic-source-registry.json` 中的公网 HTTPS Feed/API，生成 `.collector-output/sic-content.json` 后提交给境内 SiC 内容接口；排行榜快照接口仍由同一调度唤醒，但所有榜单上游和凭据都位于境内站。整个境外单元需要 Python 与 Node，不需要浏览器、数据库和常驻进程，每轮原始包和报告保留为 14 天 artifact。

当前任务顺序为：Vault 信息流采集发送 → SiC snapshot → 境外生成 SiC 内容包并提交 → 总是上传 artifact → 汇总 SiC 部分失败。snapshot 与 content 步骤使用 `continue-on-error` 互相隔离，最后的汇总步骤仍会让作业失败，避免一个来源故障掩盖另一条已成功的数据。

如果任一 SiC URL 或 `VAULT2077_SIC_COLLECTOR_SECRET` 缺失，步骤会输出 `skipping` 并返回成功。因此上线检查必须在 Actions 日志中看到两个实际 HTTP 响应，不能只看绿色状态。

### 12.4 首次联调

1. 在境内站部署生产构建并确认持久卷可写。
2. 不带签名调用 ingest，确认返回 `401`。
3. 在本地运行 `npm.cmd run test:pipeline:e2e`，确认完整 HTTP 闭环。
4. 手动触发 `Collect public content`；确认 Actions artifact 中有 Vault 包、`report.json` 和 `sic-content.json`。
5. LLM 留空时确认入站队列增加且 process 返回 deferred；不得删除批次。
6. 配置模型三项并重启境内站，再次手动触发工作流或调用 process。
7. 确认 `/feed` 出现双语资讯，符合门槛的多源资讯形成事件。
8. 确认 `/api/internal/sic/content` 与 `/api/internal/sic/snapshot` 均返回 HTTP `200` 且 `ok: true`；HTTP `207` 表示成功数据已经落盘但存在部分失败，工作流必须失败并保留 artifact。扩展生态若返回密钥缺失，先补齐 `VAULT2077_SMITHERY_API_KEY`；GitHub 增长榜若失败，检查 BigQuery 项目、短期令牌、账单/配额和境内出口。
9. 打开 `/sic`：GitHub Trending、GitHub 增长、Hugging Face 与 OpenRouter 平台榜折叠为 Top 5、展开到 Top 10；Skill/MCP 折叠为 Top 10、展开到 Top 20；四个内容组各显示最多 6 条并回链原始页面。若 BigQuery 已配置，24H/7D 榜也应有结果。
10. 确认 `/api/admin/content` 的队列归零或只剩可解释的失败记录，然后执行持久卷备份。

### 12.5 日常运行与恢复

正常情况下不需要在 VPS 上手动运行采集脚本。每轮 Actions 会遍历当前 active bundle，生成不可变包，发送后尝试触发境内 process。若 LLM 仍为空，Actions 看到 `deferred=true` 属于预期状态，入站批次不得删除；配置 LLM 后手动调用一次：

```bash
curl --fail-with-body --request POST \
  --header "Authorization: Bearer <worker-secret>" \
  --header "Content-Type: application/json" \
  --data '{"maxBatches":20}' \
  https://<境内域名>/api/internal/content/process
```

如果境外发送失败，先在 Actions artifact 下载对应批次文件和报告，再检查境内 ingest 的 HTTPS、密钥和时间戳。恢复时使用原文件和原 `batchId` 重放，不能重新编辑 JSON。若境内 Worker 失败，查看 `/api/admin/content` 的 `failed` 数量和错误摘要；修复模型、磁盘或网络后再次调用 process，队列会从失败批次继续。

完整签名契约、恢复步骤、容量限制和验证命令见 [信息管道运行说明](Content-Pipeline-Operations.md)。

### 12.6 SiC 日常运行、数据积累与恢复

SiC 与 Vault 信息流共用 `Collect public content` 工作流的四次日内调度。每轮 Actions 先完成 Vault 信息流，再调用 `/api/internal/sic/snapshot`，随后在境外生成 SiC 固定来源 JSON 包并提交 `/api/internal/sic/content`；任一 SiC URL 或密钥未配置时，工作流会跳过对应调用。因此，只有整个项目统一部署时才配置这组三个 Actions Secret，不为 SiC 另建定时工作流。

SiC 的 Hugging Face 周榜通过每日累计下载快照计算 6–8 天差值。首次部署后须连续保留至少 7 天快照；参考快照不足时页面保持“数据积累中”是正确行为。OpenRouter 的公开周榜仅展示其官方排序，不能虚构周调用数。GitHub 官方 Trending 使用其固定结构化镜像的上游顺序；24H/7D 榜仅来自 GH Archive `WatchEvent` 新增 Star 聚合。

扩展生态与同一 `/api/internal/sic/snapshot` 调度一起刷新，不增加独立上线步骤。Skill 优选榜优先采用 skills.sh 官方精选；没有 Vercel OIDC 时使用 Smithery 已验证 Skill。MCP 使用 Smithery 已验证 Server。Skill 与 MCP 飙升榜都需要至少两个相隔约 24 小时的 6 小时快照桶，并使用累计量差值计算；积累不足时保持“正在积累首个 24 小时增量”，不得把 skills.sh `installs` 或 Smithery 累计采用量冒充 24H 增量。

- 单个固定来源失败：保留该来源的最后成功内容，下一轮重试，不清空其他来源。
- 所有固定来源失败：境外脚本在发送前失败，页面保留最后成功内容，artifact 仍由工作流的 `always()` 步骤保存。
- GH Archive 失败：只影响 GitHub 24H/7D 榜，不影响官方 Trending、模型榜或四个内容组。
- Hugging Face、OpenRouter、Trending、24H、7D、Skill、MCP 均有独立成功时间；任一项超过 36 小时未成功时，只清空该项，不用其他榜的本轮时间冒充成功。
- 固定源内容使用整个内容库的 36 小时门槛；只要一轮包成功入库就刷新该时间。失败或 empty 来源保留旧内容，成功来源以本轮结果替换，公开页仍只取每个来源最新一条。
- 恢复持久卷时，连同 `sic-snapshots.json`、`sic-github-rankings.json`、`sic-extension-snapshots.json`、`sic-content-store.json` 一起恢复；恢复后先手动触发一次工作流，再检查 `/sic`。
- 三个快照文件采用 v2 独立 provider/board 结构并兼容读取 v1；损坏 JSON 会让对应数据读取失败并在 `/sic` 降为空态，不会静默覆盖为空文件。应先隔离损坏文件、从备份恢复，再手动触发快照。
- 不得把采集状态、来源审批信息或内部错误输出给终端用户。

### 12.7 SiC 手工验证与重放

先在受控终端生成境外包：

```bash
node --conditions=react-server --experimental-strip-types \
  scripts/collect-sic-overseas.ts \
  .collector-output/sic-content.json
```

再使用临时注入的 Secret 提交。不要把 Secret 直接写进 Shell 历史：

```bash
curl --fail-with-body --request POST \
  --header "Authorization: Bearer ${VAULT2077_SIC_COLLECTOR_SECRET}" \
  --header "Content-Type: application/json" \
  --data-binary @.collector-output/sic-content.json \
  https://<境内域名>/api/internal/sic/content

curl --fail-with-body --request POST \
  --header "Authorization: Bearer ${VAULT2077_SIC_COLLECTOR_SECRET}" \
  https://<境内域名>/api/internal/sic/snapshot
```

验收必须同时检查 HTTP 状态和 JSON：`200 + ok=true` 才是全成功；`207 + partial=true` 需要查看 `reports` 或各 provider/board 的 `error`。SiC 包必须在采集后 48 小时内提交，且不得人工修改来源 ID、URL 或元数据；接收端会按当前 approved 注册表重新核对并重算条目 ID。

若要重放 artifact 中的 SiC 包，先确认它未超过 48 小时且来源注册表版本仍允许其中 URL。过期包不能强制写入；应重新运行境外脚本形成新包。SiC 包与 Vault 信息流 HMAC 批次不是同一契约，不使用 `X-Vault2077-Batch-Id` 或 HMAC 签名头。

### 12.8 SiC 告警与巡检

当前代码没有独立监控面板，唯一内建故障信号是 Actions 作业失败和两个接口的响应 JSON。生产交接必须在 GitHub Actions 或外部告警系统配置通知，至少覆盖：

| 信号 | 告警阈值 | 处理 |
| --- | --- | --- |
| `Collect public content` 失败 | 任意一次 | 查看 snapshot/content 分项响应与 artifact；不要因部分成功而直接重跑覆盖 |
| 调度缺失 | 8 小时没有成功运行 | 检查 Actions 是否被禁用、cron、账单和仓库权限 |
| SiC HTTP `207` | 任意一次 | 按 `models/github/extensions` 或来源 reports 定位；成功分项无需回滚 |
| SiC HTTP `401/429/503` | 任意一次 | 分别检查 Secret、调用频率、上游/磁盘/格式 |
| 任一 provider/board 最后成功时间 | 接近 30 小时预警，36 小时严重 | 在用户看到空榜前处理对应上游 |
| 固定源库 `updatedAt` | 接近 30 小时预警，36 小时严重 | 检查境外脚本、content URL、包时效和模型/原页增强 |
| BigQuery token 到期 | 到期前 24 小时 | 轮换 Secret、重启/重新部署境内服务并手动 snapshot |
| 持久卷空间 | 可用空间低于 20% | 清理非数据日志；不得随意删当前四个 SiC 数据文件 |

首次上线后的连续七天应每天记录：四次作业是否执行、每个来源最近状态、三组快照响应、四个数据文件大小、Hugging Face 参考快照是否形成、Skill/MCP 飙升是否 ready。七天运行证据完成前，SiC 只能标记“已部署待生产验证”。

### 12.9 SiC 备份、恢复与版本回滚

MVP 目标 RPO 为 24 小时、RTO 为 4 小时。每日备份整个 `VAULT2077_DATA_DIR`，每次发布前另做一次一致性备份；不能只备份公开内容而漏掉计算周榜/飙升榜所需的历史快照。

恢复顺序：

1. 暂停 `Collect public content`，确认没有手动 workflow 正在运行；
2. 停止唯一的 Next.js 写入实例；
3. 校验备份包含四个 SiC 文件，JSON 可解析，文件时间与备份清单一致；
4. 将当前数据目录整体保留为只读事故副本，再原子恢复备份目录；
5. 恢复 `vault2077:vault2077` 属主和 `0750/0640` 权限；
6. 启动单实例，先访问 `/sic`，再分别手动调用 snapshot 与 content；
7. 确认两接口 `200 + ok=true`、文件继续更新且页面无 500 后恢复 workflow。

三个快照文件的当前 Schema 为 v2，应用会读取并迁移旧 v1；`sic-content-store.json` 仍为 v1。向旧应用版本回滚前必须确认旧版本是否能读取已经写出的 v2 快照。无法确认时应同时回滚代码和发布前数据备份，不能只回滚代码后继续写新格式。任何损坏文件都先隔离并保存证据，再从备份恢复；不要用空文件覆盖后直接重新采集，因为这会丢失 Hugging Face 7 日和 Skill/MCP 24H 的参考历史。

## 13. 后续待完善章节

后续模块接入本手册时，分别补充配置归属、境内外拓扑、Secret、数据位置、发布步骤、监控、备份、恢复和验收：

- OPC 服务台；
- 全站域名、DNS、CDN、备案与证书；
- 正式数据库迁移和跨区容灾；
- 集中日志、自动新鲜度探针、密钥自动轮换与完整事故响应平台。

边境计划从本地 JSON 迁移到正式数据库时，必须同步更新本手册第 2、3、4、7、8 和 10 节。
