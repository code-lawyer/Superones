import "server-only";

import {
  claimNextOpcPaymentNotification,
  completeOpcPaymentNotification,
  failOpcPaymentNotification,
} from "./opc-orders/payment.ts";
import { ADMIN_ORIGIN, PUBLIC_ORIGIN } from "./legal-profile.ts";

export type OpcPaymentEmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  messageId: string;
};

export type OpcPaymentEmailSender = {
  send(message: OpcPaymentEmailMessage): Promise<void>;
};

export async function processOpcPaymentNotifications({
  sender,
  maximum = 10,
}: {
  sender: OpcPaymentEmailSender;
  maximum?: number;
}) {
  let processed = 0;
  let sent = 0;
  let failed = 0;
  for (; processed < Math.max(1, Math.min(maximum, 100)); processed += 1) {
    const claim = await claimNextOpcPaymentNotification();
    if (!claim) break;
    const isBankTransfer = claim.provider === "bank_transfer";
    const isCustomer = claim.audience === "customer";
    const isOrderCreated = claim.eventType === "order_created";
    const lines = isOrderCreated
      ? isCustomer
        ? [
            "您的 OPC 线下付款订单已创建。",
            "",
            `订单号：${claim.reference}`,
            `服务：${claim.serviceName}（${claim.serviceCode}）`,
            `金额：人民币 ${claim.amount.decimal} 元`,
            `付款附言：${claim.transferMemo ?? claim.reference}`,
            "",
            "请在原下单浏览器查看企业收款资料与订单状态：",
            `${PUBLIC_ORIGIN}/opc/payment/return?order=${encodeURIComponent(claim.reference)}`,
          ]
        : [
            "新的 OPC 线下付款订单已创建。",
            "",
            `订单号：${claim.reference}`,
            `服务：${claim.serviceName}（${claim.serviceCode}）`,
            `金额：人民币 ${claim.amount.decimal} 元`,
            "",
            "完整客户、签约方和订单资料仅在受保护的管理后台查看：",
            `${ADMIN_ORIGIN}/admin#opc-order-${encodeURIComponent(claim.reference)}`,
          ]
      : isCustomer
        ? [
            isBankTransfer ? "您的 OPC 订单已完成企业银行到账核验。" : "您的 OPC 订单已完成支付宝付款核验。",
            "",
            `订单号：${claim.reference}`,
            `服务：${claim.serviceName}（${claim.serviceCode}）`,
            `金额：人民币 ${claim.amount.decimal} 元`,
            `付款时间：${claim.paidAt}`,
            `${isBankTransfer ? "银行流水号" : "支付宝交易号"}：${claim.tradeNo}`,
            "",
            "请在原下单浏览器查看付款凭证：",
            `${PUBLIC_ORIGIN}/opc/payment/return?order=${encodeURIComponent(claim.reference)}`,
          ]
        : [
            isBankTransfer ? "OPC 订单已完成企业银行到账核验。" : "OPC 订单已完成支付宝付款核验。",
            "",
            `订单号：${claim.reference}`,
            `服务：${claim.serviceName}（${claim.serviceCode}）`,
            `金额：人民币 ${claim.amount.decimal} 元`,
            `付款时间：${claim.paidAt}`,
            `${isBankTransfer ? "银行流水号" : "支付宝交易号"}：${claim.tradeNo}`,
            "",
            "完整客户、签约方和订单资料仅在受保护的管理后台查看：",
            `${ADMIN_ORIGIN}/admin#opc-order-${encodeURIComponent(claim.reference)}`,
          ];
    try {
      await sender.send({
        to: claim.recipient,
        subject: isOrderCreated
          ? isCustomer
            ? `【SUPERONES】订单已创建 · ${claim.reference}`
            : `【OPC 新订单】${claim.reference} · ${claim.amount.decimal} 元`
          : `【OPC 付款通知】${claim.reference} · ${claim.amount.decimal} 元`,
        text: lines.join("\n"),
        messageId: `<${claim.eventId.replaceAll(":", "-")}@superones.top>`,
      });
      await completeOpcPaymentNotification(claim.eventId, claim.claimId);
      sent += 1;
    } catch (error) {
      await failOpcPaymentNotification(
        claim.eventId,
        claim.claimId,
        error instanceof Error ? error.message : "email_send_failed",
      );
      failed += 1;
    }
  }
  return { processed, sent, failed };
}
