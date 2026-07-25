---
type: traceability
status: active
updated: 2026-07-24
---

# Vault2077 实现追踪矩阵

本文件只记录实现状态和证据，不定义需求。状态为 `done`、`partial`、`missing`、`blocked-input`；规范以[文档权威索引](README.md)为准。

## 1. 当前结论

项目已达到“可构建、可演示、主要频道可浏览、统一采集主体可测试”的 MVP 预览阶段，但尚未达到生产上线条件。最大缺口集中在统一批次合同和事务边界、生产数据库、Frontier GitHub 快速路径的可靠回退、后台安全、真实业务输入和运维证据。

| 领域 | 状态 | 证据/缺口 |
| --- | --- | --- |
| 首页与四频道公开页面 | done | Next.js 路由、响应式样式和演示数据存在 |
| Vault 事件/资讯阅读 | partial | 基础阅读链路已实现；证据引用、继续加载和正式纠错入口未闭环 |
| OPC 三入口业务模型 | partial | 三入口和枚举已实现；基础设施名称、排除项、修订与授权字段未完全对齐规范 |
| SiC 内容组 | partial | 页面与存储已实现；“档案”仍以“文档”呈现 |
| SiC 平台原生榜 | partial | 原生顺序已实现；过期结果会消失，尚无 last-success/stale 语义 |
| 边境计划页面与本地业务 | partial | 基础流程存在；赛季状态机、可恢复结算和预览边界未完成 |
| 无账户公开产品 | done | 公开用户无需站内账户 |
| 运营后台 | partial | 共享密码后台存在；安全硬化和完整审计证据不足 |
| 统一采集批次/inbox | partial | 签名、幂等、租约和 E2E 已实现；字段、状态、修订白名单、重试上限和隔离语义未完全符合规范 |
| 四采集通道 | partial | `collect-content.yml` 已支持四通道；rankings 仍为每日两次而非每小时 |
| 单一境外采集 workflow | done | `collect-content.yml` 是唯一境外采集 workflow；`frontier-hourly.yml` 仅触发境内业务刷新 |
| Frontier GitHub 混合访问 | partial | 境内交互核验和观察已直读 GitHub；短超时、限流、缓存/条件请求、审计与异步回退未闭环 |
| Frontier 境内业务调度 | partial | 当前由 `frontier-hourly.yml` 触发；生产应迁移到受监控的境内 scheduler |
| 生产持久化 | missing | 文件适配器已统一支持 `VAULT2077_DATA_DIR`，但 PostgreSQL、事务和迁移仍未实现 |
| 生产降级语义 | partial | Vault 已在生产返回显式 degraded 空态；SiC 等读取端仍需统一错误语义 |
| `/pipeline` 访问边界 | done | 生产环境要求后台会话且页面 noindex；开发环境保留本地诊断能力 |

## 2. 频道明细

### Vault 信息流

| 要求 | 状态 | 说明 |
| --- | --- | --- |
| 事件簿、资讯瀑布、详情、来源回链 | partial | 公开路由存在；详情判断尚未强制证据引用 |
| information/roadside 分流 | done | 数据模型和页面支持 |
| 偶数小时 `:05` / `:55` 调度 | done | `collect-content.yml` 已配置 |
| 生产不回退演示数据 | done | Vault 读取失败返回显式 degraded 空态，演示数据仅用于非生产 |
| 默认 20 条与继续加载 | missing | 当前存在固定截取或一次性渲染，尚无 URL 驱动的继续加载 |
| 匿名纠错闭环 | missing | 当前仅有占位说明页 |
| 事件晋升质量证据 | partial | 规则与测试存在，仍需真实数据验收 |

### OPC

| 要求 | 状态 | 说明 |
| --- | --- | --- |
| 基础设施/专项服务/游骑兵三入口 | done | 首页及三类独立路由已实现 |
| 五个专项专业领域 | done | 枚举、筛选和页面已实现 |
| 十项基础设施 | partial | 数量已实现，但名称仍是旧模型；价格和材料为后续业务输入 |
| 十种游骑兵身份 | done | 枚举和入口已实现；档案字段另列 |
| 责任主体和联系入口区分 | partial | 需要页面文案与真实资料验收 |
| 服务排除项、修订与历史可追溯 | missing | 当前静态模型缺独立 exclusion/effectiveAt/修订历史 |
| 游骑兵验证、授权与撤销状态 | missing | 当前预览数据缺验证日期、更新时间与授权状态 |

### SiC

