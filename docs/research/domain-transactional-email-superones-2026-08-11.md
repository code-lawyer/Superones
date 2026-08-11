---
type: research
status: active
updated: 2026-08-11
---

# `superones.top` 同域事务邮件方案（2026-08-11）

## 结论

Vault2077 的 OPC 订单邮件推荐接入阿里云邮件推送（DirectMail），使用独立发信子域 `notify.superones.top` 和发信地址 `orders@notify.superones.top`。这仍然是 `superones.top` 品牌域下的地址，但不会改动根域现有邮箱服务。SMTP 使用华东集群 `smtpdm.aliyun.com:465`、SSL/TLS，认证用户名和邮件 `From` 必须都是 DirectMail 控制台创建的同一发信地址。

如果负责人要求发件地址必须严格是 `orders@superones.top`，最快且不迁移邮箱的路线不是阿里邮箱，而是复用根域当前已经启用的飞书邮箱：创建 `orders@superones.top` 公共邮箱，启用公共邮箱 SMTP 或第三方客户端权限，使用 `smtp.feishu.cn:465` 和专用密码。根域当前 MX 已经指向飞书，切换成阿里企业邮箱会改变整域收信去向，不应作为本次 OPC 上线步骤。

阿里企业邮箱本身可提供 `name@superones.top`，也支持 `smtp.qiye.aliyun.com:465`，但在根域已经使用飞书时必须先做整域邮箱迁移；对本次仅需发送低量订单事务邮件而言，它增加了不必要的迁移风险。阿里邮箱官方也明确建议批量或系统触发邮件使用邮件推送产品，避免影响普通企业邮箱信誉。[阿里邮箱通过 SMTP 程序发信](https://help.aliyun.com/zh/document_detail/36687.html)

## 当前可验证事实

2026-08-11 对公开 DNS 的只读查询得到：

- `superones.top` 有三条 MX，优先级和目标与飞书官方公布的 `mx1.feishu.cn`、`mx2.feishu.cn`、`mx3.feishu.cn` 完全一致；根域已经是飞书邮箱域。[飞书 MX 官方说明](https://www.feishu.cn/hc/zh-CN/articles/875569252485-%E6%88%90%E5%91%98%E7%9A%84%E9%A3%9E%E4%B9%A6%E9%82%AE%E7%AE%B1%E6%97%A0%E6%B3%95%E6%8E%A5%E6%94%B6%E9%82%AE%E4%BB%B6%E6%80%8E%E4%B9%88%E5%8A%9E)
- 根域已有 SPF TXT；不得再添加第二条 SPF。若未来确实要让多个服务共同代表同一域发信，必须合并为一条 SPF，而不是并列添加。[飞书关于单条 SPF 与多发信服务的说明](https://www.feishu.cn/hc/zh-CN/articles/877212879302-%E7%AE%A1%E7%90%86%E5%91%98%E8%AE%BE%E7%BD%AE%E9%82%AE%E4%BB%B6%E8%B7%AF%E7%94%B1%E5%87%BA%E7%AB%99%E7%BD%91%E5%85%B3)
- 根域 `_dmarc.superones.top` 当前没有公开 DMARC TXT。
- 候选子域 `notify.superones.top` 当前没有 MX/TXT 邮件记录，可以单独交给 DirectMail 验证，不影响网站 A/CNAME 和根域飞书收信。

本节是时间点证据，不是永久配置合同；正式修改前仍须再次查询 DNS，并以 DirectMail/飞书控制台当时给出的记录值为准。

## 三种路线比较

| 路线 | 对外发件地址 | 对现有根域邮箱的影响 | 事务邮件适配 | 成本和限制 | 结论 |
| --- | --- | --- | --- | --- | --- |
| DirectMail 独立子域 | `orders@notify.superones.top` | 不改根域 MX/SPF；只新增子域记录 | 官方把交易通知归类为触发邮件，支持 SMTP | 实名开通；总计 2000 封免费额度、每天最多免费 200 封；超出后按量 2 元/1000 封；新账户初始日发信额度与免费额度是两个不同限制 | **推荐生产方案** |
| 现有飞书根域邮箱 | `orders@superones.top` | 无需迁移；复用现有 MX | 飞书明确支持公共邮箱 SMTP 用于外部业务系统 | 依赖飞书管理员开启公共邮箱/客户端能力并生成专用密码；普通邮箱声誉与系统邮件共用 | **要求严格根域地址时的最短方案** |
| 阿里企业邮箱根域 | `orders@superones.top` | 需要把根域 MX 从飞书迁往阿里邮箱 | 能用 SMTP，但官方建议系统触发邮件改用 DirectMail | 免费版官方当前为 50 账号、每账号 5 GB，需实名认证和域名控制权；付费版最少 5 账号起售 | **本次不采用** |

DirectMail 的免费和按量价格来自阿里云当前计费页；资源包当前示例为 1 万封 19.98 元、有效期 6 个月。费用可能调整，购买时以控制台订单页为准。[DirectMail 计费方式](https://help.aliyun.com/zh/direct-mail/billing-methods) [资源包与日额度说明](https://help.aliyun.com/zh/direct-mail/resource-package-faqs)

阿里邮箱免费版的现行配额、实名认证和自动延期规则见[企业邮箱（免费版）](https://help.aliyun.com/zh/document_detail/446177.html)；付费版购买流程当前最少 5 账号起售，价格以购买页实时计算为准。[如何购买阿里邮箱](https://help.aliyun.com/zh/document_detail/36702.html)

## 推荐路线的控制台和 DNS 操作

### 1. 开通与区域

1. 使用承载 Vault2077 生产资源的阿里云企业实名主账号开通邮件推送按量付费。DirectMail 官方要求阿里云账号先完成实名认证；公司业务应使用企业实名认证账号。[DirectMail 购买流程](https://help.aliyun.com/zh/direct-mail/purchase-procedure) [阿里云实名认证说明](https://help.aliyun.com/zh/account/account-verification-overview)
2. 选择华东集群。官方建议境内发信程序选择华东 1；不同区域的发信域名和地址不互通。[DirectMail API/SMTP 完整流程](https://help.aliyun.com/zh/direct-mail/getting-started/simplified-procedure-of-sending-by-api-and-smtp)
3. 在“邮件推送 → 发信域名”中添加 `notify.superones.top`。

### 2. DNS

进入 DirectMail 的“域名配置”，把控制台为 `notify.superones.top` 生成的每一条记录原样添加到阿里云 DNS。不要从本文复制推测值。新发信域名当前要求 SPF、DKIM、DMARC、MX 全部验证通过；控制台还会提供域名所有权验证记录。阿里云官方明确建议邮件推送使用子域，避免与企业邮箱收发冲突。[配置发信域名](https://help.aliyun.com/zh/direct-mail/user-guide/how-to-configure-sending-domain-names) [快速配置步骤](https://help.aliyun.com/zh/direct-mail/getting-started/simplified-procedure-of-configuring-email-delivery)

在阿里云 DNS 中，这些记录的主机名会相对于根域填写。例如发信域为 `notify.superones.top` 时，所有权、SPF、DKIM、DMARC 和 MX 都应落在 `notify` 这棵子域下；具体主机记录和记录值必须以控制台清单为准。不得删除或覆盖：

- 根域现有飞书 MX；
- 根域现有 SPF；
- 网站、后台和媒体域名的 A/CNAME；
- 任何现有域名所有权验证记录。

DNS 生效通常需要等待，DirectMail 官方说明一般 4 小时内、最迟可能 48 小时；回到发信域名页面主动点击验证，直至所有必需项通过。[配置发信域名](https://help.aliyun.com/zh/direct-mail/user-guide/how-to-configure-sending-domain-names)

### 3. 发信地址与 SMTP 凭据

1. 在“发信地址”新建 `orders@notify.superones.top`，类型选择“触发邮件”。交易通知属于官方列出的触发邮件，只能通过 API 或 SMTP 等方式发送。[DirectMail 使用规则](https://help.aliyun.com/zh/direct-mail/getting-started/product-rules/) [设置发信地址](https://help.aliyun.com/zh/direct-mail/user-guide/setup-sender-addresses)
2. 可把回信地址设置为一个真实可收信的企业邮箱。若 SMTP 邮件需要 `Reply-To`，程序必须在消息中显式设置；控制台配置的回信地址不会自动带入 SMTP 邮件。[设置发信地址](https://help.aliyun.com/zh/direct-mail/user-guide/setup-sender-addresses)
3. 为该发信地址设置独立 SMTP 密码。新地址设置后官方建议等待约 10 分钟再测试。SMTP 密码不是阿里云登录密码，也不是 AccessKey。[设置发信地址](https://help.aliyun.com/zh/direct-mail/user-guide/setup-sender-addresses)
4. 开启 IP 防护时，只允许生产 ECS 的固定公网出口 IP。DirectMail 支持为 SMTP/API 发信地址限制来源 IP。[DirectMail 功能特性](https://help.aliyun.com/zh/direct-mail/product-overview/directmail-features)

生产环境字段映射如下，密码只能写入 VPS 的 root-only 环境文件，不能提交或发在聊天中：

```env
VAULT2077_SMTP_HOST=smtpdm.aliyun.com
VAULT2077_SMTP_PORT=465
VAULT2077_SMTP_USER=orders@notify.superones.top
VAULT2077_SMTP_PASSWORD=<DirectMail 控制台设置的 SMTP 密码>
VAULT2077_SMTP_FROM=orders@notify.superones.top
```

DirectMail 华东 SMTP 官方端点是 `smtpdm.aliyun.com`，端口 465 使用 SSL；阿里云 ECS 默认禁用 25，因此本项目不使用 25。认证用户名必须与发件地址一致。[SMTP 服务地址](https://help.aliyun.com/en/direct-mail/smtp-endpoints) [使用 SMTP 发送邮件](https://help.aliyun.com/zh/direct-mail/user-guide/send-emails-using-smtp)

当前 `lib/opc-payment-email.ts` 已符合这组传输参数：465 使用隐式 TLS、校验证书、SMTP 用户名/密码认证，并从环境变量读取发件地址。仅替换 SMTP 服务商不需要重写传输层。

### 4. 邮件内容和验收

- 只发送用户主动创建订单所直接需要的交易/状态邮件，不发送开发信或混入营销内容。DirectMail 只允许有许可来源的收件地址，禁止未经许可的垃圾邮件。[DirectMail 服务条款](https://help.aliyun.com/zh/direct-mail/direct-mail-terms-of-service)
- OPC 邮件不要嵌入联系人二维码、微信号或 QQ 信息；DirectMail 当前规则明确限制邮件正文中的微信、QQ、二维码等内容。邮件应链接回用户自己的订单状态页。[DirectMail 使用规则](https://help.aliyun.com/zh/direct-mail/getting-started/product-rules/)
- 先向 `lanzhouda@163.com` 和一个外部测试邮箱各发送一封脱敏测试邮件，核验 TLS、SPF、DKIM、DMARC 对齐、垃圾箱表现和实际到达。
- DirectMail 可提供发送统计、异步通知和事件分发。SMTP 成功只证明平台接受，不等于收件方最终到达；若以后把退信/投诉状态接入应用，需要另行设计签名回调、最小公网路由和审计，不得直接扩大现有 `/api/internal/*` 边界。[DirectMail 功能特性](https://help.aliyun.com/zh/direct-mail/product-overview/directmail-features)
- 发信量按一个收件地址计一封；同一订单同时发给用户和 owner 会计为两封。[DirectMail 计费方式](https://help.aliyun.com/zh/direct-mail/billing-methods)

## 严格使用 `@superones.top` 时的飞书方案

根域已经是飞书邮箱，因此这条路线不需要 DNS 迁移：

1. 飞书邮箱管理员创建 `orders@superones.top` 公共邮箱，并授予负责人管理/收信权限。飞书官方明确支持公共邮箱通过 SMTP 给外部业务系统发信。[飞书邮箱管理员手册](https://www.feishu.cn/hc/zh-CN/articles/207987789616-%E9%A3%9E%E4%B9%A6%E9%82%AE%E7%AE%B1%E7%AE%A1%E7%90%86%E5%91%98%E4%BD%BF%E7%94%A8%E6%89%8B%E5%86%8C)
2. 在公共邮箱设置中开启 SMTP 并按飞书界面生成/取得业务系统专用凭据；若最终改用成员邮箱，则由管理员启用第三方邮箱客户端能力，邮箱所有者在桌面飞书生成专用密码。飞书官方 SMTP 是 `smtp.feishu.cn:465`，使用 SSL；专用密码可撤销，不能使用飞书登录密码。[飞书邮箱管理员手册](https://www.feishu.cn/hc/zh-CN/articles/207987789616-%E9%A3%9E%E4%B9%A6%E9%82%AE%E7%AE%B1%E7%AE%A1%E7%90%86%E5%91%98%E4%BD%BF%E7%94%A8%E6%89%8B%E5%86%8C) [管理员开启第三方客户端](https://www.feishu.cn/hc/zh-CN/articles/360049068017//) [飞书 SMTP 参数和专用密码](https://www.feishu.cn/hc/zh-CN/articles/902478147400-%E5%9C%A8%E7%AC%AC%E4%B8%89%E6%96%B9%E9%82%AE%E7%AE%B1%E5%AE%A2%E6%88%B7%E7%AB%AF%E7%99%BB%E5%BD%95%E9%A3%9E%E4%B9%A6%E9%82%AE%E7%AE%B1)
3. 在飞书管理后台启用并验证根域 DKIM。当前公开 DNS 未发现根域 DMARC，管理员还应根据飞书管理后台当时给出的域名安全配置补齐，而不是使用通用示例值。[飞书 DKIM 配置](https://www.feishu.cn/hc/zh-CN/articles/386580981044-%E7%AE%A1%E7%90%98%E5%91%98%E4%B8%BA%E5%9F%9F%E5%90%8D%E9%85%8D%E7%BD%AE-dkim)
4. 环境字段改为 `smtp.feishu.cn`、465、完整公共邮箱地址、专用密码和相同的 `From`。

飞书路线适合马上验证低量邮件和需要收取客户回复的场景；如果订单量增长或需要独立投递统计、退信/投诉治理，应迁移到 DirectMail 子域，保持人工企业邮箱与机器事务邮件声誉隔离。

## 调研时应用基线与本次实现

SMTP 配置本身不能满足“用户下单就同时通知用户和 owner”。本次调研开始时的应用基线是：

- `lib/opc-orders/internal-store.ts` 只在后台确认到账时创建 `payment_confirmed` outbox，收件人固定为 `PRODUCTION_ADMIN_EMAIL`，即 `lanzhouda@163.com`；
- `lib/opc-payment-notifications.ts` 只消费付款确认事件；
- 当前不会在订单创建时给 owner 发信，也不会给用户发送订单创建或到账状态邮件。

本次随后已把通知扩展为四类幂等 outbox 事件：

1. `order_created` / `administrator`：订单创建后向 `lanzhouda@163.com` 发送脱敏摘要和后台安全链接；
2. `order_created` / `customer`：向用户下单时提供并验证的邮箱发送订单号、服务、金额、付款附言和同浏览器订单状态入口；
3. `payment_confirmed` / `administrator`：到账后向负责人发送付款摘要与后台链接；
4. `payment_confirmed` / `customer`：到账后向用户发送付款摘要与公开凭证入口。

四类事件使用稳定 Message-ID、事务内 outbox、事务外 SMTP worker 和 at-least-once 重试；用户收件地址只在 worker 领取事件时从加密联系人中解析，不复制到 outbox。用户与负责人使用不同模板，任一邮件失败不得改变订单和到账事实。生产配置门禁同时要求 From 属于 `superones.top` 或其子域，SMTP 用户名与 From 一致，回复地址指向负责人邮箱。

## 负责人需要完成的最小事项

采用推荐 DirectMail 路线时，负责人只需完成这些需要账号登录/二次验证的动作：

1. 在企业实名阿里云账号开通“邮件推送”，区域选华东；
2. 新建发信域 `notify.superones.top`，把控制台生成的 DNS 清单交给运维添加并等待全部验证通过；
3. 新建触发型地址 `orders@notify.superones.top`，设置 SMTP 密码；
4. 不在聊天中发送密码，把 SMTP 密码写入负责人指定的本机私密文件或密码管理器；
5. 授权向 `lanzhouda@163.com` 和测试客户邮箱各发送一封真实测试邮件。

完成后，运维可以自行核验 DNS、配置 VPS root-only 环境、发送四类真实测试邮件，并在全部门禁通过后开启付款入口。
