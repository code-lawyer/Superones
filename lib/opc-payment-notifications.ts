import "server-only";

import {
  claimNextOpcPaymentNotification,
  completeOpcPaymentNotification,
  failOpcPaymentNotification,
} from "./opc-orders/payment.ts";
import { ADMIN_ORIGIN } from "./legal-profile.ts";

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
    const lines = [
      "OPC 订单已完成支付宝付款核验。",
      "",
      `订单号：${claim.reference}`,
      `服务：${claim.serviceName}（${claim.serviceCode}）`,
      `金额：人民币 ${claim.amount.decimal} 元`,
      `付款时间：${claim.paidAt}`,
      `支付宝交易号：${claim.tradeNo}`,
      "",
      "完整客户、签约方和寄送资料仅在受保护的管理后台查看：",
      `${ADMIN_ORIGIN}/admin#opc-order-${encodeURIComponent(claim.reference)}`,
    ];
    try {
      await sender.send({
        to: claim.recipient,
        subject: `【OPC 付款通知】${claim.reference} · ${claim.amount.decimal} 元`,
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