| 要求 | 状态 | 说明 |
| --- | --- | --- |
| 四内容组 | partial | 组数与页面已实现，但 `documents` 尚未迁移为规范中的“档案” |
| GitHub/HF/OpenRouter/skills.sh 原生榜 | partial | 平台顺序已实现；缺 last-success、stale 和错误可见性 |
| 无 MCP、无本地增量 | done | 当前规范与榜单模块一致，旧 SiC 写接口已删除 |
| 每日 `07:25`/`19:25` 内容通道 | done | workflow 已配置 |
| 来源目录计数与状态一致 | done | `scripts/check-docs.mjs` 自动核对 30=29 active+1 retired |
| 来源目录字段级一致 | partial | 仍需把全部字段和运行时 bundle 纳入同一校验 |

### 边境计划

| 要求 | 状态 | 说明 |
| --- | --- | --- |
| 报名、挑战、基线、排名、奖品、结算 | partial | 模块存在；赛季状态未持久化，结算不是可恢复状态机 |
| 每小时公开仓库观察 | partial | 境内 tick 可按参赛名单读取；生产 scheduler、失败分类和上一成功快照需完整验证 |
| 交互式 GitHub 快速路径 | partial | 仓库和挑战核验已直读；缺短超时、条件请求、完整限流与审计 |
| 异步公开任务回退 | missing | 需要通过 rankings 通道回传失败仓库的签名 observation |
| 邮箱不离境 | partial | 当前 GitHub 请求只需仓库信息；仍需生产数据库和任务 payload 测试证明 |
| Frontier 生产预览边界 | missing | 页面仍以 CURRENT/LIVE 呈现文件适配器数据 |
| 真实赛季/奖金/条款 | blocked-input | 等待业务与法律输入 |

## 3. 工程与安全

| 要求 | 状态 | 下一证据 |
| --- | --- | --- |
| PostgreSQL 生产写模型 | missing | schema、迁移、事务与适配器测试 |
| Redis 可选 | done | 当前未强制引入 |
| 对象存储可选 | done | 当前未强制引入 |
| 来源修订白名单 | missing | 有 revision 字段，但接收端不拒绝未知修订 |
| inbox 幂等与重放防护 | done | 接收代码与 E2E 存在 |
| 批次写入原子性 | partial | 不支持的记录已在写入前拒绝；跨存储写入仍无事务，运行失败可能半提交 |
| worker 重试/隔离 | missing | failed 可被持续 claim；缺 retryable/quarantined、最大重试和死信闭环 |
| 后台密码强哈希 | missing | 需采用 Argon2id/scrypt 等并迁移 |
| 后台限速、锁定、空闲过期 | missing | 仅有进程内限速和固定时长会话 |
| 不可变审计日志 | missing | 未发现审计日志实现 |
| 安全响应头 | partial | 已有 HSTS、nosniff、frame/referrer/permissions；CSP 尚未完成 |
| 可信代理与分布式限速 | missing | 当前限速依赖进程内状态和请求头 |
| 备份恢复演练 | missing | 无日期、RPO/RTO 和恢复结果 |
| 监控告警 | missing | 无生产通道新鲜度/积压/任务延迟证据 |

## 4. 2026-07-24 审计证据

- `npm run docs:check`：通过（44 份项目 Markdown 均有元数据、索引登记和有效本地链接）。
- `npm run typecheck`：通过。
- Node 单元测试：91 个通过。
- Python 采集器测试：17 个通过（`collector/tests`）。
- `npm run build`：通过。
- 内容管线 E2E：通过。
- 统一采集 inbox E2E：通过。

测试通过说明现有实现没有已知回归，不代表生产门禁已满足。

## 5. 推荐推进顺序

1. 先冻结并迁移统一批次合同：四 lane、修订白名单、失败分类、最大重试、隔离与事务性。
2. 硬化 Frontier 境内 GitHub 快速路径并实现异步公开任务回退；把 `frontier-hourly.yml` 迁移为境内受监控 scheduler，保留服务端直连。
3. 完成 PostgreSQL schema、迁移、事务、备份恢复，并把文件适配器降为明确的本地预览。
4. 完成后台密码、会话、锁定、二次确认、不可变审计、分布式限速和 CSP。
5. 按冻结名称迁移 OPC，补齐 SiC stale 状态、Vault 引用/分页/纠错和 Frontier 状态机。
6. 输入真实运营、奖金和法律资料，建立生产监控与四宽度/无障碍验收证据。
