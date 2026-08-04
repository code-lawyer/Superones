---
type: runbook
status: active
updated: 2026-08-02
---

# Vault2077 部署配置手册

> 2026-07-31 更新：RDS 目标为 PostgreSQL 17、初始 20 GB；阿里云基础系列不支持日志备份/PITR，因此全功能首发应升级或迁移到支持日志备份的系列，推荐高可用多可用区。公开游骑兵头像使用同地域 OSS。付费 IDaaS 已取消，生产后台改为项目内原生 Passkey；上线前仍须完成真实设备、TLS、RDS 恢复、OSS 媒体链路与源站绕过验收。完整操作见 [阿里云中国大陆生产部署与迁移 Handoff](Vault2077-Aliyun-Mainland-Production-Handoff.md)。

## 1. 环境级别

- 本地开发：允许开发默认值与文件适配器。
- 预览：允许单写者文件适配器，但必须标识演示，禁止真实报名、自动发布、收款和结算。
- 生产：必须使用 PostgreSQL 和头像 OSS，并具备严格密钥、后台安全、备份和监控；缺项时关闭相关写能力。

## 2. 应用秘密

| 变量 | 生产要求 | 用途 |
| --- | --- | --- |
| `VAULT2077_DATA_KEYS` | 必需，JSON 对象，1-8 把 | 私人字段加密密钥环 |
| `VAULT2077_DATA_ACTIVE_KEY_ID` | 必需且存在于密钥环 | 新私人字段密文的 key ID |
| `VAULT2077_ADMIN_SESSION_SECRET` | 必需 | 后台会话令牌摘要密钥 |
| `VAULT2077_AUDIT_HASH_SECRET` | 必需 | 客户地址匿名化 |
| `VAULT2077_PIPELINE_SIGNING_KEYS` | 必需，JSON 对象，1-8 把 | 统一批次签名验签密钥环 |
| `VAULT2077_PIPELINE_ACTIVE_KEY_ID` | 必需且存在于密钥环 | 境外交付使用的 key ID |
| `VAULT2077_PIPELINE_WORKER_SECRET` | 必须独立 | 回环手动处理入口鉴权 |
| `VAULT2077_FRONTIER_TASKS_SECRET` | 必须独立，仅境内与 GitHub Actions 持有 | 读取已脱敏公开回退任务 |
| `GITHUB_TOKEN` | Frontier 生产必需 | 境内只读公开仓库快速路径 |
| `VAULT2077_FRONTIER_TICK_SECRET` | Frontier 生产必需 | 境内白天每两小时观察入口鉴权 |
| `VAULT2077_HEALTH_SECRET` | 必需 | 受保护健康/新鲜度检查鉴权 |

所有值由秘密管理注入；生产不得使用开发默认值。每个信任边界必须使用彼此独立的随机密钥，生产配置门禁会拒绝跨用途复用。门禁同时拒绝旧单值 `VAULT2077_DATA_KEY` 和 `VAULT2077_PIPELINE_SHARED_SECRET`。密钥环示例为 `{"2026-07":"至少32字节随机值"}`；环境文件中应整体引用 JSON，GitHub Secret 中保存不带外层引号的 JSON 正文。

生产后台身份配置：

| 变量 | 生产要求 | 用途 |
| --- | --- | --- |
| `VAULT2077_PUBLIC_ORIGIN` | 必需 | 公开站规范来源 |
| `VAULT2077_ICP_NUMBER` | 中国大陆正式公开站必需 | 页脚展示的真实 ICP 备案号 |
| `VAULT2077_OPERATOR_CREDIT_CODE` | 必需 | 营业执照统一社会信用代码 |
| `VAULT2077_OPERATOR_REGISTERED_ADDRESS` | 必需 | 营业执照登记住所 |
| `VAULT2077_OPERATOR_LEGAL_REPRESENTATIVE` | 必需 | 营业执照法定代表人 |
| `VAULT2077_OPERATOR_REGISTERED_CAPITAL` | 必需 | 营业执照登记注册资本 |
| `VAULT2077_LEGAL_CONTACT_EMAIL` | 必需 | 法律、隐私与知识产权请求 |
| `VAULT2077_CUSTOMER_SERVICE_EMAIL` | 可选 | 售后与投诉；缺省使用法律联系邮箱 |
| `VAULT2077_LEGAL_EFFECTIVE_DATE` | 必需，`YYYY-MM-DD` | 当前公开法律文件生效日期 |
| `VAULT2077_ADMIN_ORIGIN` | 必需且不同于公开来源 | 独立管理来源 |

