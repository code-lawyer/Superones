---
type: plan
status: superseded
updated: 2026-08-10
---

# OPC 全额预付与纸质合同线上实施方案

> 新公开订单已由 ADR-0020 改为在线确认协议与线下对公转账；本文仅保留既有 ADR-0019 订单的历史实现背景。

## 1. 目标

把 OPC 标准服务改造成可重复、可审计的全额预付订单：用户在线选择纸质签约、确认在线订单及预付款协议、通过支付宝企业商户支付全款；支付后系统等待运营方在后台提交一个纸质合同结论，再放行服务或发起全额原路退款。

本方案只设计和实施线上页面、协议确认、订单、支付、退款、后台状态、隐私与审计。合同打印、寄送、签收、返寄、提醒、原件核验和线下归档均不在范围内。

## 2. 固定产品规则

1. 签约方式区域只显示两个按钮：“电子签约”“纸质签约”。
2. “电子签约”使用原生禁用按钮和灰色视觉，不显示“筹备中”“暂未开放”“当前可用”等解释。
3. “纸质签约”可选；当前创建的订单一律保存 `signatureMethod=paper`。
4. 用户付款前完整阅读并主动确认在线订单及预付款协议；支付成功时该在线协议成立。
5. 用户一次性支付服务公开价对应的全款，不收打印费、寄送费、手续费或其他纸质签约附加费。
6. 支付到账后不自动启动服务；只有后台记录纸质合同门禁通过后才可履约。
7. 纸质合同未完成时由后台发起全额原路退款；退款未被支付宝确认前不得显示“已退款”。
8. 电子签约代码保留但与当前入口、支付门禁和部署门禁解耦。
9. 支付宝动态收银台金额由服务器固定，用户没有输入或修改金额的入口；服务器仍对通知和查询中的金额做防串单核对。
10. 首次验真到账后，系统生成用户和后台共用的不可变付款凭证与唯一邮件 outbox，并以稳定 Message-ID 向 `lanzhouda@163.com` 进行 at-least-once 投递。
11. 付款凭证可以下载为 PNG 图片，图片正文包含规范网址、ICP 备案号、凭证编号和校验摘要；付款凭证不替代发票。

## 3. 页面流程

### 3.1 下单页

页面顺序固定为：

```text
服务快照
-> 签约方式按钮
-> 签约主体与联系人
-> 寄送地址
-> 在线订单及预付款协议摘要、全文和下载
-> 主动勾选确认
-> 同意协议并支付全款
```

“电子签约”按钮只依靠禁用状态表达不可操作，不附加状态标签。纸质签约按钮被选中后才显示寄送地址字段。由于当前只有纸质签约可操作，可以默认选中纸质签约，但仍必须把选择值提交给服务器，服务器拒绝任何非 `paper` 值。

付款按钮附近直接展示：订单总价、真实收款主体、支付成功后在线协议成立、纸质合同确认前不启动服务、未完成纸质签约时全额原路退款且不扣费用。重大内容不能只藏在协议链接或勾选框中。

### 3.2 支付返回与订单恢复

支付宝同步返回页只显示“正在核验付款”，随后调用服务器恢复接口。服务器主动查询或等待异步通知后返回以下公开状态：

| 内部状态 | 用户文案 | 可执行动作 |
| --- | --- | --- |
| `awaiting_payment` | 等待付款确认 | 继续付款、重新核验 |
| `payment_exception` | 付款需要人工核对 | 联系客服，不重复付款 |
| `paid_pending_contract` | 已付款，合同处理中 | 查看订单与退款规则 |
| `paid` | 合同已确认，服务将按约启动 | 查看订单 |
| `refund_pending` | 已发起全额退款 | 查看退款状态 |
| `refunded` | 已全额退款 | 查看退款交易信息 |
| `completed` | 服务已完成 | 查看订单 |
| `cancelled` | 订单已关闭 | 返回服务目录 |

公开页面不显示内部备注、地址全文、合同核验细节或线下任务信息。

### 3.3 付款凭证

首次验真到账后，返回页显示独立付款凭证区。凭证数据来自服务器在到账事务中冻结的快照，不从当前服务目录、客户端状态或 URL 查询参数重新拼装。

凭证至少显示：

- 凭证编号、订单号和付款状态；
- 服务编号、服务名称、范围摘要和服务修订；
- 实付金额、币种、付款时间、支付宝交易号；
- 我方名称“上海睿诚明达咨询管理有限公司”；
- 我方统一社会信用代码 `91310000MAC3G0M33G`；
- 用户签约主体类型、姓名或组织全称、组织统一社会信用代码和法定代表人；
- 遮罩后的联系人手机号与寄送地址；
- 规范网址 `https://superones.top`、不含秘密参数的凭证路径；
- ICP 备案号“沪ICP备2026003401号-1”；
- 凭证生成时间、凭证快照 SHA-256 的短校验码；
- “本凭证为付款确认，不替代发票”的说明。

