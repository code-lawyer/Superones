---
type: research
status: active
updated: 2026-07-31
---

# Vault2077 中国大陆阿里云部署官方事实底稿（2026-07-31）

本底稿只整理阿里云及阿里云帮助中心的一手资料，为生产 handoff 和部署手册提供可复核依据；它不是当前运行规范，也不包含账号、实例 ID、IP、数据库密码、AccessKey、证书私钥等秘密。控制台名称和产品能力以实际购买地域、实例系列及当天控制台为准。

## 1. 对 Vault2077 的直接结论

1. 应用服务器、RDS PostgreSQL 与 OSS 必须优先选择同一阿里云账号、同一中国大陆地域。ECS 与 RDS 置于同一 VPC 后使用 RDS 内网连接地址；同地域 ECS 访问 OSS 使用内网 Endpoint。这样数据库和对象写入不走公网，降低攻击面、时延和公网流量成本。[RDS 连接与网络](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/connections-and-networks/)、[OSS 地域与 Endpoint](https://help.aliyun.com/en/oss/user-guide/regions-and-endpoints)
2. 如果服务器是轻量应用服务器而不是 ECS，它默认不与 RDS 所在 VPC 互通，必须在同账号、同地域启用“内网互通/服务互联”。首次在一个地域开通会使该地域轻量应用服务器停机约一分钟，应在正式切流前完成。[轻量应用服务器内网互通](https://help.aliyun.com/zh/simple-application-server/user-guide/manage-service-interconnection/)
3. RDS 即使只开放内网地址，也仍须设置白名单或绑定安全组；ECS 场景应把应用服务器的私网 IP 加入 RDS 白名单。生产不应申请 RDS 公网地址；若实例已经有公网地址，应在内网验证通过后释放公网地址。[RDS PostgreSQL 白名单](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/configure-an-ip-address-whitelist-for-an-apsaradb-rds-for-postgresql-instance)、[RDS 网络隔离](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/network-isolation)
4. 当前项目文档把“PostgreSQL 17 基础版”和“日志备份/PITR”同时列为目标，二者按阿里云当前官方能力冲突：RDS PostgreSQL 基础系列不支持日志备份，因此不能按任意时间点恢复，只能按备份集恢复。若 PITR 是上线硬门禁，应在上线前升级或迁移到支持日志备份的系列；若保留基础系列，必须明确接受备份集级 RPO，并同步修订项目规格和告警/演练口径。[RDS PostgreSQL 自动备份](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/back-up-an-apsaradb-rds-for-postgresql-instance)、[RDS PostgreSQL 恢复](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/restore-data-of-an-apsaradb-rds-for-postgresql-instance)
5. OSS 自定义域名只用于公网访问，不能作为内网 Endpoint。Vault2077 服务端上传、HEAD、枚举和删除走内网 Endpoint；浏览器读取 `media.superones.top` 走 OSS 公网自定义域名，两条链路必须分别配置和验收。[OSS 自定义域名](https://help.aliyun.com/en/oss/user-guide/access-buckets-via-custom-domain-names)、[OSS 访问与网络概览](https://help.aliyun.com/en/oss/user-guide/access-and-network-overview)
6. OSS 开启版本控制后，普通删除只生成删除标记，不会永久删除历史内容。Vault2077 的游骑兵授权撤回验收必须验证“按 versionId 删除所有版本与删除标记”，而不能只验证公开 URL 返回 404。[OSS 版本控制](https://help.aliyun.com/en/oss/user-guide/overview-78/)、[OSS 删除标记](https://help.aliyun.com/en/oss/user-guide/delete-marker)
7. 中国大陆节点的公开域名必须完成 ICP 备案；网站上线后还须按阿里云备案指引在 30 日内办理公安联网备案，并在页面底部展示和链接备案号。若向用户提供经营性有偿互联网信息服务，是否还需 ICP 许可证必须由业务/法务按实际服务确认。[阿里云 ICP 备案流程](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-application-overview)

## 2. ECS 或轻量应用服务器与 RDS PostgreSQL

### 2.1 ECS 是更直接的生产拓扑

阿里云推荐新建 RDS 使用 VPC。ECS 与 RDS 位于同一 VPC 时可直接通过 RDS 内网连接地址通信，即使使用不同交换机也可内网连接；连接前仍需把 ECS 私网 IP 加入 RDS 白名单。[RDS 网络类型 FAQ](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/faq-about-network-types)、[创建 RDS PostgreSQL](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/create-an-apsaradb-rds-for-postgresql-instance)

建议核对顺序：

1. ECS 控制台记录地域、VPC ID、交换机 ID 和私网 IP，只记录标识，不把公网 IP 或任何凭证提交进 Git。
2. RDS 控制台确认相同地域、相同 VPC，并取得“内网地址”和端口。
3. 在 RDS 白名单中只加入实际应用 ECS 私网 IP；不要为图省事加入 `0.0.0.0/0` 或整个不必要的大网段。
4. 确认 RDS 没有公网地址；若已有，先从 ECS 通过内网地址完成连接、迁移和健康检查，再释放公网地址。
5. 应用连接串只写入服务器秘密环境文件，不进入仓库、shell 历史、工单截图或聊天记录。

连接串应始终使用 RDS 控制台提供的内网 DNS 地址，不把当前解析出的私网 IP 写死；这样 RDS 节点切换后仍可由服务域名接续。[连接 RDS](https://help.aliyun.com/zh/rds/support/how-do-i-connect-to-an-apsaradb-rds-instance)

### 2.2 轻量应用服务器需要显式服务互联

轻量应用服务器使用阿里云自动分配的隔离 VPC，默认不能通过内网访问 RDS。官方“内网互通”适用于同账号、同地域的轻量应用服务器与云数据库；首次启用会使该地域轻量应用服务器停机约一分钟，而且同账号同地域下的全部轻量服务器会与接收端 VPC 互通，不是只连接单台服务器。[轻量应用服务器内网互通](https://help.aliyun.com/zh/simple-application-server/user-guide/manage-service-interconnection/)

建议核对顺序：

1. 确认轻量服务器与 RDS 属于同一阿里云账号、同一地域。
2. 在轻量应用服务器控制台进入“内网互通”，选择 RDS 所在目标 VPC 作为接收端。
3. 在尚未公开切流的维护窗口执行；预留至少一分钟实例中断和后续连接验证时间。
4. 开通后取得轻量服务器私网 IP，把它加入 RDS 白名单。
5. 在服务器上用 RDS 内网域名和端口做 TCP/SSL 连接验证；不要用 `ping` 成功替代 PostgreSQL 登录验证。
6. 若未来同地域新增轻量服务器，复核其是否因地域级互通自动获得到目标 VPC 的网络路径，并相应收紧 RDS 白名单。

### 2.3 RDS 白名单和公网地址

RDS PostgreSQL 新实例在客户端连接前必须配置 IP 白名单或安全组。同 VPC ECS 的推荐配置是应用 ECS 的私网 IP；公网连接需要额外申请公网地址并把客户端公网 IP 加白，但官方明确提示公网地址会扩大攻击面。[RDS PostgreSQL 白名单](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/configure-an-ip-address-whitelist-for-an-apsaradb-rds-for-postgresql-instance)、[连接 RDS](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/how-do-i-connect-to-an-apsaradb-rds-instance)

白名单修改通常约一分钟生效；`0.0.0.0/0` 表示允许所有 IP，只可用于受控临时排障且必须立即撤回，不能留在生产。[RDS 白名单常见场景](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/common-use-cases-and-issues-for-whitelists)

上线证据至少应包括：

- 应用服务器通过 RDS 内网地址连接成功；
- 一台未加入白名单的主机连接失败；
- RDS 控制台不显示公网连接地址；
- 应用配置中没有 RDS 公网域名；
- 白名单没有 `0.0.0.0/0`，没有个人家庭公网 IP 的长期例外。

## 3. RDS TLS、备份、恢复与防误删

### 3.1 TLS 必须验证服务端身份

RDS PostgreSQL 支持云端证书。只在控制台“开启 SSL”并不等于客户端一定使用 SSL；官方说明在未配置客户端访问控制时，客户端仍可选择 `PGSSLMODE=disable`。客户端应使用 `verify-ca` 或更严格的 `verify-full` 并配置 RDS CA；`require` 只加密而不验证数据库身份。[RDS SSL 快速配置](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/configure-ssl-encryption-for-an-apsaradb-rds-for-postgresql-instance)、[通过 SSL 连接 RDS PostgreSQL](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/connect-to-an-apsaradb-rds-for-postgresql-instance-over-ssl-connections)、[强制客户端 SSL](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/forcefully-enable-ssl-connections-on-the-client)

执行要点：

1. 在 RDS“数据安全性/SSL”中启用云端证书并下载 CA 链。
2. 使用控制台 SSL 页面显示的受保护连接地址，不自行用私网 IP 替代证书覆盖的主机名。
3. 把 CA 文件部署到应用服务器的只读系统目录，私钥不参与 RDS 单向服务端校验。
4. 在应用 PostgreSQL 客户端中使用 `verify-full`；如果现有驱动/连接串不能稳定加载 CA，先补齐应用配置能力，不能降级为“只要内网就不校验”。
5. 断开并重建连接池后，在数据库端核验实际会话启用了 SSL；同时做一次错误 CA 或错误主机名的失败测试。
6. 证书更新前建立提醒和轮换演练；阿里云云端证书有效期及更新行为以控制台当期信息为准。

开启、关闭或修改 RDS SSL 保护地址可能使实例重启或产生分钟级闪断；既有连接必须断开重连后才会使用新的加密配置。因此应在首发前或维护窗完成，且压测必须保持与生产相同的 SSL 配置。[RDS SSL 快速配置](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/configure-ssl-encryption-for-an-apsaradb-rds-for-postgresql-instance)

### 3.2 自动备份与 PITR 的产品系列限制

RDS PostgreSQL 自动数据备份不可完全关闭，官方当前最低保留 7 天、每周至少两次。日志备份用于在保留期内按时间点恢复，但基础系列不支持日志备份。[RDS PostgreSQL 自动备份](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/back-up-an-apsaradb-rds-for-postgresql-instance)

因此有两条可选路线：

- **路线 A（符合当前项目“PITR 必须”目标）**：把已经开通的基础版升级/迁移到支持日志备份的系列，启用数据备份和日志备份；在实际业务 RPO/RTO 评审后设置保留期，并完成按时间点恢复演练。
- **路线 B（保留基础版）**：接受只能按备份集恢复；把 RPO 明确为相邻备份间隔可能丢失的数据量，修改部署规格、上线清单和告警口径，不得继续声称具备 PITR。

无论选择哪条路线，备份应安排在低峰期，避免备份期间执行可能锁表并导致失败的 DDL；备份超出免费额度可能收费。[RDS PostgreSQL 自动备份](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/back-up-an-apsaradb-rds-for-postgresql-instance)

全功能首发若需要数据库节点故障时的自动切换能力，应优先选择高可用系列并采用多可用区部署；基础系列是单节点架构，不能把“云盘有备份”理解为运行时高可用。[RDS PostgreSQL 高可用系列](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/rds-high-availability-edition)

### 3.3 恢复不是“看到备份成功”

官方恢复流程会从备份集或时间点创建一个新的、计费的 RDS 实例，然后验证数据，再把所需数据迁回原实例。云盘实例恢复后不会复制原实例的白名单和安全组，必须重新配置。[RDS PostgreSQL 恢复](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/restore-data-of-an-apsaradb-rds-for-postgresql-instance)

Vault2077 上线前恢复演练至少应记录：

1. 恢复来源备份集或时间点；
2. 新恢复实例开始和可连接时间，用于计算 RTO；
3. 恢复实例重新配置的 VPC、白名单和安全组；
4. `schema_migrations`、内容状态、后台 Passkey 状态、审计链、订单与 Frontier 表的抽检结果；
5. 应用只读连接恢复实例的验证结果；
6. 演练实例释放审批与费用；
7. 实际可接受 RPO/RTO 的负责人签字。

### 3.4 删除/释放保护

按量付费 RDS 可启用删除保护，开启后控制台和 `DeleteDBInstance` API 的手工删除会被阻止；但它不防止欠费超过官方期限或合规原因导致的自动释放。因此仍须配置费用余额/续费责任与告警。[RDS PostgreSQL 删除保护](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/enable-or-disable-the-release-protection-feature-for-an-apsaradb-rds-for-postgresql-instance-5)

验收时确认：

- RDS“释放保护/删除保护”为开启；
- 付款方式、余额或续费责任人明确；
- 删除保护的关闭权限只给极少数运维管理员；
- 变更操作需要双人确认，且在删除前另做手工备份并验证。

## 4. OSS 内外网、域名、HTTPS、版本控制与 CORS

### 4.1 服务端内网 Endpoint

同地域 ECS 可通过 `oss-<region-id>-internal.aliyuncs.com` 访问 OSS，流量走阿里云内网且不产生公网流出费；跨地域不能直接依赖该内网 Endpoint。[OSS 访问与网络概览](https://help.aliyun.com/en/oss/user-guide/access-and-network-overview)、[OSS 地域与 Endpoint 表](https://help.aliyun.com/en/oss/user-guide/regions-and-endpoints)

若资源在上海：

- 项目配置使用 `VAULT2077_OSS_REGION=oss-cn-shanghai`；
- 同地域应用服务器内网访问时设置 `VAULT2077_OSS_INTERNAL=true`；
- `ali-oss` SDK 由 region 与 `internal: true` 选择内网 Endpoint，不要把 `media.superones.top` 当成 SDK 内网地址；
- 在服务器上实际执行上传、HEAD、列举版本和删除演练，确认 DNS 和权限均正常。

### 4.2 `media.superones.top` 的 CNAME 与 HTTPS

OSS 自定义域名需要先在 Bucket 控制台绑定，再把 DNS CNAME 指向控制台给出的 CNAME 域名或 Bucket 公网域名；中国大陆 Bucket 绑定的域名必须已完成 ICP 备案。自定义域名只适用于公网，不能作为内网 CNAME。[OSS 自定义域名](https://help.aliyun.com/en/oss/user-guide/access-buckets-via-custom-domain-names)

HTTPS 配置位置取决于是否启用 CDN：首发不使用 CDN 时，应在 OSS 自定义域名配置中上传/部署证书；若以后启用 CDN，则证书和 HTTP→HTTPS 跳转配置在 CDN 侧。OSS Bucket 默认域名原生支持 HTTPS，但自定义域名必须单独配置证书。[OSS HTTPS](https://help.aliyun.com/zh/oss/user-guide/access-oss-by-https-protocol)、[OSS 访问与网络概览](https://help.aliyun.com/en/oss/user-guide/access-and-network-overview)

切换顺序：

1. 确认 `media.superones.top` 已包含在 ICP 备案/接入信息内。
2. 在 OSS Bucket 绑定该域名；如跨账号或第三方 DNS，先按控制台要求用 TXT 验证所有权。
3. 添加 CNAME，等待解析生效。
4. 为自定义域名部署覆盖准确主机名的证书。
5. 用测试对象验证 HTTPS、证书链、Content-Type、Cache-Control、匿名读取和 HTTP 行为。
6. 页面 CSP 仅允许最终媒体 origin；切换前后不要让数据库保存临时 Bucket 域名。

### 4.3 公开读取的最小边界

Vault2077 目前通过公开媒体 URL 直接展示处理后头像，因此这些对象必须允许匿名读取。OSS 官方把 `public-read` 定义为任何人可读、仅所有者或授权身份可写；`public-read-write` 允许匿名写入，存在违法内容、数据泄漏和费用风险，绝不能使用。[OSS 权限概览](https://help.aliyun.com/zh/oss/user-guide/permissions-and-access-control-overview)、[Bucket ACL](https://help.aliyun.com/zh/oss/user-guide/oss-bucket-acl)

推荐的实际边界：

- Bucket 只能保存服务端处理后的公开头像，不混放原图、授权材料、备份或私密文件；
- 公开权限只覆盖 `rangers/` 对象读取；应用写权限只覆盖同一前缀；
- 绝不授予匿名列举、写入、覆盖或删除；
- 若启用 OSS“阻止公共访问”，所有匿名 ACL/Bucket Policy 都会失效。该 Bucket 因产品需要匿名读，应在账号级与 Bucket 级理解并明确这个例外，不能一边开启阻止公共访问一边期待公开 URL 可用。[OSS 阻止公共访问](https://help.aliyun.com/zh/oss/user-guide/block-public-access/)

### 4.4 版本控制与真正永久删除

开启版本控制后，覆盖会产生新版本；不带 versionId 的删除只创建删除标记，历史版本仍可恢复。永久删除指定对象版本或删除标记必须携带 versionId。[OSS 版本控制](https://help.aliyun.com/en/oss/user-guide/overview-78/)、[OSS 删除标记](https://help.aliyun.com/en/oss/user-guide/delete-marker)

因此验收分两类：

- 普通替换/误删：确认可从历史版本恢复；
- 本人撤回授权：先下架引用，再调用项目永久清理命令，随后枚举 `rangers/<slug>/` 的全部对象版本和删除标记，结果必须为零。仅看到当前 URL 404 不算永久删除完成。

版本控制会保留历史对象并继续产生存储和请求费用。应设置生命周期或项目清理任务处理已确认无引用的历史版本/删除标记，但生命周期不得早于项目承诺的回滚期或绕过授权撤回的即时清理流程。

### 4.5 CORS

OSS CORS 只在浏览器 JavaScript 跨 origin 读取或直传资源时需要。规则可限定来源、Methods、Headers、暴露 Headers 与预检缓存时间；多来源或通配符场景应正确处理 `Vary: Origin`。[OSS CORS](https://help.aliyun.com/zh/oss/user-guide/cors-settings/)

Vault2077 当前由服务端上传，浏览器只通过图片 URL 展示头像，首发不应为了“可能有用”而配置宽泛 `*` CORS。若以后增加浏览器直传、Canvas 读取或 JS `fetch`，再仅允许实际站点：

- `https://superones.top`；
- `https://admin.superones.top`（仅确有浏览器跨域调用时）；
- 仅所需的 `GET`/`HEAD`，浏览器直传另经安全设计后才增加 `PUT`/`POST`；
- 仅所需 Headers，不使用任意来源加凭证组合。

## 5. RAM 最小权限

### 5.1 官方最佳实践与当前项目差距

阿里云建议运行在 ECS 上的应用优先使用实例 RAM 角色，通过实例元数据服务取得自动过期的 STS 临时凭证，避免在服务器保存长期 AccessKey；RAM 权限应遵循最小权限。[ECS 实例 RAM 角色](https://help.aliyun.com/zh/ecs/user-guide/attach-an-instance-ram-role-to-an-ecs-instance)、[OSS RAM Policy 最佳实践](https://help.aliyun.com/en/oss/user-guide/ram-policy/)

当前 Vault2077 的 `lib/ranger-avatar-storage.ts` 明确读取 `VAULT2077_OSS_ACCESS_KEY_ID` 与 `VAULT2077_OSS_ACCESS_KEY_SECRET`，尚未实现实例 RAM 角色/STS 凭证提供链。因此：

- 首次上线若不改代码，只能使用独立 RAM 用户的最小权限 AccessKey，并把 Secret 放在服务器秘密文件中；
- 不得使用阿里云主账号 AccessKey，不得授予 `AliyunOSSFullAccess`；
- 上线后应把“支持 ECS 实例 RAM 角色并移除长期 OSS AccessKey”列为安全加固项；
- 如果实际使用轻量应用服务器，应先确认该产品能否为应用提供等价实例角色能力，不要照搬 ECS IMDS 步骤。

### 5.2 当前代码需要的 OSS Action

当前代码会调用 PutObject、HeadObject、ListObjects、ListObjectVersions、DeleteObject 和按 versionId 删除。官方权限映射为：

- `oss:PutObject`：上传处理后头像；
- `oss:GetObject`：HeadObject 读取元数据；
- `oss:ListObjects`：枚举当前对象，Resource 必须是整个 Bucket，可用 `oss:Prefix` 限定 `rangers/*`；
- `oss:ListObjectVersions`：列举历史版本与删除标记；
- `oss:DeleteObject`：普通对象删除；
- `oss:DeleteObjectVersion`：永久删除指定版本和删除标记。

对应官方资料：[OSS RAM Policy](https://help.aliyun.com/en/oss/user-guide/ram-policy/)、[HeadObject 权限](https://help.aliyun.com/zh/oss/developer-reference/head-object)、[OSS 授权 Action](https://help.aliyun.com/zh/oss/user-guide/authorization-syntax-and-elements)、[ListObjectVersions](https://help.aliyun.com/en/oss/developer-reference/list-object-versions)。

最小权限策略模板如下，`<bucket-name>` 必须替换为实际独立媒体 Bucket；策略不包含 Bucket 配置、删除 Bucket 或访问其他前缀的权限：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "oss:ListObjects",
        "oss:ListObjectVersions"
      ],
      "Resource": "acs:oss:*:*:<bucket-name>",
      "Condition": {
        "StringLike": {
          "oss:Prefix": [
            "rangers/",
            "rangers/*"
          ]
        }
      }
    },
    {
      "Effect": "Allow",
      "Action": [
        "oss:PutObject",
        "oss:GetObject",
        "oss:DeleteObject",
        "oss:DeleteObjectVersion"
      ],
      "Resource": "acs:oss:*:*:<bucket-name>/rangers/*"
    }
  ]
}
```

策略上线后应做正反向验收：正常上传、HEAD、列举和永久删除成功；访问另一个 Bucket、另一个前缀、修改 Bucket ACL/域名/版本控制、删除 Bucket 必须失败。

## 6. DNS、TLS 与中国大陆备案

### 6.1 DNS 记录

阿里云 DNS 的 A 记录把域名映射到 ECS 公网 IPv4；主机记录只填前缀，例如根域填 `@`、`admin.superones.top` 填 `admin`。同一主机名上 A 记录会与 CNAME 等记录冲突。[阿里云 DNS 添加记录](https://help.aliyun.com/en/dns/pubz-add-parsing-record)

Vault2077 建议记录：

| 主机 | 类型 | 目标 |
| --- | --- | --- |
| `superones.top` | A | 应用服务器公网 IPv4 |
| `admin.superones.top` | A | 同一应用服务器公网 IPv4 |
| `media.superones.top` | CNAME | OSS 控制台给出的媒体 Bucket CNAME |

DNS 切换前先降低 TTL 并记录旧值；验证新源站后再切换，不应把 RDS 或 OSS 内网地址发布到公网 DNS。

### 6.2 Nginx TLS

阿里云 Nginx 证书安装指南要求证书覆盖实际访问域名，开放安全组和系统防火墙 443，配置证书和私钥绝对路径，再 `nginx -t` 与 reload。官方生产建议启用 HTTP→HTTPS、只使用 TLS 1.2/1.3、监控证书到期。[阿里云 Nginx SSL 证书部署](https://help.aliyun.com/en/ssl-certificate/install-ssl-certificates-on-nginx-servers-or-tengine-servers)

项目至少需要：

- 公开站证书覆盖 `superones.top`；
- 后台证书覆盖 `admin.superones.top`，Passkey RP ID 与该域名绑定，不能上线后随意更换；
- OSS 侧证书覆盖 `media.superones.top`；
- 私钥只允许 root 与 Nginx 必要进程读取，不放进仓库或应用环境变量；
- 证书更新要同时覆盖实际终止 TLS 的 Nginx/OSS/CDN/WAF 层；
- 从中国大陆多运营商和真实移动网络验证完整证书链及 HTTPS。

### 6.3 ICP 与公安联网备案

阿里云中国大陆节点上线前必须完成 ICP 备案；已有备案但改用阿里云大陆源站时，可能需要新增接入。备案通过后，网站首页底部应展示备案号并链接工信部；上线后 30 日内办理公安联网备案并展示相应编号。阿里云还提示提供有偿信息或服务的经营性网站可能需要 ICP 许可证，是否适用需单独确认。[阿里云 ICP 备案流程](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-application-overview)、[ICP 备案准备](https://help.aliyun.com/en/icp-filing/basic-icp-service/user-guide/overview)

切流前证据：

- `superones.top` 的备案主体、域名持有人和实际经营主体一致；
- `admin` 与 `media` 子域在接入商检查中可用；
- 页脚备案号和工信部链接已上线；
- 公安联网备案负责人、截止日期和所需材料明确；
- OPC 付费服务的 ICP 许可证适用性已有法律/合规书面结论。

## 7. 监控与告警

### 7.1 ECS/轻量服务器

ECS 可在实例监控页或云监控创建自定义告警，规则包含指标、连续周期、静默期、生效时段、联系人组和回调。阿里云示例说明可按连续多个统计周期触发，避免单点抖动。[ECS 告警规则](https://help.aliyun.com/en/ecs/user-guide/configure-alerts-for-an-ecs-instance)

Vault2077 至少应覆盖：CPU、内存、磁盘使用率、磁盘 inode、网络突增、实例不可用、Node/systemd 服务失败、Nginx 5xx、证书到期和健康检查失败。操作系统内指标通常依赖云监控 Agent，需确认已安装、在线并实际产生数据。

### 7.2 RDS PostgreSQL

RDS PostgreSQL 可启用“主动告警”或建立自定义云监控规则。官方默认主动告警包含连接使用率、磁盘使用率和只读实例同步延迟；自定义指标还包括 CPU、内存、IOPS、最长事务、最慢 SQL、数据库年龄和失效复制槽等。[RDS PostgreSQL 告警](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/manage-the-alert-rules-of-an-apsaradb-rds-for-postgresql-instance)

Vault2077 应至少设置：连接使用率、CPU、内存、磁盘、IOPS、最长事务、慢 SQL、备份失败和实例不可用。项目的容量 50%/70%/80% 阶梯是内部运行目标，不是阿里云默认值；需要在云监控中自定义并测试各级通知。

### 7.3 OSS

OSS 向云监控上报可用性/有效请求率、请求量、2xx/4xx/5xx、流量、延时和计费用量等指标，并可创建阈值告警。OSS 还可使用访问日志、SLS、配置审计和 ActionTrail 分别覆盖请求分析、配置变更与账号操作审计。[OSS 监控与日志](https://help.aliyun.com/en/oss/user-guide/logging-and-monitoring)、[OSS 云监控指标](https://help.aliyun.com/zh/oss/user-guide/use-cloudmonitor-to-monitor-oss)、[OSS 告警服务](https://help.aliyun.com/en/oss/user-guide/use-the-alert-service)

至少设置：5xx/可用性、4xx 异常上升、GET/公网流量突增、请求费用突增、存储量异常增长和证书到期；演练一次写入失败和流量阈值通知。注意删除 Bucket 不会自动删除其云监控告警规则，资源退役时需单独清理。

### 7.4 联系人和告警演练

云监控需要先建立告警联系人和联系人组，再把规则绑定到正确组。只看到规则“已启用”不算验收；必须触发测试通知，并记录短信/邮件/值班渠道的接收人、首响时间、升级路径和静默窗口。[RDS PostgreSQL 告警](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/manage-the-alert-rules-of-an-apsaradb-rds-for-postgresql-instance)、[OSS 告警服务](https://help.aliyun.com/en/oss/user-guide/use-the-alert-service)

## 8. 需要进入主 handoff 的阻断与决策

| 项目 | 当前事实 | handoff 必须要求 |
| --- | --- | --- |
| RDS 系列 | 项目写的是 PostgreSQL 17 基础版 | 先确认实际系列；若坚持 PITR，升级/迁移到支持日志备份的系列；否则书面接受仅备份集恢复并修订规格 |
| 服务器产品 | ECS 与轻量服务器的 VPC 行为不同 | 明确产品类型；轻量服务器必须先做服务互联和约一分钟停机演练 |
| RDS 公网 | 生产设计不需要公网地址 | 内网验证后释放公网地址，白名单只保留应用私网 IP |
| RDS TLS | 开启 SSL 不会自动强制客户端使用 | 应用必须使用 CA 校验，优先 `verify-full`，并用失败用例验证 |
| OSS 身份 | 官方推荐 ECS 实例 RAM 角色 | 当前代码只支持长期 AccessKey；首发用最小权限独立 RAM 用户，上线后补实例角色/STS |
| OSS 永久删除 | 版本控制普通删除只写删除标记 | 游骑兵撤回必须枚举并删除全部 versionId 和删除标记 |
| OSS 公网读取 | 媒体 URL 需要匿名读 | 公开范围只能是已处理头像前缀，绝不 public-read-write，不混放私密资料 |
| 域名合规 | 大陆节点要求 ICP；上线后 30 日公安备案 | 切流前核对 ICP/新增接入、页脚展示、公安备案责任和 ICP 许可证适用性 |
| 浏览器验收 | 中国大陆网络与跨境依赖可能表现不同 | 在三网、真实移动网络、无海外代理环境验证公开站、后台、OSS、支付宝、GitHub/模型降级 |

## 9. 上线后仍需完善的阿里云侧事项

以下不是首发可忽略项，而是上线后需要明确期限、负责人和验收证据的持续工作：

1. 把 OSS 长期 RAM AccessKey 改为 ECS 实例 RAM 角色/STS；改造前先确认应用 SDK 凭证提供链和轻量服务器能力。
2. 根据真实负载调整 ECS/RDS 规格、连接池、慢 SQL、备份窗口和容量告警，不用一次压测结果永久定容。
3. 每季度至少恢复一次 RDS 到隔离实例；应用 schema 重大变更前额外演练。
4. 每季度演练 OSS 误删恢复、游骑兵授权撤回的全部版本永久删除和 RAM 权限越权失败。
5. 建立证书到期、备案主体/接入信息变化、域名所有权与 RAM 权限季度复核。
6. 根据公网媒体流量和费用再决定是否增加 CDN；增加 CDN/WAF 前重新设计真实客户端 IP 信任、证书终止位置、缓存刷新和源站绕过测试。
7. 为 OSS 开启 ActionTrail/配置审计或等价审计能力，定期审阅 Bucket ACL、公共访问、CORS、域名、版本控制和策略变更。
8. 完成上线后 30 日内公安联网备案；若 OPC 经营范围或服务形态变化，重新判断 ICP 许可证及其他前置审批。

## 10. 官方资料索引

访问和复核日期：2026-07-31。

- 轻量应用服务器：[内网互通](https://help.aliyun.com/zh/simple-application-server/user-guide/manage-service-interconnection/)
- RDS 网络：[连接与网络](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/connections-and-networks/)、[白名单](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/configure-an-ip-address-whitelist-for-an-apsaradb-rds-for-postgresql-instance)、[网络隔离](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/network-isolation)
- RDS TLS：[云端证书](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/configure-ssl-encryption-for-an-apsaradb-rds-for-postgresql-instance)、[SSL 客户端连接](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/connect-to-an-apsaradb-rds-for-postgresql-instance-over-ssl-connections)、[强制 SSL](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/forcefully-enable-ssl-connections-on-the-client)
- RDS 数据保护：[自动备份](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/back-up-an-apsaradb-rds-for-postgresql-instance)、[恢复](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/restore-data-of-an-apsaradb-rds-for-postgresql-instance)、[删除保护](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/enable-or-disable-the-release-protection-feature-for-an-apsaradb-rds-for-postgresql-instance-5)
- OSS 网络与域名：[地域和 Endpoint](https://help.aliyun.com/en/oss/user-guide/regions-and-endpoints)、[自定义域名](https://help.aliyun.com/en/oss/user-guide/access-buckets-via-custom-domain-names)、[HTTPS](https://help.aliyun.com/zh/oss/user-guide/access-oss-by-https-protocol)
- OSS 数据保护：[版本控制](https://help.aliyun.com/en/oss/user-guide/overview-78/)、[删除标记](https://help.aliyun.com/en/oss/user-guide/delete-marker)、[CORS](https://help.aliyun.com/zh/oss/user-guide/cors-settings/)
- OSS 权限：[权限概览](https://help.aliyun.com/zh/oss/user-guide/permissions-and-access-control-overview)、[RAM Policy](https://help.aliyun.com/en/oss/user-guide/ram-policy/)、[授权 Action](https://help.aliyun.com/zh/oss/user-guide/authorization-syntax-and-elements)
- RAM：[ECS 实例 RAM 角色](https://help.aliyun.com/zh/ecs/user-guide/attach-an-instance-ram-role-to-an-ecs-instance)
- DNS/TLS/备案：[DNS A/CNAME 等记录](https://help.aliyun.com/en/dns/pubz-add-parsing-record)、[Nginx 证书](https://help.aliyun.com/en/ssl-certificate/install-ssl-certificates-on-nginx-servers-or-tengine-servers)、[ICP 备案流程](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-application-overview)
- 监控：[ECS 告警](https://help.aliyun.com/en/ecs/user-guide/configure-alerts-for-an-ecs-instance)、[RDS PostgreSQL 告警](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/manage-the-alert-rules-of-an-apsaradb-rds-for-postgresql-instance)、[OSS 监控与日志](https://help.aliyun.com/en/oss/user-guide/logging-and-monitoring)、[OSS 告警](https://help.aliyun.com/en/oss/user-guide/use-the-alert-service)
