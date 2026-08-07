import "server-only";

import { randomUUID } from "node:crypto";
import type { OpcAlipayAmount, OpcAlipayQueryResult } from "../opc-payment-config.ts";
import {
  ensurePaperPaymentArtifacts,
  mutateOpcOrderStore,
  publicOrder,
  readOpcOrderStore,
  validResumeToken,
} from "./internal-store.ts";

export async function applyOpcAlipayTradeResult(input: {
  reference: string;
  configuredSellerId?: string;
  sellerId?: string;
  appId: string;
  tradeNo: string | null;
  tradeStatus: string;
  amount: OpcAlipayAmount | null;
  source: "notify" | "query";
}) {
  return mutateOpcOrderStore((store) => {
    const order = store.orders.find((value) => value.reference === input.reference);
    if (!order) throw new Error("OPC 订单不存在。");
    if (!input.appId || (order.payment.appId && input.appId !== order.payment.appId)) {
      throw new Error("支付宝交易应用 ID 与 OPC 订单绑定应用不一致。");
    }
    const evidenceSellerId = input.source === "notify" ? input.sellerId : input.configuredSellerId;
    if (!evidenceSellerId || !/^\d{16,32}$/.test(evidenceSellerId)) {
      throw new Error("支付宝交易商户 PID 格式无效。");
    }
    if (order.payment.sellerId && evidenceSellerId !== order.payment.sellerId) {
      throw new Error("支付宝交易商户 PID 与 OPC 订单绑定商户不一致。");
    }
    if (input.amount && input.amount.minorUnits !== order.payment.amount.minorUnits) {
      throw new Error("支付宝交易金额与 OPC 订单金额不一致。");
    }
    if (
      input.tradeNo
      && store.orders.some((value) => value.id !== order.id && value.payment.tradeNo === input.tradeNo)
    ) {
      throw new Error("支付宝交易号已关联到其他 OPC 订单。");
    }
    if (
      (input.tradeStatus === "TRADE_SUCCESS" || input.tradeStatus === "TRADE_FINISHED")
      && (!input.tradeNo || !input.amount)
    ) {
      throw new Error("支付宝已支付交易缺少交易号或金额。");
    }

    const timestamp = new Date().toISOString();
    order.payment.appId ??= input.appId;
    order.payment.sellerId = evidenceSellerId;
    order.payment.tradeNo = input.tradeNo ?? order.payment.tradeNo;
    order.payment.tradeStatus = input.tradeStatus;
    order.updatedAt = timestamp;
    if (input.source === "notify") order.payment.notifiedAt = timestamp;
    else order.payment.checkedAt = timestamp;

    if (input.tradeStatus === "TRADE_SUCCESS" || input.tradeStatus === "TRADE_FINISHED") {
      order.paidAt ??= timestamp;
      if (order.signatureMethod === "paper") {
        ensurePaperPaymentArtifacts(order, order.paidAt, input.tradeNo!);
        if (!["paid", "refund_pending", "completed", "refunded"].includes(order.status)) {
          order.status = "paid_pending_contract";
          order.cancelledAt = null;
        }
      } else {
        const contractReady = order.signature.status === "completed" && order.signature.archive.status === "archived";
        if (order.status !== "completed" && order.status !== "refunded") {
          order.status = contractReady ? "paid" : "payment_exception";
        }
        if (contractReady) order.cancelledAt = null;
      }
    }
    return publicOrder(order);
  });
}

export async function recordOpcAlipayQuery(reference: string, result: OpcAlipayQueryResult) {
  if (!result.found) {
    return applyOpcAlipayTradeResult({
      reference,
      appId: result.appId,
      configuredSellerId: result.configuredSellerId,
      tradeNo: null,
      tradeStatus: "TRADE_NOT_EXIST",
      amount: null,
      source: "query",
    });
  }
  return applyOpcAlipayTradeResult({
    reference,
    appId: result.appId,
    configuredSellerId: result.configuredSellerId,
    tradeNo: result.tradeNo,
    tradeStatus: result.tradeStatus ?? "UNKNOWN",
    amount: result.amount,
    source: "query",
  });
}