用户通过有效订单恢复凭证访问付款凭证，页面提供“下载付款凭证图片”。图片由共享渲染器按固定 1400 像素宽度生成，所有文字、网址和备案号都绘制在图片正文中，不依赖浏览器地址栏截图。图片不得包含恢复令牌、Cookie、完整手机号或完整寄送地址。

## 4. 深模块设计

新建或重构 `lib/opc-order-lifecycle.ts`，把状态迁移、幂等、金额核对、协议快照、支付与退款规则集中在一个模块。路由只做身份/来源校验、请求解析和响应映射；不得直接写状态。

```ts
type OpcOrderLifecycle = {
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult>;
  readResumedOrder(input: ResumeCheckoutInput): Promise<PublicOrderResult>;
  applyPaymentEvidence(input: VerifiedPaymentEvidence): Promise<TransitionResult>;
  applyActivePaymentQuery(input: VerifiedPaymentQuery): Promise<TransitionResult>;
  claimPublicPaymentQuery(input: PaymentQueryClaim): Promise<boolean>;
  approvePaperContract(input: ContractDecisionInput): Promise<TransitionResult>;
  beginFullRefund(input: RefundRequestInput): Promise<RefundClaim>;
  confirmFullRefund(input: VerifiedRefundEvidence): Promise<TransitionResult>;
  completeOrder(input: CompleteOrderInput): Promise<TransitionResult>;
  readPaymentReceipt(input: ReceiptAccessInput): Promise<PaymentReceipt>;
  readAdminOrderDossier(input: AdminDossierInput): Promise<AdminOrderDossier>;
  readAdminSensitiveDossier(input: AdminDossierInput): Promise<AdminSensitiveDossier>;
};
```

支付宝验签、查询、退款和退款查询保留在 `lib/opc-payment-config.ts` 的外部适配器；订单生命周期模块只接收已验证的证据对象。状态文档存储继续作为持久化实现，生产使用 PostgreSQL，开发使用文件适配器。

`applyPaymentEvidence` 首次确认到账时在同一事务中完成三件事：推进订单状态、冻结付款凭证快照、写入 `payment_confirmed` outbox 事件。邮件发送由事务外 worker 完成，失败只重试 outbox，不回滚付款状态，也不阻塞支付宝回调。

`lib/opc-order-notifications.ts` 的接口只接受稳定订单事件。生产使用 TLS SMTP 邮件适配器，测试使用内存适配器；收件人固定复用 `PRODUCTION_ADMIN_EMAIL`，即 `lanzhouda@163.com`。`lib/opc-payment-receipt-image.ts` 从同一不可变凭证快照生成公开页和后台共用的 PNG，页面与后台不得各自重新计算业务字段。

## 5. 订单数据

订单存储升级一个显式版本，并新增以下字段：

```text
signatureMethod: paper | electronic
checkoutAgreement:
  version
  title
  text
  sha256
  acceptedAt
deliveryEncrypted
paperContractApprovedAt
refund:
  requestNo
  amount
  reason
  requestedAt
  status
  completedAt?
paymentReceipt:
  receiptId
  receiptNumber
  reference
  paymentStatus: verified_paid
  snapshotSha256
  generatedAt
  operator
  customer
  service
  payment
notifications[]:
  eventId
  eventType
  recipient
  status
  attempts
  nextAttemptAt
  sentAt?
```

当前新订单只允许 `signatureMethod=paper`。旧电子签订单按旧字段读取并继续可追溯，不原地伪装成纸质订单；迁移解析器根据旧状态生成兼容只读视图。

## 6. 路由变更

| 文件 | 目标变更 |
| --- | --- |
| `app/api/opc/orders/route.ts` | 验证纸质签约、地址和协议版本；创建待付款订单并直接返回支付宝付款地址，不再创建 e签宝流程 |
| `app/api/opc/orders/[reference]/resume/route.ts` | 对待付款订单生成短期付款会话；对已付款订单返回公开状态，不再调和电子签状态 |
| `app/api/opc/alipay/notify/route.ts` | 验真后调用订单生命周期模块，把到账推进为 `paid_pending_contract` |
| `app/api/opc/orders/[reference]/receipt/route.ts` | 通过订单恢复凭证读取付款凭证，不返回完整敏感字段 |
| `app/api/admin/opc/orders/[id]/approve-contract/route.ts` | 最近再认证后确认收到并核验纸质合同 |
| `app/api/admin/opc/orders/[id]/refund/route.ts` | 最近再认证后发起或查询支付宝全额原路退款 |
| `app/api/admin/opc/orders/[id]/cancel/route.ts` | 使用订单绑定的 APPID/PID 查询支付宝并关单；只有关单成功、已关闭或绝对付款期限已过且交易不存在时才取消，并分别记录原始证据 |
| `app/api/opc/esign/*` | 保留未来电子签能力；纸质订单请求返回不适用，不参与当前入口 |