本项目已确认公开来源为 `https://superones.top`、管理来源为 `https://admin.superones.top`、备案为 `沪ICP备2026003401号-1`。营业执照公示字段必须逐字复制，不能用品牌名或简称替代。

唯一 owner 固定为 `lanzhouda@163.com`，无需身份环境变量。WebAuthn RP ID 从 `VAULT2077_ADMIN_ORIGIN` 的主机名派生，生产必须使用 HTTPS。部署后通过 SSH 在应用目录执行 `npm run admin:passkey:enroll`，将十分钟一次性令牌仅交给 owner，在管理域名完成首次注册并立即离线保存首次显示的恢复码。紧急全量恢复使用 `npm run admin:passkey:enroll -- --revoke-existing`；该命令会撤销现有 Passkey 和全部后台会话。Node 端口不得对公网开放。详见 [ADR-0012](adr/0012-production-admin-access.md)。

Frontier 生产开放配置：

| 变量 | 生产要求 | 用途 |
| --- | --- | --- |
| `VAULT2077_FRONTIER_WRITES_ENABLED` | 必须明确为 `true` 或 `false` | 环境级紧急总开关；每赛季奖励由管理后台管理 |

生产只有在总开关为 `true` 且管理后台已发布当前赛季真实奖励时，才显示赛季为 LIVE 并接受写入。新赛季默认进入草稿状态；管理员保存奖励草稿并经重新认证发布后即可开放，不需要重新部署。未发布时页面显示准备中，表单不渲染，相关 API 返回 `503`。

## 3. 采集与投递

| 变量 | 位置 | 说明 |
| --- | --- | --- |
| `VAULT2077_DOMESTIC_ACQUISITION_URL` | 采集侧 | `/api/internal/acquisition` |
| `VAULT2077_FRONTIER_PUBLIC_TASKS_URL` | 采集侧 | `/api/internal/frontier/tasks`，只返回公开回退任务 |
| `VAULT2077_FRONTIER_TASKS_SECRET` | 两侧 | 独立 Bearer 密钥；不得复用签名、worker、后台或 LLM 密钥 |
| `VAULT2077_REQUIRE_DOMESTIC_DELIVERY` | 采集侧 | 生产计划任务必须为 `true` |
| `VAULT2077_SOURCE_BUNDLE_FILE` | 两侧 | 来源 bundle |
| `VAULT2077_SOURCE_BUNDLE_REVISION` | 境内 | 紧急显式修订 |
| `VAULT2077_ALLOWED_SOURCE_REVISIONS` | 境内 | 仅兼容旧 `AcquisitionBatch v1`：灰度期逗号分隔允许修订；`v2` 不要求来源 revision 完全一致 |
| `VAULT2077_ACQUISITION_RUN_MODE` | 采集侧 | `incremental` 或一次性 `bootstrap` |
| `VAULT2077_ACQUISITION_MAX_ATTEMPTS` | 境内 | 进入 quarantine 前的处理上限，默认 6 |
| `VAULT2077_ACQUISITION_RETRY_BASE_MS` | 境内 | worker 指数退避基数，默认 300000ms，单次最多 6 小时 |
| `VAULT2077_ACQUISITION_WORKER_MAX_BATCHES` | 境内 | 每次 timer 消费的批次数，默认 8 |
| `VAULT2077_ACQUISITION_MAX_RECORDS` | 两侧 | 单批硬上限 |
| `VAULT2077_SOURCE_TIMEOUT_SECONDS` | 采集侧 | 单来源超时 |
| `VAULT2077_MAX_UPSTREAM_BYTES` | 采集侧 | 上游响应上限 |
| `VAULT2077_DELIVERY_ATTEMPTS` | 采集侧 | 同一批次投递次数，生产默认 4 |
| `VAULT2077_DELIVERY_TIMEOUT_MS` | 采集侧 | 单次境内投递超时 |
| `VAULT2077_DELIVERY_RETRY_BASE_MS` | 采集侧 | 指数退避基数 |