export async function claimOpcPublicPaymentQuery(reference: string, minimumIntervalMs = 15_000) {
  return mutateOpcOrderStore((store) => {
    const order = store.orders.find((value) => value.reference === reference);
    if (!order) throw new Error("OPC 订单不存在。");
    if (order.status !== "awaiting_payment" && order.status !== "payment_exception") return false;
    const now = new Date();
    const lastAttempt = order.payment.checkedAt ? new Date(order.payment.checkedAt).getTime() : 0;
    if (Number.isFinite(lastAttempt) && now.getTime() - lastAttempt < minimumIntervalMs) return false;
    // checkedAt is the time of the latest signed provider-query attempt. Claiming
    // it atomically prevents parallel tabs from fanning out provider requests.
    order.payment.checkedAt = now.toISOString();
    return true;
  });
}

export async function claimNextOpcPaymentNotification() {
  return mutateOpcOrderStore((store) => {
    const now = new Date();
    const order = store.orders.find((candidate) => candidate.notifications.some((event) => {
      const due = new Date(event.nextAttemptAt).getTime() <= now.getTime();
      const expiredLease = event.status === "sending"
        && (!event.leaseExpiresAt || new Date(event.leaseExpiresAt).getTime() <= now.getTime());
      return due && (event.status === "pending" || event.status === "failed" || expiredLease);
    }));
    if (!order) return null;
    const event = order.notifications.find((candidate) => {
      const due = new Date(candidate.nextAttemptAt).getTime() <= now.getTime();
      const expiredLease = candidate.status === "sending"
        && (!candidate.leaseExpiresAt || new Date(candidate.leaseExpiresAt).getTime() <= now.getTime());
      return due && (candidate.status === "pending" || candidate.status === "failed" || expiredLease);
    });
    if (!event || !order.paymentReceipt) return null;
    const claimId = randomUUID();
    event.status = "sending";
    event.attempts += 1;
    event.claimId = claimId;
    event.leaseExpiresAt = new Date(now.getTime() + 2 * 60_000).toISOString();
    order.updatedAt = now.toISOString();
    return {
      claimId,
      eventId: event.eventId,
      recipient: event.recipient,
      reference: order.reference,
      serviceName: order.serviceName,
      serviceCode: order.serviceCode,
      amount: order.payment.amount,
      paidAt: order.paidAt!,
      tradeNo: order.payment.tradeNo!,
    };
  });
}

export async function completeOpcPaymentNotification(eventId: string, claimId: string) {
  return mutateOpcOrderStore((store) => {
    for (const order of store.orders) {
      const event = order.notifications.find((candidate) => candidate.eventId === eventId);
      if (!event || event.claimId !== claimId) continue;
      const timestamp = new Date().toISOString();
      event.status = "sent";
      event.sentAt = timestamp;
      event.lastError = null;
      event.claimId = null;
      event.leaseExpiresAt = null;
      order.updatedAt = timestamp;
      return true;
    }
    return false;
  });
}

export async function failOpcPaymentNotification(eventId: string, claimId: string, reason: string) {
  return mutateOpcOrderStore((store) => {
    for (const order of store.orders) {
      const event = order.notifications.find((candidate) => candidate.eventId === eventId);
      if (!event || event.claimId !== claimId) continue;
      const now = new Date();
      const delayMinutes = Math.min(60, 2 ** Math.min(event.attempts, 6));
      event.status = "failed";
      event.lastError = reason.slice(0, 240);
      event.nextAttemptAt = new Date(now.getTime() + delayMinutes * 60_000).toISOString();
      event.claimId = null;
      event.leaseExpiresAt = null;
      order.updatedAt = now.toISOString();
      return true;
    }
    return false;
  });
}

export async function getOpcPaymentReceipt(reference: string, resumeToken: string) {
  const store = await readOpcOrderStore();
  const order = store.orders.find((value) => value.reference === reference);
  if (!order || !validResumeToken(order, resumeToken)) {
    throw new Error("订单凭证无效或已经过期。");
  }
  if (!order.paymentReceipt) throw new Error("该订单尚未生成付款完成凭证。");
  return order.paymentReceipt;
}
