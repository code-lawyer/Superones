import "server-only";

import { randomUUID } from "node:crypto";
import { PRODUCTION_ADMIN_EMAIL } from "../admin-profile.ts";
import { encryptSensitiveText } from "../sensitive-data.ts";
import {
  mutateOpcOrderStore,
  readOpcOrderStore,
  validResumeToken,
} from "./internal-store.ts";

const refundableStatuses = new Set(["payment_exception", "paid_pending_contract", "paid", "completed"]);

function publicRefundState(order: Awaited<ReturnType<typeof readOpcOrderStore>>["orders"][number]) {
  return {
    reference: order.reference,
    status: order.status,
    serviceName: order.serviceName,
    paymentAmount: order.payment.amount,
    paymentProvider: order.payment.provider,
    refundEligible: refundableStatuses.has(order.status),
    refundApplication: order.refundApplication
      ? {
          status: order.refundApplication.status,
          requestedAt: order.refundApplication.requestedAt,
        }
      : null,
    actualRefundStatus: order.refund?.status ?? null,
  };
}

function requireOwnedOrder(
  orders: Awaited<ReturnType<typeof readOpcOrderStore>>["orders"],
  reference: string,
  resumeToken: string,
) {
  const order = orders.find((candidate) => candidate.reference === reference);
  if (!order || !validResumeToken(order, resumeToken)) {
    throw new Error("订单号或订单凭证无效，请使用原下单浏览器重试。");
  }
  return order;
}

export async function lookupOpcRefundApplication(reference: string, resumeToken: string) {
  const store = await readOpcOrderStore();
  return publicRefundState(requireOwnedOrder(store.orders, reference, resumeToken));
}

export async function requestOpcRefundApplication(input: {
  reference: string;
  resumeToken: string;
  reason: string;
}) {
  return mutateOpcOrderStore((store) => {
    const order = requireOwnedOrder(store.orders, input.reference, input.resumeToken);
    if (order.refundApplication) return publicRefundState(order);
    const reason = input.reason.trim();
    if (reason.length < 10 || reason.length > 800) {
      throw new Error("请用 10 至 800 个字符说明退款原因和希望客服协助的事项。");
    }
    if (!refundableStatuses.has(order.status)) {
      throw new Error(order.status === "awaiting_payment"
        ? "该订单尚未确认到账，当前无需申请退款。"
        : "该订单当前不能新建退款申请，请联系服务人员核对状态。");
    }
    if (!order.contactEncrypted) throw new Error("该订单的联系资料已按保留期限清除，请直接联系服务人员。");

    const timestamp = new Date().toISOString();
    order.refundApplication = {
      requestId: randomUUID(),
      status: "requested",
      reasonEncrypted: encryptSensitiveText(reason),
      requestedAt: timestamp,
      updatedAt: timestamp,
    };
    const eventId = `refund-requested:administrator:${order.id}`;
    if (!order.notifications.some((event) => event.eventId === eventId)) {
      order.notifications.push({
        eventId,
        eventType: "refund_requested",
        audience: "administrator",
        recipient: PRODUCTION_ADMIN_EMAIL,
        status: "pending",
        attempts: 0,
        nextAttemptAt: timestamp,
        sentAt: null,
        lastError: null,
        claimId: null,
        leaseExpiresAt: null,
      });
    }
    order.updatedAt = timestamp;
    return publicRefundState(order);
  });
}