通知 worker 使用独立脚本或现有生产调度执行 `notificationOutbox`：按事件 ID claim、发送、确认，失败指数退避并告警。支付宝回调路由绝不直接等待 SMTP。

所有公开写请求继续执行同源头、自定义请求头、请求体上限、蜜罐、持久化限速和幂等检查。

## 7. 前端变更

| 文件 | 目标变更 |
| --- | --- |
| `app/opc/order/page.tsx` | 主标题改为确认订单与支付，不再出现“先签约，再付款” |
| `components/opc-order-entry.tsx` | 增加两个方式按钮、地址、协议摘要/下载和全款支付；删除创建订单后跳转 e签宝的逻辑 |
| `components/opc-sign-flow.tsx` | 从纸质下单路径移除；保留为未来电子签专用页面 |
| `app/opc/payment/return/page.tsx` | 展示服务器核验后的付款、合同门禁和退款状态 |
| `components/opc-payment-receipt.tsx` | 用同一凭证视图显示服务、金额、双方主体、网址、备案号和校验码，并提供 PNG 下载 |
| `app/admin/admin-console.tsx` | 只提供合同门禁通过、全额退款、查询支付/退款和完成服务等允许动作 |
| `app/institutional-opc.css` | 禁用电子签按钮使用灰度、禁用光标和清晰焦点规则；不得增加状态徽章或说明文案 |

后台订单详情改为一个贯通 dossier：服务/协议快照、签约主体、遮罩联系信息、付款交易、付款凭证预览与下载、合同门禁、退款和审计摘要来自同一次服务器读取。查看完整联系方式和地址仍是独立高风险动作，需要最近五分钟再认证并审计；邮件中的后台链接只指向订单，不携带客户敏感信息。

## 8. 在线协议与隐私

在线订单及预付款协议必须绑定服务修订和订单快照，至少包含：交易主体、服务内容、总价、全额预付性质、纸质合同确认前不启动服务、全额退款规则、退款时点、违约责任、争议处理和联系方式。协议必须可在付款前阅读、下载，并在订单中保存版本、哈希和确认时间。

寄送地址字段至少包含收件人、省市区、详细地址、手机号；可以使用结构化地址或一条经过长度限制的详细地址，首版不接入第三方地址联想。地址与联系人共同加密，后台默认遮罩显示，查看完整值要求最近五分钟再认证并审计。地址不得发送到分析系统或进入错误日志。

## 9. 支付与退款

- 只使用合同主体名下的支付宝企业商户能力和每订单动态收银台，不使用个人码或静态通用码。
- 创建付款会话时使用服务器保存的金额，客户端不提交可修改金额。
- 支付通知验签并核对 APPID、商户 PID、订单号、金额和成功状态；主动查询使用订单绑定 APPID 的签名凭证并验签响应，核对订单号、金额和状态，同时校验订单创建时绑定的 PID 与当前受控配置一致。查询响应本身不包含卖家 PID，不得伪造该证据字段。
- `alipay.trade.page.pay`/`wap.pay` 的金额由服务器固定；金额不一致属于安全或系统异常，不是用户正常输入行为。
- 全额退款使用原支付交易和服务器保存金额；每个订单使用稳定退款请求号保证幂等。
- 网络超时不能直接重试为新退款请求，应先查询原退款请求结果。
- 退款失败保持 `refund_pending` 并告警，不允许后台手工跳到 `refunded`。

## 10. 可用性与配置门禁

纸质下单入口需要以下配置全部就绪：

- `VAULT2077_OPC_PAPER_CHECKOUT_ENABLED=true`；
- `VAULT2077_OPC_PAYMENTS_ENABLED=true`；
- 在线协议版本与可下载内容；
- 支付宝生产 APPID、商户 PID、应用私钥和支付宝公钥；
- 支付、查询、退款、退款查询均通过生产验收；
- 订单持久化、敏感数据密钥环和后台审计可用。
- 付款通知 TLS 邮件适配器、outbox worker 和告警已完成真实投递测试，固定收件人为 `lanzhouda@163.com`；
- 付款凭证 HTML 与 PNG 下载已验证名称、统一社会信用代码、规范网址和 ICP 备案号来自服务器锁定配置。