已删除的旧 SiC 独立 URL 不得重新加入生产配置。

来源配置分工：

- `config/institutional-news-registry.json`：机构公告、新闻与重大发布；
- `config/sic-source-registry.json`：论文、深度档案、课程与播客；
- `config/source-bundle.json`：构建后的 information/roadside 运行清单。

构建必须排除两个注册表之间的生产重复；无法稳定分流的机构混合 Feed 保持待审。

## 4. 编辑处理

生产配置以逻辑频道编辑配置为边界，不把具体提供方硬编码为产品频道：

| 逻辑配置 | 内容范围 | 必需隔离项 |
| --- | --- | --- |
| `vault_editorial` | information、roadside、Vault 事件编排 | 主提供方、受控备用、队列、并发、超时、熔断 |
| `sic_editorial` | sic 内容 | 主提供方、受控备用、队列、并发、超时、熔断 |

两个配置都只在境内持有凭证，均须记录提供方、模型、提示和处理版本。生产基线为 `vault_editorial=300`、`sic_editorial=200`，也可显式设为 `unlimited`；无论哪种额度都必须使用有界并发、超时、连续三次瞬时失败后 60 秒熔断及 inbox 指数退避。DNS、TLS、HTTP、额度耗尽或无法取得成功 completion 属于编辑基础设施故障：整个数据库事务回滚，批次进入 `retryable`，不得被内容隔离误标为 `processed`。成功 completion 的正文不是约定 JSON/Schema 时先原地重试一次；批量响应仍无效则降级为逐条编辑，单条响应仍无效才隔离该条并允许同批合格记录发布。rankings 以及 Frontier 的确定性核验、观察、排名和结算不得使用编辑模型。

变量分别使用 `VAULT2077_VAULT_LLM_*` 与 `VAULT2077_SIC_LLM_*` 前缀；主配置包含 `BASE_URL`、`API_KEY`、`MODEL`、`TIMEOUT_MS`、`CONCURRENCY`、`BATCH_ITEMS`，可选的 `MAX_REQUESTS_PER_RUN` 缺省或设为 `unlimited` 表示无限额度。受控备用使用各自的 `FALLBACK_BASE_URL`、`FALLBACK_API_KEY`、`FALLBACK_MODEL` 与 `FALLBACK_TIMEOUT_MS`。旧 `VAULT2077_LLM_*` 只作为非生产迁移期本地预览兼容层，生产会拒绝只提供旧配置。

## 5. 数据

### 游骑兵公开头像 OSS

生产环境只把服务端处理后的公开头像写入 OSS；原图、授权材料、私人文件、采集包和数据库备份不得进入该 Bucket。本地开发省略以下 OSS 配置时，头像适配器写入 `data/ranger-media/` 并通过 `/media/*` 提供预览。

| 变量 | 生产要求 | 用途 |
| --- | --- | --- |
| `VAULT2077_RANGER_MEDIA_STORAGE` | 必须为 `oss` | 禁止生产退回 VPS 本地磁盘 |
| `VAULT2077_OSS_REGION` | 必需 | 与轻量服务器同地域的 OSS 地域标识 |
| `VAULT2077_OSS_BUCKET` | 必需 | 只保存处理后公开头像的独立 Bucket |
| `VAULT2077_OSS_ACCESS_KEY_ID` | 必需 | 应用最小权限 RAM AccessKey ID |
| `VAULT2077_OSS_ACCESS_KEY_SECRET` | 必需 | 只由服务器秘密管理注入的 RAM Secret |
| `VAULT2077_OSS_PUBLIC_ORIGIN` | 必需且为独立 HTTPS origin | 固定为 `https://media.superones.top` |
| `VAULT2077_OSS_INTERNAL` | 必须明确为 `true` 或 `false` | 同地域内网 Endpoint 可用时设为 `true` |
| `VAULT2077_RANGER_MEDIA_DIR` | 仅本地可选 | 覆盖本地头像预览目录，生产不使用 |

