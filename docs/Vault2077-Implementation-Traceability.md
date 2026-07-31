---
type: traceability
status: active
updated: 2026-07-31
---

# Vault2077 实现追踪矩阵

本文件只记录实现状态和证据，不定义需求。状态为 `done`、`partial`、`missing`、`blocked-input`；规范以[文档权威索引](README.md)为准。

## 1. 当前结论

项目已达到“统一采集与处理可测试、跨境投递和境内消费已解耦、生产适配代码可部署、主要 P0 安全边界已实现”的准上线工程阶段，但尚未达到生产签字条件。最大缺口已经从代码骨架转为阿里云目标环境的 RDS 备份恢复、模型容量与切换、systemd/监控接入、浏览器验收以及 OPC、赛季和法律业务输入。

| 领域 | 状态 | 证据/缺口 |
| --- | --- | --- |
| 首页与四频道公开页面 | done | Next.js 路由、响应式样式和正式页面实现存在 |
| Vault 事件/资讯阅读 | partial | 基础阅读、事件引用、相关资讯 20 条分批加载和匿名纠错提交/关闭已实现；纠错后的拆分/移入/隐藏操作仍未闭环 |
| OPC 三入口业务模型 | partial | 三入口、七项基础设施、十四项专项服务、六领域和十类顾问身份已实现；21 项服务已有完整页面字段、人民币公开价和无账号下单入口，真实支付宝收款资料仍待输入；默认游骑兵名录为空，不展示样例档案 |
| SiC 内容组 | partial | 页面与存储已实现；档案来源已迁入 SiC 单一路由并由 sic 通道采集，公开术语仍需完成“文档”到“档案”的迁移 |
| SiC 平台原生榜 | done | 原生顺序、last-success 保留和 stale 明示已实现 |
| 边境计划页面与本地业务 | partial | 基础流程、重复已验证报名恢复、结算租约/失败/重试/幂等、后台逐赛季奖励草稿/发布和预览边界已实现；当前赛季真实奖励仍待运营发布 |
| 无账户公开产品 | done | 公开用户无需站内账户 |
| 运营后台 | partial | 独立管理来源、阿里云 IDaaS OIDC 授权码/state/nonce/PKCE/ID Token 校验、唯一 owner 白名单、PostgreSQL 可撤销会话、同源写请求防护、五分钟再认证、不可变审计、结构化 OPC 服务目录编辑和订单状态处理已实现；真实 IDaaS/防火墙绕过测试与内容纠错实际编辑动作仍待目标环境验收 |
| 统一采集批次/inbox | done | 四 lane、带 key ID 的签名密钥环、幂等、revision 白名单、规范状态、租约、重试上限、quarantine、文件 E2E 与 PostgreSQL `SKIP LOCKED` adapter 已实现 |
| 四采集通道 | done | `collect-content.yml` 支持四通道，rankings 每小时 `:35`；旧境外投递/处理实现已删除，Node 模块独占签名和有界重试 |
| 境内采集 worker | partial | 独立 CLI、每五分钟 systemd service/timer、积压健康阈值和限速清理已实现；待阿里云目标服务器安装、退出码告警和积压恢复演练 |
| 上线基线与初始化回填 | partial | 显式 bootstrap、SiC 每 approved 来源最近一条、Vault 30 天窗口、有界批次和同合同幂等已实现；尚未在生产修订执行并保存逐来源证据 |
| 频道编辑配置 | partial | 双配置路由、独立并发/批量/预算、主/受控备用与生产拒绝旧全局配置已实现；目标提供方容量、长积压和切换审计演练未完成 |
| 内容单一主路由 | done | 机构新闻与 SiC 深度档案使用独立注册表；bundle 不再包含 documents；HN/Lobsters 外链晋升链路已删除 |
| 单一境外采集 workflow | done | `.github/workflows` 只保留 `collect-content.yml`，四 lane 共用一个合同和接收端；workflow 不持有 worker/LLM 密钥、不调用境内处理 |
| Frontier GitHub 混合访问 | partial | 境内短超时、有界并发、持久化限速、缓存/条件请求、审计和公开任务回退代码已闭环；尚缺生产凭证与真实故障演练 |
| Frontier 境内业务调度 | partial | `npm run frontier:tick`、审计和 systemd service/timer 模板已实现；待目标服务器安装 timer、接入告警并保存运行证据 |
| 生产持久化 | partial | PostgreSQL state adapter、专用 inbox/安全表、版本迁移和生产 fail-closed 已实现；真实数据库迁移、自动备份、恢复和容量证据未完成 |
| 生产降级语义 | partial | Vault 已在生产返回显式 degraded 空态；SiC 等读取端仍需统一错误语义 |
| `/pipeline` 访问边界 | done | 生产环境要求后台会话且页面 noindex；开发环境保留本地诊断能力 |

