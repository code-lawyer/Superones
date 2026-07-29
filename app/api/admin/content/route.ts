import { NextRequest } from "next/server";
import {
  adminAccessErrorResponse,
  authenticateAdminRequest,
  authenticatedAdminJson,
  configuredAdminReauthenticationUrl,
} from "@/lib/admin-access";
import { configuredAcquisitionReceiver } from "@/lib/acquisition-inbox";
import { hasRecentAdminReauthentication } from "@/lib/admin-session-store";
import { getStoredContent } from "@/lib/content-store";
import { closeCorrectionReport, listAdminCorrectionReports } from "@/lib/correction-store";
import {
  listAdminOpcOrders,
  OPC_ORDER_STATUSES,
  recordOpcAlipayQuery,
  updateOpcOrderStatus,
  type OpcOrderStatus,
} from "@/lib/opc-order-store";
import {
  OpcAlipayProviderError,
  queryOpcAlipayTrade,
} from "@/lib/opc-payment-config";
import { recordAuditEvent } from "@/lib/security-audit";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  let access;
  try {
    access = await authenticateAdminRequest(request);
  } catch (error) {
    return adminAccessErrorResponse(error);
  }
  const [content, queue, corrections, orders] = await Promise.all([
    getStoredContent(),
    configuredAcquisitionReceiver().stats(),
    listAdminCorrectionReports(),
    listAdminOpcOrders(),
  ]);
  return authenticatedAdminJson(access, { state: content.state, queue, corrections, orders });
}

export async function POST(request: NextRequest) {
  let access;
  try {
    access = await authenticateAdminRequest(request, { mutation: true });
  } catch (error) {
    return adminAccessErrorResponse(error);
  }
  const actorHash = access.session.actorHash;
  let attemptedAction: "admin.opc-order.update" | "admin.opc-order.reconcile" | "admin.correction.close" = "admin.correction.close";
  let attemptedTargetType: "opc-order" | "correction" = "correction";
  let attemptedTargetId = "unknown";
  try {
    const body = await request.json() as {
      action?: unknown;
      correctionId?: unknown;
      resolution?: unknown;
      orderId?: unknown;
      orderStatus?: unknown;
      confirm?: unknown;
    };
    if (body.action === "reconcile-opc-order") {
      attemptedAction = "admin.opc-order.reconcile";
      attemptedTargetType = "opc-order";
      if (!hasRecentAdminReauthentication(access.session)) {
        return authenticatedAdminJson(access, {
          error: "向支付宝查询 OPC 订单前需要重新验证管理员身份。",
          code: "ADMIN_REAUTH_REQUIRED",
          reauthenticationUrl: configuredAdminReauthenticationUrl(),
        }, { status: 403 });
      }
      const orderId = typeof body.orderId === "string" ? body.orderId : "";
      attemptedTargetId = orderId || "unknown";
      if (!orderId || body.confirm !== true) {
        return authenticatedAdminJson(access, { error: "支付宝订单查询需要有效订单和明确确认。" }, { status: 400 });
      }
      const order = (await listAdminOpcOrders()).find((value) => value.id === orderId);
      if (!order) return authenticatedAdminJson(access, { error: "OPC 订单不存在。" }, { status: 404 });
      const result = await queryOpcAlipayTrade(order.reference);
      const updated = await recordOpcAlipayQuery(order.reference, result);
      await recordAuditEvent({
        actorHash,
        action: "admin.opc-order.reconcile",
        targetType: "opc-order",
        targetId: orderId,
        result: "success",
        diff: {
          reference: order.reference,
          status: updated.status,
          alipayTradeStatus: result.tradeStatus ?? "TRADE_NOT_EXIST",
        },
      });
      return authenticatedAdminJson(access, { orders: await listAdminOpcOrders() });
    }

    if (body.action === "update-opc-order") {
      attemptedAction = "admin.opc-order.update";
      attemptedTargetType = "opc-order";
      if (!hasRecentAdminReauthentication(access.session)) {
        return authenticatedAdminJson(access, {
          error: "更新 OPC 订单付款状态前需要重新验证管理员身份。",
          code: "ADMIN_REAUTH_REQUIRED",
          reauthenticationUrl: configuredAdminReauthenticationUrl(),
        }, { status: 403 });
      }
      const orderId = typeof body.orderId === "string" ? body.orderId : "";
      attemptedTargetId = orderId || "unknown";
      const orderStatus = body.orderStatus as OpcOrderStatus;
      if (!orderId || !OPC_ORDER_STATUSES.includes(orderStatus) || body.confirm !== true) {
        await recordAuditEvent({
          actorHash,
          action: "admin.opc-order.update",
          targetType: "opc-order",
          targetId: orderId || "unknown",
          result: "rejected",
          reason: "invalid-or-unconfirmed-request",
        });
        return authenticatedAdminJson(access, { error: "更新 OPC 订单需要有效订单、目标状态和明确确认。" }, { status: 400 });
      }
      const updated = await updateOpcOrderStatus(orderId, orderStatus);
      await recordAuditEvent({
        actorHash,
        action: "admin.opc-order.update",
        targetType: "opc-order",
        targetId: orderId,
        result: "success",
        diff: { reference: updated.reference, status: updated.status },
      });
      return authenticatedAdminJson(access, { orders: await listAdminOpcOrders() });
    }

    attemptedTargetId = typeof body.correctionId === "string" ? body.correctionId : "unknown";
    if (
      body.action !== "close-correction"
      || typeof body.correctionId !== "string"
      || typeof body.resolution !== "string"
      || body.resolution.trim().length < 6
      || body.resolution.trim().length > 500
      || body.confirm !== true
    ) {
      await recordAuditEvent({
        actorHash,
        action: "admin.correction.close",
        targetType: "correction",
        targetId: typeof body.correctionId === "string" ? body.correctionId : "unknown",
        result: "rejected",
        reason: "invalid-or-unconfirmed-request",
      });
      return authenticatedAdminJson(access, { error: "关闭纠错需要明确确认和 6–500 字处理说明。" }, { status: 400 });
    }
    await closeCorrectionReport(body.correctionId, body.resolution.trim());
    await recordAuditEvent({
      actorHash,
      action: "admin.correction.close",
      targetType: "correction",
      targetId: body.correctionId,
      result: "success",
      diff: { status: "closed" },
    });
    return authenticatedAdminJson(access, { corrections: await listAdminCorrectionReports() });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "暂时无法完成后台操作。";
    const publicCode = error instanceof OpcAlipayProviderError
      ? error.code
      : "ADMIN_OPERATION_FAILED";
    await recordAuditEvent({
      actorHash,
      action: attemptedAction,
      targetType: attemptedTargetType,
      targetId: attemptedTargetId,
      result: "failed",
      reason: publicCode,
    }).catch(() => undefined);
    return authenticatedAdminJson(access, {
      error: reason,
      code: publicCode,
    }, { status: error instanceof OpcAlipayProviderError ? 502 : 500 });
  }
}