Bucket 匿名权限最多允许读取 `rangers/*`，绝不能允许匿名写入。应用 RAM 身份只授予该前缀的对象写入和元数据读取能力。上传上限为 5MB，Nginx 当前 `client_max_body_size 8m` 足以容纳 multipart 开销；如果修改任一侧上限，必须同步校验浏览器、应用路由和 Nginx。生产启用前验证 CNAME/TLS、320/800 WebP、发布前 HEAD、`Cache-Control: public, max-age=31536000, immutable`、替换、撤回、无引用对象清理和费用告警。

### OPC e 签宝电子签约

| 变量 | 说明 |
| --- | --- |
| `VAULT2077_OPC_ESIGN_ENABLED` | 必须与付款开关同时开启或关闭；合同模板、凭证和沙箱验收未完成时保持 `false` |
| `VAULT2077_OPC_ESIGN_PROVIDER` | 生产固定为 `esign`；`mock` 只供本地/自动化测试 |
| `VAULT2077_ESIGN_APP_ID` / `VAULT2077_ESIGN_APP_SECRET` | e 签宝应用身份和 HmacSHA256 密钥，只注入服务器 Secret |
| `VAULT2077_ESIGN_API_BASE_URL` | 沙箱 `https://smlopenapi.esign.cn`；生产固定 `https://openapi.esign.cn` |
| `VAULT2077_ESIGN_INDIVIDUAL_TEMPLATE_ID` | 自然人版服务协议模板 ID |
| `VAULT2077_ESIGN_ORGANIZATION_TEMPLATE_ID` | 法人/组织版服务协议模板 ID；首期只允许法定代表人本人签署 |
| `VAULT2077_ESIGN_TEMPLATE_VERSION` | 运营确认的模板版本/生效日期，用于订单审计快照 |
| `VAULT2077_ESIGN_PROVIDER_SEAL_ID` | 可选的平台方印章 ID；留空时使用 AppID 所属企业默认印章 |
| `VAULT2077_ESIGN_INDIVIDUAL_PROVIDER_SIGN_POSITION` | 自然人模板内平台方自动签章坐标 JSON：页码、X、Y |
| `VAULT2077_ESIGN_ORGANIZATION_PROVIDER_SIGN_POSITION` | 组织模板内平台方自动签章坐标 JSON：页码、X、Y |
| `VAULT2077_OPC_RESUME_TOKEN_KEYS` / `VAULT2077_OPC_RESUME_TOKEN_ACTIVE_KEY_ID` | 独立、可轮换的订单恢复令牌密钥环；不得与数据加密、会话、支付或 OSS 密钥复用 |
| `VAULT2077_OPC_CONTRACT_ARCHIVE_STORAGE` | 生产固定为 `oss`；本地默认 `local` |
| `VAULT2077_OPC_CONTRACT_OSS_REGION` / `VAULT2077_OPC_CONTRACT_OSS_BUCKET` | 专用私有合同 Bucket；不得与公开头像 Bucket 相同 |
| `VAULT2077_OPC_CONTRACT_OSS_ACCESS_KEY_ID` / `VAULT2077_OPC_CONTRACT_OSS_ACCESS_KEY_SECRET` | 只允许合同前缀 Put/Get 的独立最小权限 RAM 凭证 |
| `VAULT2077_OPC_CONTRACT_OSS_INTERNAL` | ECS 同地域内网可用时设为 `true` |
| `VAULT2077_OPC_CONTRACT_RETENTION_YEARS` | 生产固定为 `10` |
| `VAULT2077_OPC_CONTRACT_RETENTION_LOCKED` | 只有完成 Bucket 10 年保留锁/WORM 配置及写入、读取、禁止提前删除演练后才能设为 `true` |

