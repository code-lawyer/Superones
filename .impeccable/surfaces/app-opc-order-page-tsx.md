---
version: 1
slug: "app-opc-order-page-tsx"
primary_target: "app/opc/order/page.tsx"
related_targets: ["components/opc-order-entry.tsx","components/opc-fee-note-popover.tsx","app/institutional-opc.css"]
---

Scope: 基础设施与专项服务共用的 OPC 下单登记页面。Visitor mode: Operate.

Audience: 已经选定一项 OPC 标准服务、准备签约下单的用户。Job: 核对已选服务、价格与周期，选择自然人或法人签约，填写签约方与联系方式，同意条款后进入独立签署页面；签署核验完成后再进入付款页面。

Primary action: 电子签约与付款生产配置完整时生成待签署订单并前往托管签署页面；签署完成后返回站内核验并进入付款页面。配置缺失时不创建订单，并在表单区域说明当前状态。Secondary action: 返回原服务详情，并保留目录视图与服务标识。

Proof and content: 已选服务名称、服务编号、公开价格、预计周期、简要交付结果，以及价格旁问号触发的费用说明浮层。不得展示目录版本、内部状态、管理字段或第三方公司名称；费用说明在点击页面其他位置或按 Escape 后关闭。

Direction: 延续 OPC 档案式线性结构，以一条主分隔线组织“服务核对”和“签约信息”两种任务。桌面端左右分工，移动端上下串联；不使用卡片阵列、圆角容器或新的颜色语言。表单保持真实错误、加载、超时、签署返回和付款跳转状态，所有用户可见签署与付款文案使用中性术语。

Unresolved: 无。