## 2. 频道明细

### Vault 信息流

| 要求 | 状态 | 说明 |
| --- | --- | --- |
| 事件簿、资讯瀑布、详情、来源回链 | partial | 公开路由存在；详情判断尚未强制证据引用 |
| 双语正文结构与安全渲染 | done | v2 兼容 `contentFormat`、采集/处理换行保真、受控 Markdown 渲染、旧压平记录迁移与回归测试已实现 |
| information/roadside 分流 | done | 数据模型和页面支持 |
| 偶数小时 `:05` / `:55` 调度 | done | `collect-content.yml` 已配置 |
| 生产不回退演示数据 | done | Vault 读取失败返回显式 degraded 空态，演示数据仅用于非生产 |
| 默认 20 条与继续加载 | done | 事件详情默认 20 条，URL 驱动每次继续加载 20 条直到全部可访问 |
| 匿名纠错闭环 | partial | 三类报告、原始依据、可选加密邮箱、持久化限速和后台审计关闭已实现；实际拆分/移入/隐藏编辑操作待补 |
| 事件晋升质量证据 | partial | 规则与测试存在，仍需真实数据验收 |

### OPC

| 要求 | 状态 | 说明 |
| --- | --- | --- |
| 基础设施/专项服务/游骑兵三入口 | done | 首页及三类独立路由已实现 |
| 六个专项专业领域 | done | 枚举、筛选和页面已实现 |
| 七项基础设施与十四项专项服务公开 SKU | done | 受控分类、范围、材料、成果、验收、人民币公开价、费用说明、周期、边界和稳定路由已实现；项目可经后台草稿增删改和排序 |
| 十种游骑兵身份 | done | 枚举和入口已实现；档案字段另列 |
| 责任主体和联系入口区分 | partial | 需要页面文案与真实资料验收 |
| 服务目录后台 | done | 独立 OPC 管理接口支持草稿、新增、移除、排序、结构化字段编辑、完整性校验、乐观并发、二次确认、发布快照和审计；自动资讯与榜单不进入该接口 |
| 无账号订单与支付宝付款 | done | 公开接口执行同源/请求头/大小/蜜罐/限速及请求内容绑定的幂等校验，先保存服务修订、价格快照和加密联系方式，再用支付宝官方 SDK 生成网页收银台链接；异步通知执行 RSA2 验签与应用、商户、订单、金额核对后自动入账，后台支持主动交易查询和审计 |
| 服务排除项、修订与历史可追溯 | partial | 转交边界、修订字段和完整发布快照已实现；真实生效日期及咨询记录绑定修订仍待业务流程 |
| 游骑兵验证、授权与撤销状态 | partial | 公开资质、联系状态与发布占位拦截已实现；独立核验日期、资料更新时间和撤销动作仍待补 |

### SiC