模板后续可在 e 签宝后台上传，不阻塞代码开发，但上线前必须按 `docs/research/opc-esign-integration-operator-checklist.md` 使用稳定控件名、用官方拖章工具确认平台方签章坐标，并回填两个模板 ID、版本和两组坐标。项目先调用 `/v3/files/create-by-doc-template` 生成合同，再调用 `/v3/sign-flow/create-by-file` 发起流程；流程 ID 立即绑定到订单后才调用 `/v3/sign-flow/{signFlowId}/sign-url` 获取免登录托管页面，避免取链接失败导致重复创建合同。客户在托管页面手动签署，AppID 所属运营主体随后使用默认或指定印章自动签署；发起方省略 `signFlowInitiator`，由 e 签宝按 AppID 所属企业确定。回调执行 HmacSHA256 验签并按事件摘要幂等记录信号，订单返回页或受保护后台必须再调用 `/v3/sign-flow/{signFlowId}/detail` 主动核验双方及签署区；随后下载最终 PDF、调用 `/v3/files/{fileId}/verify` 验签、计算 SHA-256，并将 PDF 与清单写入专用私有合同 Bucket。只有全部成功才从待签署进入待付款；撤销 `3`、过期 `5`、拒签 `7` 或归档失败均不得生成付款链接。

专用合同 Bucket 必须关闭公共读和浏览器直连，启用 10 年保留锁/WORM，并使用与公开媒体不同的 RAM 身份。应用写入内容哈希不可变 key，后台下载时由应用服务器读取并复核 SHA-256；管理员看到“下载已签合同”和“导出客户联系方式”两个独立操作，均要求最近 5 分钟再认证并写审计。非合同联系方式在订单终态满 24 个月后清除，已签合同与验签/存证证据保留 10 年。

上线前分别完成自然人、企业法定代表人两笔沙箱签署，验证模板填充、实名认证/意愿认证、重复回调、伪造回调、返回页主动查询和“未签不得支付”。将公开域名加入 e 签宝重定向白名单，并配置公网 HTTPS 回调地址 `${VAULT2077_PUBLIC_ORIGIN}/api/opc/esign/callback`。生产 AppID 所属主体、企业实名认证、印章与授权由运营方在 e 签宝后台完成，代码不能代替。

### OPC 支付宝开放平台支付

| 变量 | 说明 |
| --- | --- |
| `VAULT2077_OPC_PAYMENTS_ENABLED` | `false` 时正式关闭订单和付款写入口；完成商户接入和真实演练后改为 `true` |
| `VAULT2077_ALIPAY_APP_ID` | 支付宝开放平台中已上线网页/移动应用的 APPID |
| `VAULT2077_ALIPAY_SELLER_ID` | 收款商户 PID，用于异步通知中的商户身份二次核对 |
| `VAULT2077_ALIPAY_PRIVATE_KEY` | 应用 RSA2 私钥；只进入服务器密钥管理，不得提交 Git、写日志或传到浏览器；环境变量可使用 PEM 原文或把换行写成 `\n` |
| `VAULT2077_ALIPAY_PUBLIC_KEY` | 支付宝公钥，不是应用公钥；用于异步通知和查询响应验签 |
| `VAULT2077_ALIPAY_KEY_TYPE` | `PKCS8` 或 `PKCS1`，必须与应用私钥实际格式一致；支付宝密钥工具默认产物通常按 `PKCS8` 配置 |
| `VAULT2077_ALIPAY_GATEWAY` | 生产固定为 `https://openapi.alipay.com/gateway.do`；沙箱使用支付宝开放平台当前提供的官方沙箱网关 |
| `VAULT2077_ALIPAY_WEB_PAYMENT_MODE` | `page`（电脑网站支付）、`wap`（手机网站支付）或 `both`；必须与应用已签约产品一致 |
| `VAULT2077_PUBLIC_ORIGIN` | 公开站 HTTPS origin；系统据此生成 `${VAULT2077_PUBLIC_ORIGIN}/api/opc/alipay/notify` 和支付宝返回地址 |

接入步骤：

