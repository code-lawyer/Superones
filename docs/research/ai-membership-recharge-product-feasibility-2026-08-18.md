---
type: research
status: active
updated: 2026-08-18
---

# Vault2077 AI 会员充值产品可行性调研（2026-08-18）

## 1. 结论

Vault2077 可以把“AI 权益采购”发展为 OPC 内的新业务，但不能把消费者账号代登录、代绑卡或 Session 代操作当作正式产品。可持续的商品必须来自以下三类来源之一：

1. AI 厂商明确允许转售的礼品码或数字权益；
2. 厂商正式 reseller／channel partner 合同下的企业席位；
3. Vault2077 自己交付、按用量计费的合法 AI 应用，而不是冒充第三方个人会员。

截至 2026-08-18，没有找到 OpenAI 面向普通商户开放的 ChatGPT Plus／Pro 礼品码或消费者订阅转售计划。OpenAI 个人条款禁止出售或分发其服务，中国大陆也不在 ChatGPT 支持地区；Anthropic 明确限制向中国及受中国控制的组织销售。Apple Gift Card 存在区域绑定并禁止转售，不能作为 Vault2077 的正式供货基础。因此，“国内人民币充值 ChatGPT／Claude 个人会员”虽然需求强，却不适合作为首发商品。

GitHub 与 Microsoft 存在正式渠道伙伴体系。GitHub 的 reseller／distribution 条款要求合作协议、区域和折扣等 Channel Enrollment，并要求最终客户接受对应条款；Microsoft CSP 明确允许合作伙伴负责客户计费、配置和支持。这类企业席位比消费者代充更适合作为第一批真实商品，但必须先完成渠道签约，不能先卖后补授权。

当前建议是 **产品方向 Go，消费者代充 No-Go，授权渠道商品 Conditional Go**。

## 2. 产品定义

建议把产品定义为“AI 权益采购”，而不是泛化的“代充”：

- Vault2077 是公开卖方和售后责任方；
- 每个商品都有可核验的授权来源、适用地区、期限、税费、交付和退款规则；
- 用户只提交履约所需的最少身份，例如邮箱或厂商账号 ID；
- 永不收集密码、Cookie、Session、API key、短信验证码、恢复码或远程控制权限；
- 一单一商品、一单一支付、一单一交付，不发行 Vault 余额或可循环充值币；
- 只有服务器证据可以推进支付、库存、交付、退款和对账状态。

这与 PayAI.Plus 当前公开教程要求用户复制完整 AuthSession JSON 的模式不同。该教程自己把 Session 称为临时登录凭证；这种交付方式不应进入 Vault2077。

## 3. 官方供应路径核验

