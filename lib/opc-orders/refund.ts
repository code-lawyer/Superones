import "server-only";

import type { OpcAlipayAmount } from "../opc-payment-config.ts";
import {
  assertExpectedUpdatedAt,
  mutateOpcOrderStore,
  publicOrder,
} from "./internal-store.ts";

export async function beginOpcFullRefund(id: string, reason: string, expectedUpdatedAt?: string) {
  return mutateOpcOrderStore((store) => {
    const order = store.orders.find((value) => value.id === id);
    if (!order) throw new Error("OPC 订单不存在。");
    assertExpectedUpdatedAt(order, expectedUpdatedAt);
    if (order.payment.provider !== "alipay") throw new Error("线下转账订单不能通过支付宝原路退款。");
    if (order.refund?.status === "succeeded" || order.status === "refunded") {
      return { alreadyRefunded: true as const, order: publicOrder(order), request: null };
    }
    if (order.signatureMethod !== "paper") throw new Error("该操作只适用于纸质签约订单。");
    if (!["paid_pending_contract", "paid", "refund_pending"].includes(order.status)) {
      throw new Error(`订单不能从 ${order.status} 发起退款。`);
    }
    if (!order.payment.tradeNo || !order.paidAt) throw new Error("订单缺少已核验的支付宝交易信息。");
    if (order.refund?.status === "pending") {
      return {
        alreadyRefunded: false as const,
        newlyRequested: false as const,
        order: publicOrder(order),
        request: {
          reference: order.reference,
          tradeNo: order.payment.tradeNo,
          refundRequestNo: order.refund.requestNo,
          reason: order.refund.reason,
          amount: order.refund.amount,
        },
      };
    }
    const timestamp = new Date().toISOString();
    order.refund ??= {
      status: "pending",
      requestNo: `RF-${order.reference.replaceAll("-", "")}`,
      reason: reason.trim().slice(0, 200) || "纸质合同未获确认",
      amount: order.payment.amount,
      requestedAt: timestamp,
      completedAt: null,
    };
    order.status = "refund_pending";
    order.updatedAt = timestamp;
    return {
      alreadyRefunded: false as const,
      newlyRequested: true as const,
      order: publicOrder(order),
      request: {
        reference: order.reference,
        tradeNo: order.payment.tradeNo,
        refundRequestNo: order.refund.requestNo,
        reason: order.refund.reason,
        amount: order.refund.amount,
      },
    };
  });
}

export async function completeOpcFullRefund(input: {
  id: string;
  reference: string;
  refundRequestNo: string;
  amount: OpcAlipayAmount;
  expectedUpdatedAt?: string;
}) {
  return mutateOpcOrderStore((store) => {
    const order = store.orders.find((value) => value.id === input.id);
    if (!order) throw new Error("OPC 订单不存在。");
    assertExpectedUpdatedAt(order, input.expectedUpdatedAt);
    if (order.status === "refunded" && order.refund?.status === "succeeded") return publicOrder(order);
    if (!order.refund || order.status !== "refund_pending") throw new Error("订单没有待确认的退款请求。");
    if (order.reference !== input.reference || order.refund.requestNo !== input.refundRequestNo) {
      throw new Error("支付宝退款结果与订单退款请求不一致。");
    }
    if (input.amount.minorUnits !== order.payment.amount.minorUnits) {
      throw new Error("支付宝退款金额不是订单全额，不能标记为已退款。");
    }
    const timestamp = new Date().toISOString();
    order.refund.status = "succeeded";
    order.refund.completedAt = timestamp;
    order.status = "refunded";
    order.refundedAt = timestamp;
    order.updatedAt = timestamp;
    return publicOrder(order);
  });
}

export type OpcPaymentCancellationEvidence =
  | { provider: "alipay"; kind: "provider_closed"; providerTradeStatus: "TRADE_CLOSED" }
  | { provider: "alipay"; kind: "expired_not_found"; requestCreatedAt: string; linkExpiredAt: string };

export async function cancelAwaitingOpcBankTransferOrder(id: string, expectedUpdatedAt: string) {
  return mutateOpcOrderStore((store) => {
    const order = store.orders.find((value) => value.id === id);
    if (!order) throw new Error("OPC 订单不存在。");
    assertExpectedUpdatedAt(order, expectedUpdatedAt);
    if (
      order.payment.provider !== "bank_transfer"
      || order.signatureMethod !== "online"
      || order.status !== "awaiting_payment"
      || order.payment.tradeNo
    ) {
      throw new Error("只有尚未确认到账的线下转账订单可以取消。");
    }
    const timestamp = new Date().toISOString();
    order.status = "cancelled";
    order.cancelledAt = timestamp;
    order.updatedAt = timestamp;
    return publicOrder(order);
  });
}

export async function cancelAwaitingOpcOrderWithProviderEvidence(
  id: string,
  expectedUpdatedAt: string,
  evidence: OpcPaymentCancellationEvidence,
) {
  if (evidence.provider !== "alipay") throw new Error("待付款订单取消证据无效。");
  if (evidence.kind === "provider_closed" && evidence.providerTradeStatus !== "TRADE_CLOSED") {
    throw new Error("缺少支付宝关单成功证据，不能取消待付款订单。");
  }
  return mutateOpcOrderStore((store) => {
    const order = store.orders.find((value) => value.id === id);
    if (!order) throw new Error("OPC 订单不存在。");
    assertExpectedUpdatedAt(order, expectedUpdatedAt);
    if (order.status !== "awaiting_payment") throw new Error("只有待付款订单可以在支付宝关单后取消。");
    if (evidence.kind === "expired_not_found") {
      if (order.payment.requestCreatedAt !== evidence.requestCreatedAt) {
        throw new Error("支付宝过期证据与订单当前支付会话不匹配。");
      }
      const requestCreatedAt = Date.parse(evidence.requestCreatedAt);
      const expectedExpiry = requestCreatedAt + 30 * 60 * 1_000;
      if (
        !Number.isFinite(requestCreatedAt)
        || evidence.linkExpiredAt !== new Date(expectedExpiry).toISOString()
        || Date.now() < expectedExpiry + 60 * 1_000
      ) {
        throw new Error("支付宝交易不存在，但绝对付款期限尚未安全结束。");
      }
    }
    const timestamp = new Date().toISOString();
    order.status = "cancelled";
    order.cancelledAt = timestamp;
    order.updatedAt = timestamp;
    return publicOrder(order);
  });
}