| 要求 | 状态 | 说明 |
| --- | --- | --- |
| 四内容组 | partial | 组数与页面已实现，但 `documents` 尚未迁移为规范中的“档案” |
| OpenGithubs/HF/OpenRouter 榜单 | done | GitHub 榜经官方 REST API 获取第三方聚合结果；提供方顺序、last-success 保留和 stale 明示已实现 |
| 无 MCP、无本地增量 | done | 当前规范与榜单模块一致，旧 SiC 写接口已删除 |
| 每日 `07:25`/`19:25` 内容通道 | done | workflow 已配置 |
| 来源目录计数与状态一致 | done | SiC 注册表为 34=26 approved+7 retired+1 pending_review；目录与注册表同次修订 |
| 来源目录字段级一致 | partial | 来源 bundle 已执行新闻/档案去重；仍需把全部字段和 institutional news 注册表纳入文档自动校验 |

### 边境计划

| 要求 | 状态 | 说明 |
| --- | --- | --- |
| 报名、挑战、基线、排名、奖品、结算 | done | 模块存在；重复报名可恢复当前状态，结算具持久租约、失败、重试与幂等结果 |
| 每小时公开仓库观察 | partial | 境内 tick 可按参赛名单读取并由 systemd timer 调度；目标服务器安装、告警和真实失败演练待完成 |
| 交互式 GitHub 快速路径 | partial | 仓库和挑战核验已直读并具短超时、条件请求、持久化限流与审计；待生产凭证验收 |
| 异步公开任务回退 | done | 境内只输出公开仓库任务，rankings 通道回传签名 observation，成功后移除任务 |
| 邮箱不离境 | partial | 当前 GitHub 请求只需仓库信息；仍需生产数据库和任务 payload 测试证明 |
| Frontier 生产预览边界 | done | 文件模式显式显示 LOCAL PREVIEW；生产缺 PostgreSQL 时拒绝写入 |
| 真实赛季/奖金/条款 | blocked-input | 等待业务与法律输入 |

## 3. 工程与安全

| 要求 | 状态 | 下一证据 |
| --- | --- | --- |
| PostgreSQL 生产写模型 | partial | 5 个版本迁移、事务聚合、专用 inbox/审计/限速/后台会话表及 PostgreSQL 17 集成测试已实现；缺目标数据库备份恢复与容量测试 |
| Redis 可选 | done | 当前未强制引入 |
| 对象存储可选 | done | 当前未强制引入 |
| 来源修订白名单 | done | 接收端只接受部署修订和显式灰度重叠修订 |
| inbox 幂等与重放防护 | done | 接收代码与 E2E 存在 |
| 批次写入原子性 | partial | 不支持的记录已在写入前拒绝；跨存储写入仍无事务，运行失败可能半提交 |
| worker 重试/隔离 | done | retryable/quarantined、最大尝试、租约恢复和隔离测试已实现 |
| 后台身份入口 | done | 生产只接受独立管理来源上的网关签名 JWT，并校验签名、发行者、受众、时效和 owner 邮箱白名单；本地 Argon2id/开发密码适配器在生产关闭 |
| 后台会话与再认证 | done | PostgreSQL 只保存不透明令牌摘要，支持单会话撤销、30 分钟空闲和 4 小时绝对过期；OPC 发布和奖品状态操作要求最近 5 分钟再认证 |
| 不可变审计日志 | done | 后台写操作、登录与 GitHub 请求写入 append-only 审计表；更新/删除由触发器拒绝 |
| 安全响应头 | done | 逐请求 nonce CSP、HSTS、nosniff、frame/referrer/permissions、COOP/CORP 已配置；生产脚本策略不再使用 `unsafe-inline` |
| 可信代理与分布式限速 | partial | Nginx 覆盖转发头、精确开放 ingest、边缘限速，应用使用 PostgreSQL 限速，内存 fallback 有界且可清理；需按目标代理完成伪造头和压力验收 |
| 密钥轮换 | partial | 管线签名和敏感数据均已实现带活动 key ID 的有限密钥环，新旧重叠测试通过；待目标秘密管理、旧数据重加密/保留策略和轮换演练 |
| 静态质量门 | done | Next 16 使用 ESLint CLI，Python 使用 Ruff；两者进入 GitHub workflow，vendored Horizon 排除 |
| 备份恢复演练 | missing | 无日期、RPO/RTO 和恢复结果 |
| 监控告警 | partial | 受保护 `/api/internal/health` 已覆盖迁移、inbox、内容新鲜度、榜单 stale、Frontier 回退和编辑配置；待接入目标告警平台并演练 |
| 编辑处理容量隔离 | partial | Vault/SiC 独立并发、批大小、预算和备用配置已实现，PostgreSQL 支持并发 worker；尚缺目标容量和持续积压演练 |
| 生产配置门禁 | done | `npm run deploy:check` 额外拒绝旧单值数据/管线密钥和未使用标准可信代理模板，同时拒绝预览存储、弱/示例密钥、非 TLS 数据库、本地后台密码、同主机入口、不完整 OIDC、非唯一管理员邮箱和旧共享模型 |
| 生产依赖安全 | done | Next.js 固定为 16.2.11，PostCSS/Sharp 覆盖到修复版本；`npm audit --omit=dev --audit-level=high` 为 0 漏洞 |

