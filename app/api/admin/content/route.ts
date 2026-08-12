import { NextRequest } from "next/server";
import {
  adminAccessErrorResponse,
  authenticateAdminRequest,
  authenticatedAdminJson,
  configuredAdminReauthenticationUrl,
} from "@/lib/admin-access";
import { hasRecentAdminReauthentication } from "@/lib/admin-session-store";
import { getStoredContent } from "@/lib/content-store";
import { listAdminOpcOrders, updateOpcOrderStatus } from "@/lib/opc-orders/admin";
import { OPC_ORDER_STATUSES, type OpcOrderStatus } from "@/lib/opc-orders/model";
import { reconcileOpcSignatureFlow } from "@/lib/opc-esign-reconciliation";
import { recordAuditEvent } from "@/lib/security-audit";
import { withPersistenceTransaction } from "@/lib/state-document-store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  let access;
  try { access = await authenticateAdminRequest(request); } catch (error) { return adminAccessErrorResponse(error); }
  const section = request.nextUrl.searchParams.get("section");
  if (section === "summary") return authenticatedAdminJson(access, { state: (await getStoredContent()).state });
  if (section === "orders") return authenticatedAdminJson(access, { orders: await listAdminOpcOrders() });
  return authenticatedAdminJson(access, { error: "请指定有效的后台内容分区。" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  let access;
  try { access = await authenticateAdminRequest(request, { mutation: true }); } catch (error) { return adminAccessErrorResponse(error); }
  const actorHash = access.session.actorHash;
  let action: "admin.opc-order.update" | "admin.opc-order.signature-reconcile" = "admin.opc-order.update";
  let targetId = "unknown";
  try {
    const body = await request.json() as { action?: unknown; orderId?: unknown; orderStatus?: unknown; expectedUpdatedAt?: unknown; confirm?: unknown };
    if (body.action === "reconcile-opc-signature") {
      action = "admin.opc-order.signature-reconcile";
      if (!hasRecentAdminReauthentication(access.session)) {
        await recordAuditEvent({ actorHash, action, targetType: "opc-order", targetId, result: "rejected", reason: "recent-reauthentication-required" });
        return authenticatedAdminJson(access, { error: "查询 OPC 订单签署状态前需要重新验证管理员身份。", code: "ADMIN_REAUTH_REQUIRED", reauthenticationUrl: configuredAdminReauthenticationUrl() }, { status: 403 });
      }
      targetId = typeof body.orderId === "string" ? body.orderId : "unknown";
      const order = (await listAdminOpcOrders()).find((value) => value.id === targetId);
      if (!order?.signature.flowId || body.confirm !== true) return authenticatedAdminJson(access, { error: "签署状态查询需要有效订单、签署流程和明确确认。" }, { status: 400 });
      await withPersistenceTransaction(async () => {
        const signature = await reconcileOpcSignatureFlow(order.signature.flowId!);
        await recordAuditEvent({ actorHash, action, targetType: "opc-order", targetId, result: "success", diff: { reference: order.reference, signatureStatus: signature.signatureStatus, archiveStatus: signature.archive.status } });
      });
      return authenticatedAdminJson(access, { orders: await listAdminOpcOrders() });
    }
    if (body.action === "update-opc-order") {
      if (!hasRecentAdminReauthentication(access.session)) return authenticatedAdminJson(access, { error: "更新 OPC 订单前需要重新验证管理员身份。", code: "ADMIN_REAUTH_REQUIRED", reauthenticationUrl: configuredAdminReauthenticationUrl() }, { status: 403 });
      targetId = typeof body.orderId === "string" ? body.orderId : "unknown";
      const status = body.orderStatus as OpcOrderStatus;
      if (!OPC_ORDER_STATUSES.includes(status) || !["cancelled", "completed"].includes(status) || typeof body.expectedUpdatedAt !== "string" || body.confirm !== true) {
        return authenticatedAdminJson(access, { error: "更新 OPC 订单需要有效订单、目标状态和明确确认。" }, { status: 400 });
      }
      await withPersistenceTransaction(async () => {
        const updated = await updateOpcOrderStatus(targetId, status, body.expectedUpdatedAt as string);
        await recordAuditEvent({ actorHash, action, targetType: "opc-order", targetId, result: "success", diff: { reference: updated.reference, status: updated.status } });
      });
      return authenticatedAdminJson(access, { orders: await listAdminOpcOrders() });
    }
    return authenticatedAdminJson(access, { error: "后台不提供该内容操作。" }, { status: 400 });
  } catch (error) {
    await recordAuditEvent({ actorHash, action, targetType: "opc-order", targetId, result: "failed", reason: error instanceof Error ? error.name : "unknown" }).catch(() => undefined);
    return authenticatedAdminJson(access, { error: "暂时无法完成后台操作。", code: "ADMIN_OPERATION_FAILED" }, { status: 500 });
  }
}
