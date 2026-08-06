import { NextRequest, NextResponse } from "next/server";
import {
  adminAccessErrorResponse,
  authenticateAdminRequest,
  authenticatedAdminResponse,
  configuredAdminReauthenticationUrl,
} from "@/lib/admin-access";
import { hasRecentAdminReauthentication } from "@/lib/admin-session-store";
import { createOpcOrderLifecycle } from "@/lib/opc-order-lifecycle";
import { queryOpcAlipayRefund, requestOpcAlipayFullRefund } from "@/lib/opc-payment-config";
import { recordAuditEvent } from "@/lib/security-audit";
import { withPersistenceTransaction } from "@/lib/state-document-store";

export const runtime = "nodejs";
const lifecycle = createOpcOrderLifecycle({});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  let access;
  try { access = await authenticateAdminRequest(request, { mutation: true }); } catch (error) { return adminAccessErrorResponse(error); }
  const { id } = await context.params;
  const audit = { actorHash: access.session.actorHash, action: "admin.opc-order.full-refund", targetType: "opc-order", targetId: id };
  if (!hasRecentAdminReauthentication(access.session)) {
    await recordAuditEvent({ ...audit, result: "rejected", reason: "recent-reauthentication-required" });
    return authenticatedAdminResponse(access, NextResponse.json({ error: "发起全额退款前需要重新验证管理员身份。", code: "ADMIN_REAUTH_REQUIRED", reauthenticationUrl: configuredAdminReauthenticationUrl() }, { status: 403 }));
  }
  try {
    const body = await request.json().catch(() => ({})) as { reason?: unknown; expectedUpdatedAt?: unknown };
    if (typeof body.expectedUpdatedAt !== "string") {
      await recordAuditEvent({ ...audit, result: "rejected", reason: "expected-version-required" });
      return authenticatedAdminResponse(access, NextResponse.json({ error: "订单版本无效，请刷新后台后重试。" }, { status: 409 }));
    }
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : "纸质合同未获确认";
    const claim = await withPersistenceTransaction(async () => {
      const prepared = await lifecycle.beginFullRefund({ id, reason, expectedUpdatedAt: body.expectedUpdatedAt as string });
      await recordAuditEvent({
        ...audit,
        action: "admin.opc-order.full-refund-requested",
        result: "success",
        diff: { status: prepared.order.status, expectedUpdatedAt: body.expectedUpdatedAt },
      });
      return prepared;
    });
    if (claim.alreadyRefunded) return authenticatedAdminResponse(access, NextResponse.json({ order: claim.order }));
    let result = claim.newlyRequested
      ? await requestOpcAlipayFullRefund(claim.request)
      : await queryOpcAlipayRefund(claim.request);
    if (result.status === "not_found") result = await requestOpcAlipayFullRefund(claim.request);
    if (result.status === "processing") result = await queryOpcAlipayRefund(claim.request);
    const order = result.status === "succeeded"
      ? await withPersistenceTransaction(async () => {
          // 支付宝已经按稳定退款请求号确认成功后，本地落账只校验退款
          // 请求本身；邮件 outbox 等无关更新时间不能阻断退款事实写回。
          const completed = await lifecycle.confirmFullRefund({ id, ...result });
          await recordAuditEvent({
            ...audit,
            action: "admin.opc-order.full-refund-confirmed",
            result: "success",
            diff: { status: completed.status, amount: claim.request.amount.decimal, requestNo: claim.request.refundRequestNo },
          });
          return completed;
        })
      : claim.order;
    return authenticatedAdminResponse(access, NextResponse.json({ order }));
  } catch (error) {
    await recordAuditEvent({ ...audit, result: "failed", reason: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
    return authenticatedAdminResponse(access, NextResponse.json({ error: "全额退款尚未获得支付宝成功确认，订单保持退款处理中。" }, { status: 502 }));
  }
}