## 4. 2026-07-29 工程证据

- `npm run docs:check`：通过（以本轮最终命令输出为准）。
- `npm run typecheck`：通过。
- `npm run lint` 与 `ruff check collector`：通过。
- Node 单元测试：181 个通过（含可靠投递、订单幂等冲突、密钥轮换、有界限流和代理部署策略）。
- Python 采集器测试：16 个通过（`collector/tests`）。
- `npm run build`：通过。
- 内容管线 E2E：通过。
- 统一采集 inbox E2E：通过。
- 历史真实批次全量回放：50 批、1150 条记录、899 个来源报告全部处理，队列无 retryable/quarantine。
- 本地后台 HTTP 闭环：开发密码登录、受保护 OPC 读取、五分钟再认证、退出和退出后 401 均通过。
- PostgreSQL 17：迁移首次应用/幂等重跑通过；20 并发聚合更新、`SKIP LOCKED`、重试隔离、持久化限速与不可变审计集成测试通过。
- 公开来源联网审计：486 个端点完成复验；311 个通道至少有可用端点，29 个通道明确需鉴权，短超时下其余结果保留为 blocked/timeout/error，不伪装为可用。联网健康已与批准/生产路由分离到 `config/source-health.json`；瞬时失败不再自动改写 bundle，只有人工 `--promote true` 才更新准入基线，且 0 可用或传输失败率超过 80% 时拒绝覆盖。
- 浏览器验收：核心页面在 360/768/1280/1440 检查标题、主区、表单与横向溢出；修复首页/OPC 的 360px 溢出后复验通过，跳到正文焦点、移动菜单、纠错表单标签与后台登录保护可用。

测试通过说明现有实现没有已知回归，不代表生产门禁已满足。

## 5. 推荐推进顺序

1. 在阿里云同 VPC RDS 执行迁移，启用 TLS、自动/日志备份、PITR、删除保护和监控，完成隔离恢复演练。
2. 安装 Nginx、Web、采集 worker 与 Frontier timer，接入退出码/新鲜度/积压告警，验证公网内部路由、伪造头和服务器 IP 绕过失败。
3. 演练 GitHub 投递瞬时失败、schedule 漏跑补跑、管线签名轮换和敏感数据密钥轮换。
4. 用目标 Vault/SiC 提供方做容量、预算耗尽、主备切换和持续积压测试，保存版本审计证据。
5. 补齐 OPC 修订/授权字段、Vault 纠错后的实际编辑操作和 SiC “档案”术语迁移。
6. 输入真实运营、奖金和法律资料，完成四宽度、键盘、焦点、动态 CSP 性能和溢出验收。
