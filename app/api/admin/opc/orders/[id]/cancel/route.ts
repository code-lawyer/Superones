import { NextRequest, NextResponse } from "next/server";
import {
  adminAccessErrorResponse,
  authenticateAdminRequest,
  authenticatedAdminResponse,
  configuredAdminReauthenticationUrl,
} from "@/lib/admin-access";
import { hasRecentAdminReauthentication } from "@/lib/admin-session-store";
import { cancelAwaitingOpcBankTransferOrder } from "@/lib/opc-orders/admin";
import { listAdminOpcOrders } from "@/lib/opc-orders/admin";
import { recordAuditEvent } from "@/lib/security-audit";
import { withPersistenceTransaction } from "@/lib/state-document-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  let access;
  try { access = await authenticateAdminRequest(request, { mutation: true }); } catch (error) { return adminAccessErrorResponse(error); }
  const { id } = await context.params;
  const audit = { actorHash: access.session.actorHash, action: "admin.opc-order.cancel-payment", targetType: "opc-order", targetId: id };
  if (!hasRecentAdminReauthentication(access.session)) {
    await recordAuditEvent({ ...audit, result: "rejected", reason: "recent-reauthentication-required" });
    return authenticatedAdminResponse(access, NextResponse.json({ error: "取消待付款订单前需要重新验证管理员身份。", code: "ADMIN_REAUTH_REQUIRED", reauthenticationUrl: configuredAdminReauthenticationUrl() }, { status: 403 }));
  }
  try {
    const body = await request.json().catch(() => ({})) as { expectedUpdatedAt?: unknown };
    if (typeof body.expectedUpdatedAt !== "string") {
      await recordAuditEvent({ ...audit, result: "rejected", reason: "expected-version-required" });
      return authenticatedAdminResponse(access, NextResponse.json({ error: "订单版本无效，请刷新后台后重试。" }, { status: 409 }));
    }
    const order = (await listAdminOpcOrders()).find((item) => item.id === id);
    if (!order || order.status !== "awaiting_payment") {
      await recordAuditEvent({ ...audit, result: "rejected", reason: "order-not-awaiting-payment" });
      return authenticatedAdminResponse(access, NextResponse.json({ error: "该订单当前不是待付款状态。" }, { status: 409 }));
    }
    if (order.payment.provider === "bank_transfer") {
      const updated = await withPersistenceTransaction(async () => {
        const result = await cancelAwaitingOpcBankTransferOrder(id, body.expectedUpdatedAt as string);
        await recordAuditEvent({
          ...audit,
          result: "success",
          diff: {
            reference: result.reference,
            status: result.status,
            cancellationEvidence: "bank-transfer-not-yet-verified",
          },
        });
        return result;
      });
      return authenticatedAdminResponse(access, NextResponse.json({ order: updated }));
    }
    await recordAuditEvent({ ...audit, result: "rejected", reason: "retired-payment-record-read-only" });
    return authenticatedAdminResponse(access, NextResponse.json({ error: "退役在线付款记录仅供历史查询，不能再执行渠道操作。" }, { status: 409 }));
  } catch (error) {
    await recordAuditEvent({ ...audit, result: "failed", reason: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
    return authenticatedAdminResponse(access, NextResponse.json({ error: "暂时无法安全取消该待付款订单，请稍后重试。" }, { status: 409 }));
  }
}