| 商品或路径 | 官方事实 | 判断 |
| --- | --- | --- |
| ChatGPT Plus／Pro 消费者会员 | OpenAI 个人条款禁止出售或分发其服务；官方支持地区列表不含中国大陆，并提示在列表外提供访问可能导致账号暂停或封禁。没有找到公开消费者礼品码或普通商户转售计划。[OpenAI 使用条款](https://openai.com/policies/terms-of-use/)、[ChatGPT 支持地区](https://help.openai.com/zh-hans-cn/articles/7947663-) | 不作为首发；只有 OpenAI 或获授权分销方书面允许面向目标地区转售时重新评估。 |
| ChatGPT Business／Enterprise | OpenAI Services Agreement 按客户自身订单和 workspace／组织 ID 配置服务；客户不得转售或出租自己的账户访问。[OpenAI Services Agreement](https://openai.com/policies/services-agreement/) | 可以帮助客户走官方采购，但不能用 Vault2077 自己的 workspace 拆席位零售。 |
| Claude Pro／Max／Team | Anthropic 支持地区不含中国；其地区政策进一步禁止向中国及受中国控制的组织销售。[Anthropic 支持地区](https://www.anthropic.com/supported-countries)、[地区销售限制](https://www.anthropic.com/news/updating-restrictions-of-sales-to-unsupported-regions) | 面向中国大陆用户 No-Go。 |
| Apple Gift Card 间接购买订阅 | Apple 礼品卡按国家／地区绑定，官方条款禁止交换或转售；异常或违规时可停用卡或账户。[Apple Gift Card 条款](https://www.apple.com/legal/internet-services/itunes/giftcards/) | 不能把跨区礼品卡倒卖作为正式供应链。 |
| Cursor 个人／Teams | Cursor 官方价格页提示只能从官网购买；Teams／Enterprise 支持集中计费或 PO，但未找到公开 reseller 条款。[Cursor Pricing](https://cursor.com/pricing) | 可做官方采购顾问；没有书面授权前不转售。 |
| GitHub Copilot Business／Enterprise | GitHub 有 Partner Program、reseller／distribution 和 indirect channel partner 合同；企业席位由组织或 enterprise 分配。[GitHub Partner Legal Terms](https://github.com/partners/legal.html)、[GitHub Copilot 企业计费](https://docs.github.com/en/copilot/concepts/billing/organizations-and-enterprises) | 首选渠道候选；先申请或接入授权 distributor。 |
| Microsoft Copilot 与相关云产品 | Microsoft CSP 模式允许合作伙伴负责客户计费、配置、管理和支持。[Microsoft Licensing Agreements](https://partner.microsoft.com/en-us/licensing/licensing-agreements) | 首选渠道候选；以 CSP 可售目录、地区和客户资格为准。 |

## 4. 中国大陆交易与消费者责任

若 Vault2077 自己收人民币并向用户交付权益，Vault2077 就是网络交易经营者和直接售后责任方，不是信息导流方。商品页至少需要公开经营主体、价格、期限、适用账号和地区、交付方式、退款条件、发票、客服和风险提示。

《消费者权益保护法》允许特定数字化商品在消费者拆封或明确确认后不适用七日无理由退货，但经营者仍需显著提示并让消费者主动确认；未交付、错误交付、无效权益和与描述不符仍需承担履约责任。[消费者权益保护法](https://www.samr.gov.cn/zfjcj/tzgg/art/2023/art_615af9ed6bcd4974bf853dd2e02bc663.html)、[消费者权益保护法实施条例](https://app.www.gov.cn/govdata/gov/202403/19/513111/article.html)

首版不应发行可储值、可分次兑付或可转让的 Vault 余额。商务部《单用途商业预付卡管理办法》把密码、串码等虚拟预付凭证纳入管理，并设置备案、业务与资金规则。[单用途商业预付卡管理办法](https://www.mofcom.gov.cn/zfxxgk/gkml/art/2012/art_d2d7a4a3390a4737ba519479d509acfa.html)

在线支付应使用网站经营公司的真实商户身份。微信 Native 支付要求商户号、已绑定的 APPID 和商户开发参数，下单后返回动态二维码；正式能力还需通知验签、主动查单、关单、退款、退款查询和对账。[微信 Native 接入准备](https://pay.wechatpay.cn/doc/v3/merchant/4015614538)、[Native 下单](https://pay.wechatpay.cn/doc/v3/merchant/4012791877)

## 5. 与 Vault2077 当前产品的关系

AI 权益属于商品库存与即时交付，不是当前 OPC 的专业服务订单。现行 OPC 规格固定三个一级入口，基础设施／专项服务使用长周期服务合同、身份证信息、线下对公转账和后台到账核验。直接复用会让两种状态机、敏感数据和售后规则互相污染。

建议仍归属 OPC 品牌，但使用独立路由和独立 module：

```text
/opc
  ├─ 当前三个服务工作台入口
  └─ /opc/ai-memberships   AI 权益采购（独立商品与订单）

digital-entitlements module
  ├─ catalog      商品、价格、授权来源和适用地区快照
  ├─ orders       无账号订单、恢复凭证和状态读取
  ├─ inventory    加密权益库存、预占、释放和唯一交付
  ├─ fulfillment  授权渠道下单／席位分配／交付证据
  ├─ payments     微信支付会话、通知、查单、退款和对账
  └─ support      补发、退款、异常和不可变审计
```

该 module 的外部 interface 应围绕业务能力，而不是暴露供应商字段。首个供应来源确定前不要预先设计通用 adapter；当第二个真实供应来源进入时，再把共同变化提升为供应 adapter seam。

建议主状态：

```text
created -> inventory_reserved -> awaiting_payment -> paid
        -> fulfillment_pending -> delivered -> redeemed/expired
        -> refund_pending -> refunded
```

权益明文必须加密保存；邮件只发送订单入口，不发送完整兑换码。用户查看权益需订单恢复凭证和邮箱二次验证。支付成功但交付失败必须进入可重试或退款状态，不能把资金事实与交付事实合并成一个布尔值。

## 6. MVP

### Phase 0：需求验证，不收款

- 建立 `/opc/ai-memberships` 说明页和需求登记；
- 让用户选择希望购买的厂商、个人／企业用途、席位数、价格接受区间和开票需求；
- 只收最少联系信息，不收任何厂商账号凭证；
- 明确页面是需求登记，不承诺库存、价格或可售地区。

### Phase 1：单一授权商品闭环

- 只上架一个已取得书面渠道授权的企业席位商品；
- 固定人民币含税价，不做余额、优惠券、转赠或多商品购物车；
- 使用企业微信 Native 商户号完成支付；
- 无账号订单、邮件二次验证、库存／席位预占、自动或受控人工交付；
- 支付通知、主动查单、交付失败、退款和日对账全部有服务器证据；
- 完成真实小额支付、重复通知、库存耗尽、交付失败、退款和恢复演练后才公开。

### Phase 2：多供应商

第二个正式渠道进入后，再统一供应 adapter、动态报价、不同交付类型和供应商 SLA。ChatGPT／Claude 消费者会员仍按各自授权与地区证据独立决策，不因其他商品上线而自动放行。

## 7. Go / No-Go 门槛

某个 AI 会员商品只有同时满足以下条件才能 Go：

1. 上游书面确认 Vault2077 或其渠道伙伴可以在目标地区向最终客户销售该权益；
2. 合同明确商品、价格、税费、区域、库存、结算、退款、品牌使用、终止与存量订单；
3. 交付不需要密码、Cookie、Session、API key、验证码、恢复码或远程控制；
4. 有正式下单／分配方法、幂等、查询、撤销或退款证据；
5. Vault2077 的营业范围、商户类目、发票、消费者条款和隐私告知通过业务与法律复核；
6. 真实支付、交付、失败、退款和对账闭环通过；
7. 新产品规格、支付与数字权益 ADR、系统规格、隐私政策、上线清单和生产门禁同步更新。

任一条件缺失时不开放收款。市场需求不能替代供货授权和履约证据。

## 8. 推荐决策

- 接受“AI 权益采购”作为 OPC 的候选新能力；
- 立即做 Phase 0 需求验证和渠道洽谈，但不接受预付款；
- 首先申请 GitHub Partner／授权 distributor 和 Microsoft CSP 相关渠道；
- 暂不销售 ChatGPT／Claude 个人会员，不采购或转售跨区 Apple Gift Card；
- 永久禁止 Session／Cookie 代充路径；
- 拿到第一个正式渠道合同后，再提交产品规格和 ADR，不提前开发通用商城。

本调研是产品与工程决策底稿，不构成法律意见，也不改变当前 OPC 三入口、线下对公转账和生产开关。