1. 使用完成实名认证的支付宝商家账号进入[支付宝开放平台](https://open.alipay.com/)，创建“网页/移动应用”并完成主体、域名等资料。
2. 在应用中添加“电脑网站支付”和/或“手机网站支付”，按业务需要完成签约与应用上线。开发中应用不能调用生产能力。
3. 在“开发设置 → 接口加签方式”选择 RSA2。推荐使用支付宝密钥工具生成应用密钥对：应用私钥只保存在服务器密钥管理；应用公钥上传开放平台；从开放平台复制对应的“支付宝公钥”用于验签。不要把应用公钥误填成支付宝公钥。
4. 先用沙箱 APPID、沙箱网关和沙箱密钥完成联调。沙箱通知地址也必须从公网通过 HTTPS 访问，本地开发应使用受控测试域名或临时 HTTPS 隧道。
5. 生产密钥通过部署平台 Secret、systemd `EnvironmentFile` 或等价密钥管理注入。接入前同时保持 `VAULT2077_OPC_ESIGN_ENABLED=false` 与 `VAULT2077_OPC_PAYMENTS_ENABLED=false`，公开站只读展示服务且不收集签约信息；准备开放时同时改为 `true`，运行 `npm run deploy:check`，缺少任一签署或付款配置都必须失败。
6. 上线前完成一笔最小金额端到端交易：提交签约信息后后台先出现“待签署”订单；完成托管签署并由服务器主动核验后变为“待付款”；跳转支付宝官方收银台；支付后异步通知自动更新为“已到账”。
7. 模拟通知丢失并使用“查询支付宝状态”补查；验证重复通知幂等、错误签名拒绝、APPID/PID 不匹配拒绝、订单保存 PID 与当前查询配置不一致拒绝、金额不一致拒绝。浏览器 `return_url` 只展示“核验中”，不得直接改订单状态。

项目使用支付宝官方 [`alipay-sdk`](https://github.com/alipay/alipay-sdk-nodejs-all)：`pageExecute()` 生成网站支付链接，`checkNotifySignV2()` 验证异步通知，`alipay.trade.query` 用于异常补查。支付应用上线、签约、费率、结算账户与商家资质由支付宝开放平台审核决定，不由代码代替。

`VAULT2077_DATA_DIR` 统一规范预览文件和本地报告，包括 Frontier 预览存储；它不构成生产数据库或备份。Next 生产进程只有在显式设置 `VAULT2077_ALLOW_FILE_PREVIEW=true` 时才允许文件模式，该开关只用于 E2E/本地预览，生产部署必须保持关闭。

游骑兵头像媒体每天执行一次 `npm run opc:cleanup-ranger-media`：未被草稿、当前发布或发布历史引用的孤儿对象保留 7 天；只存在于发布历史的已替换对象保留 30 天。本人撤回授权时，先从草稿和公开目录移除头像并发布，再执行 `npm run opc:purge-revoked-ranger-media -- <ranger-slug>`；该命令会枚举并删除当前对象、全部历史 versionId 和删除标记。RAM 清理权限必须同时允许列举对象版本和按 versionId 删除。

生产 v1 配置 `VAULT2077_DATABASE_URL`、`VAULT2077_DATABASE_SSL` 与 `VAULT2077_DATABASE_POOL_SIZE`（2C2G 基线为 4），并在启动前运行 `npm run db:migrate`。当前迁移覆盖业务聚合、统一 inbox、claim token/退避、不可变审计、登录锁定、分布式限速和可撤销后台会话；健康检查必须确认最新迁移名为 `0006_acquisition_reliability.sql`，迁移文件应用后不得修改。

阿里云首个商用版本使用 RDS PostgreSQL 17，而不是把 PostgreSQL 与 Node 放在同一台服务器。初始存储 20 GB、连接池 4；先按量付费完成 7～14 天上线验证，稳定后转包月。阿里云当前基础系列不支持日志备份/时间点恢复，因此若已购买基础系列，全功能首发前必须升级或迁移到支持日志备份的系列，推荐高可用多可用区；若业务负责人书面接受只能按备份集恢复，则必须同步降低 RPO 目标并修订上线规格，不能继续声称具备 PITR。轻量应用服务器处于独立自动 VPC，不会自动与 RDS 同网；必须选择同账号、同地域资源并配置轻量服务器与目标 VPC 的内网互通，再限制 RDS 白名单/安全组。RDS 必须开启 TLS、自动/日志备份、时间点恢复、删除保护和监控；容量在 50%/70%/80% 分级告警，上线前恢复到隔离实例并记录 RPO/RTO。Redis 当前不需要。OSS 分为两个完全隔离的用途：公开游骑兵头像按 ADR-0016 使用公开媒体 Bucket；OPC 已签合同按 ADR-0018 使用专用私有、10 年保留锁 Bucket。原始包、授权材料和其他长期归档不得写入任一 Bucket。

## 6. GitHub Actions

目标只保留一个境外采集 workflow，支持四 lane：

- information：北京时间 `08:05–22:05`，每两小时
- roadside：北京时间 `08:55–22:55`，每两小时
- sic：北京时间每日 `08:25`
- rankings：北京时间 `08:35/12:35/16:35/20:35`
- Frontier：北京时间 `08:45–22:45`，每两小时
- 全仓质量检查：北京时间每日 `06:30`，并在 pull request / `main` push 执行

计划任务必须要求成功投递。交付模块对瞬时网络错误做最多四次同批次重试，但 GitHub 定时任务仍可能延迟或被平台丢弃，因此必须以境内内容新鲜度告警发现漏跑，并通过 `workflow_dispatch` 使用新的 schedule ID 补跑。workflow 权限保持 `contents: read`，artifact 不得含密钥、邮箱或后台数据。

GitHub Actions 只持有接收 URL、公开任务 URL、公开任务只读密钥、版本化签名密钥环和活动 key ID，不得持有 worker、后台、用户数据或境内 LLM 密钥，也不得调用 `/api/internal/acquisition/process`。每次采集必须上传 manifest、报告、不可变批次、SHA256 与验证授权标记；artifact 路径必须使用这四项白名单，不得上传 collector 临时目录，证据缺失必须使 workflow 失败。境内安装并启用 `vault2077-acquisition-worker.{service,timer}` 与 `vault2077-healthcheck.{service,timer}`，前者每五分钟消费 inbox、执行到期重试并清理保留期外记录，后者每五分钟把受保护业务 health 转换为 systemd 退出码；Frontier 在白天每两小时执行 `npm run frontier:tick`。三类任务都以 systemd 退出码、append-only 审计和 `/api/internal/health` 判断成功，并配置失败告警和错过任务补跑策略。

Frontier 境内 GitHub 请求必须使用服务端只读凭证、短超时、限流、缓存或条件请求并记录最近成功时间。普通页面不得触发 GitHub 请求；直读失败必须转为只含公开仓库标识的 rankings 回退任务。

相关变量为 `GITHUB_TOKEN`、`VAULT2077_GITHUB_TIMEOUT_MS`、`VAULT2077_GITHUB_CONCURRENCY`。生产必须使用仓库 Nginx 模板覆盖 `X-Forwarded-For` 与 `X-Real-IP`，随后设置 `VAULT2077_TRUST_PROXY_HEADERS=true`；门禁不再允许未信任代理头的生产配置。若未来增加 CDN，必须以 `set_real_ip_from` 限定其出口地址后再恢复真实地址，不得直接信任用户提交的头；当前原生 Passkey 方案不要求在 Nginx 前另设身份网关。

## 7. 反向代理与公开边界

- 仓库中的 `deploy/nginx/vault2077.conf.example`、`deploy/nginx/vault2077-admin-proxy.conf.example` 和 `deploy/systemd/vault2077-web.service` 是双入口与应用服务模板；部署时必须核对域名、证书路径、目录和 Passkey RP 来源，并先通过目标环境审查。
- 只公开产品路由和必要表单 API。
- 内部命名空间在公网仅开放两个精确跨境接口：`POST /api/internal/acquisition` 负责写入签名批次，`GET /api/internal/frontier/tasks` 使用独立只读密钥返回已脱敏公开任务；两者均由 Nginx 先执行方法和速率限制。
- `/api/internal/acquisition/process`、健康、Frontier tick、后台与诊断路由不得经公开域名访问；监控和人工处理使用回环或受控内网。
- `/admin` 与 `/api/admin/*` 只在 `VAULT2077_ADMIN_ORIGIN` 的主机上提供；公开站主机显式拒绝这些路径。
- 管理入口由应用发起原生 Passkey ceremony；Nginx 清空客户端提交的身份断言头，Node 只监听回环应用端口，防火墙拒绝服务器 IP 绕过。
- 监控以 Bearer 密钥读取 `/api/internal/health`；`503` 或任一 degraded 检查触发告警，不向公网匿名暴露检查详情。
- `/pipeline` 只允许回环/内部网络或认证后台访问，并设置 `noindex`。
- 配置 TLS、HSTS、逐请求 nonce CSP、MIME 防护、Referrer Policy、请求体限制与日志脱敏。nonce 使页面采用动态渲染；首发 VPS 必须以压测确认可接受的 CPU、TTFB 和并发。

## 8. 部署步骤

1. 固定提交、Node/Python 运行时和锁文件；在阿里云创建轻量应用服务器、RDS、头像 OSS、轻量与 VPC 内网互通、安全组/防火墙、三个主机的 DNS/TLS 和监控联系人。
2. 安全组仅允许公网 `80/443`，SSH 只允许受控运维来源；RDS 只允许应用安全组访问。Node 只监听 `127.0.0.1:3000`。
3. 通过 SSH 生成一次性 Passkey 注册令牌，在管理域名为唯一 owner 注册至少一个凭证并离线保存恢复码；确认公开域名和 Node 端口都不能进入后台。
4. 生成彼此独立的高熵秘密与两个版本化密钥环；把采集签名密钥环、活动 ID 和 Frontier 公开任务只读密钥配置到 GitHub Secrets，把完整验签密钥环配置在境内。不得复制 worker、LLM、后台或用户数据秘密到 GitHub。
5. 注入 PostgreSQL、OSS、Passkey、管线、模型与功能开关的最终生产变量，先运行 `npm run deploy:check`，再运行会实际调用全部已配置主/备用模型的 `npm run deploy:verify-editorial`；两者全绿后再运行文档、ESLint、Ruff、类型、单元、采集器、构建和 E2E。
6. 运行 PostgreSQL 迁移，确认健康检查识别最新迁移；创建自动备份后执行一次隔离恢复演练。
7. 安装 Nginx、`vault2077-web.service`、`vault2077-acquisition-worker.timer`、`vault2077-healthcheck.timer` 与 `vault2077-frontier-tick.timer`；执行 `nginx -t`、`systemd-analyze verify` 并接入失败告警。生产主告警接收人为 `lanzhouda@163.com`，当前无备用接收人。
8. 部署应用但暂不开放内容频道；执行一次性 bootstrap，把 SiC 每个 approved 来源的最近一条合格内容与 Vault 最近 30 天真实内容写入生产事实源。
9. 验证 bootstrap 的逐来源覆盖、原始日期、稳定 ID、分批处理和幂等补跑，再启用统一增量计划和境内两个 timer。
10. 在生产等价预发布环境验证投递重试、GitHub 漏跑补跑、worker 积压恢复、四通道新鲜度、Frontier 快速路径与异步回退、公开降级、后台会话与再认证、头像 OSS 上传/访问/发布/撤回/清理、OPC 下单/到账/完成/退款状态流转、反向代理伪造头拒绝和 `/pipeline` 边界。
11. 完成容量基准、告警演练、回滚演练和发布签字；失败按上一应用版本和向前兼容数据库迁移策略回滚。

bootstrap 是一次性受审计作业，不是应用启动钩子。多副本启动不得各自触发回填；新增 approved 来源时只对该来源执行同一基线规则。

## 9. 轮换与事故

管线签名轮换：

1. 在境内 `VAULT2077_PIPELINE_SIGNING_KEYS` 加入新 key ID，保留旧值并重启/复验接收端。
2. 在 GitHub Secret 中加入同一新密钥，把 `VAULT2077_PIPELINE_ACTIVE_KEY_ID` 切到新 ID。
3. 手动投递一个受审计批次，确认接收报告记录新 key ID；观察至少一个完整通道周期。
4. 从 GitHub 和境内密钥环删除旧密钥，再运行 `deploy:check`。不得先删境内旧密钥。

敏感数据轮换先把新值加入 `VAULT2077_DATA_KEYS` 并切换活动 ID。新写入自动使用新版本，旧密文按自身 key ID 解密；无 key ID 的历史密文会尝试保留的旧密钥。删除旧数据密钥前，必须确认相应数据已过保留期或已通过受审计迁移重加密，不能仅凭新写入成功删除。

事故时暂停公网写入口、境外计划和境内 worker timer，保留审计与批次证据；恢复前重新验证重放、来源 revision、密钥版本和备份一致性。
