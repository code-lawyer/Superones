import { NextRequest } from "next/server";
import {
  adminAccessErrorResponse,
  authenticateAdminRequest,
  authenticatedAdminJson,
  configuredAdminReauthenticationUrl,
} from "@/lib/admin-access";
import { hasRecentAdminReauthentication } from "@/lib/admin-session-store";
import { getStoredContent } from "@/lib/content-store";
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
  const section = request.nextUrl.searchParams.get("section");
  if (section === "summary") {
    const content = await getStoredContent();
    return authenticatedAdminJson(access, { state: content.state });
  }
  if (section === "orders") {
    return authenticatedAdminJson(access, { orders: await listAdminOpcOrders() });
  }
  return authenticatedAdminJson(access, {
    error: "请指定有效的后台内容分区。",
  }, { status: 400 });
}

export async function POST(request: NextRequest) {
  let access;
  try {
    access = await authenticateAdminRequest(request, { mutation: true });
  } catch (error) {
    return adminAccessErrorResponse(error);
  }
  const actorHash = access.session.actorHash;
  let attemptedAction: "admin.opc-order.update" | "admin.opc-order.reconcile" = "admin.opc-order.update";
  const attemptedTargetType = "opc-order";
  let attemptedTargetId = "unknown";
  try {
    const body = await request.json() as {
      action?: unknown;
      orderId?: unknown;
      orderStatus?: unknown;
      confirm?: unknown;
    };
    if (body.action === "reconcile-opc-order") {
      attemptedAction = "admin.opc-order.reconcile";
      if (!hasRecentAdminReauthentication(access.session)) {
        return authenticatedAdminJson(access, {
          error: "查询 OPC 订单付款状态前需要重新验证管理员身份。",
          code: "ADMIN_REAUTH_REQUIRED",
          reauthenticationUrl: configuredAdminReauthenticationUrl(),
        }, { status: 403 });
      }
      const orderId = typeof body.orderId === "string" ? body.orderId : "";
      attemptedTargetId = orderId || "unknown";
      if (!orderId || body.confirm !== true) {
        return authenticatedAdminJson(access, { error: "付款状态查询需要有效订单和明确确认。" }, { status: 400 });
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

    await recordAuditEvent({
      actorHash,
      action: attemptedAction,
      targetType: attemptedTargetType,
      targetId: attemptedTargetId,
      result: "rejected",
      reason: "unsupported-admin-content-action",
    });
    return authenticatedAdminJson(access, { error: "后台不提供该内容操作。" }, { status: 400 });
  } catch (error) {
    const publicCode = error instanceof OpcAlipayProviderError
      ? error.code
      : "ADMIN_OPERATION_FAILED";
    const publicReason = error instanceof Error
      ? error.message
        .replaceAll("\u652f\u4ed8\u5b9d", "付款服务")
        .replaceAll("Alipay", "付款服务")
      : "暂时无法完成后台操作。";
    await recordAuditEvent({
      actorHash,
      action: attemptedAction,
      targetType: attemptedTargetType,
      targetId: attemptedTargetId,
      result: "failed",
      reason: publicCode,
    }).catch(() => undefined);
    return authenticatedAdminJson(access, {
      error: publicReason,
      code: publicCode,
    }, { status: error instanceof OpcAlipayProviderError ? 502 : 500 });
  }
}