`VAULT2077_OPC_ESIGN_ENABLED` 可以保持 `false`，且不得导致纸质下单关闭。任一退款门禁缺失时，真实付款入口保持关闭。

## 11. 测试矩阵

### 11.1 订单生命周期

- 创建订单只接受 `paper`，并保存协议版本、哈希和确认时间；
- 重复幂等请求返回同一订单和恢复能力，不生成第二笔付款；
- 支付成功只进入 `paid_pending_contract`，不能直接进入 `paid`；
- 只有后台合同结论可以进入 `paid`；
- 未付款可取消，已付款不得直接取消；
- 全额退款必须经过 `refund_pending` 和支付宝证据后进入 `refunded`；
- 非法状态迁移、金额不一致、商户不一致和重复通知被拒绝或幂等处理。
- 首次到账在同一事务生成唯一凭证和唯一 outbox 事件；重复通知不生成第二张凭证或第二封付款邮件。
- SMTP 暂时失败不影响到账状态，worker 使用同一事件重试，成功后不重复发送。

### 11.2 页面

- 两个签约按钮名称准确，电子签按钮只有灰色禁用状态，无状态文案；
- 键盘和读屏能识别禁用按钮，纸质签约可以选择；
- 地址仅在纸质签约路径出现且错误聚焦正确；
- 付款前可阅读和下载协议，勾选默认关闭；
- 360/768/1280/1440 无溢出，付款失败、核验中和退款中均有可恢复状态。
- 付款凭证显示正确的服务、金额、双方主体、网址和备案号；PNG 文件包含相同内容且不包含恢复令牌。

### 11.3 安全与隐私

- 客户端篡改价格、协议版本、服务修订或签约方式均失败；
- 地址密文不出现在公开响应、日志和审计详情；
- 后台完整联系信息、合同结论和退款动作要求再认证；
- 支付/退款通知伪造、重放和乱序到达不能破坏状态。

## 12. 实施批次

### 批次 A：领域与存储

1. 新增订单生命周期模块和状态迁移测试。
2. 升级订单文档版本，加入协议、纸签门禁、地址和退款字段。
3. 为旧电子签订单提供兼容读取，禁止自动迁移成新纸签订单。

### 批次 B：支付宝全链路

1. 调整支付成功目标状态。
2. 实现全额退款、退款查询、稳定退款请求号和故障重试。
3. 完成通知乱序、重复、超时和金额/商户不一致测试。
4. 在到账事务内生成不可变付款凭证和付款通知 outbox 事件。

### 批次 C：公开下单

1. 实现纯按钮状态的签约方式选择。
2. 增加地址、协议摘要/下载和主动确认。
3. 创建订单后直接跳转支付宝，重写付款返回与恢复页面。
4. 实现付款凭证页面和固定版式 PNG 下载。

### 批次 D：后台与运营线上动作

1. 增加合同门禁通过和全额退款动作。
2. 增加退款查询、错误恢复、再认证和不可变审计。
3. 更新订单筛选、状态名称、敏感字段遮罩和公开状态映射。
4. 实现订单 dossier、付款凭证预览/下载和完整信息再认证查看。
5. 实现 outbox worker、TLS 邮件适配器和 `lanzhouda@163.com` 真实投递验收。

### 批次 E：迁移与上线

1. 保持纸质下单功能开关关闭部署新版本。
2. 执行旧订单兼容读取、数据库迁移和回滚演练。
3. 沙箱验证支付、查询、退款和退款查询；再完成真实小额生产闭环并全额退款。
4. 完成协议法务审阅、四宽度/键盘验收、监控告警和隐私检查后才开放入口。

## 13. 完成标准

- 公开页面没有“筹备中”“当前可用”或同义签约方式状态文案；
- e签宝未配置时纸质订单仍可通过所有可用性检查；
- 每笔真实付款都绑定唯一订单、不可变服务快照和在线协议证据；
- 付款后服务不会在纸质合同门禁通过前启动；
- 纸质合同未完成时系统能可靠发起并确认不扣费用的全额原路退款；
- 公开端、后台、支付宝通知和主动查询共享同一订单生命周期接口；
- 首次验真到账只生成一张付款凭证，并最终只向 `lanzhouda@163.com` 发送一封付款通知；
- 用户可下载包含服务、金额、双方主体、`https://superones.top` 和“沪ICP备2026003401号-1”的付款凭证图片；
- 后台可从同一订单 dossier 查看协议、客户资料、付款、凭证、合同结论、退款和审计，并对完整敏感资料执行再认证；
- 线下寄送和核验没有被扩展成系统任务或后台工作台；
- 单元测试、接口测试、类型检查、lint、文档检查和生产构建全部通过。
