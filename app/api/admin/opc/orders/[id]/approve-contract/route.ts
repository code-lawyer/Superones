import { NextRequest, NextResponse } from "next/server";
import {
  adminAccessErrorResponse,
  authenticateAdminRequest,
  authenticatedAdminResponse,
  configuredAdminReauthenticationUrl,
} from "@/lib/admin-access";
import { hasRecentAdminReauthentication } from "@/lib/admin-session-store";
import { createOpcOrderLifecycle } from "@/lib/opc-order-lifecycle";
import { recordAuditEvent } from "@/lib/security-audit";
import { withPersistenceTransaction } from "@/lib/state-document-store";

export const runtime = "nodejs";
const lifecycle = createOpcOrderLifecycle({});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  let access;
  try { access = await authenticateAdminRequest(request, { mutation: true }); } catch (error) { return adminAccessErrorResponse(error); }
  const { id } = await context.params;
  const audit = { actorHash: access.session.actorHash, action: "admin.opc-order.paper-contract-approved", targetType: "opc-order", targetId: id };
  if (!hasRecentAdminReauthentication(access.session)) {
    await recordAuditEvent({ ...audit, result: "rejected", reason: "recent-reauthentication-required" });
    return authenticatedAdminResponse(access, NextResponse.json({ error: "确认纸质合同前需要重新验证管理员身份。", code: "ADMIN_REAUTH_REQUIRED", reauthenticationUrl: configuredAdminReauthenticationUrl() }, { status: 403 }));
  }
  try {
    const body = await request.json().catch(() => ({})) as { expectedUpdatedAt?: unknown };
    if (typeof body.expectedUpdatedAt !== "string") {
      await recordAuditEvent({ ...audit, result: "rejected", reason: "expected-version-required" });
      return authenticatedAdminResponse(access, NextResponse.json({ error: "订单版本无效，请刷新后台后重试。" }, { status: 409 }));
    }
    const expectedUpdatedAt = body.expectedUpdatedAt;
    const order = await withPersistenceTransaction(async () => {
      const updated = await lifecycle.approvePaperContract({ id, expectedUpdatedAt });
      await recordAuditEvent({ ...audit, result: "success", diff: { status: updated.status, expectedUpdatedAt } });
      return updated;
    });
    return authenticatedAdminResponse(access, NextResponse.json({ order }));
  } catch (error) {
    await recordAuditEvent({ ...audit, result: "failed", reason: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
    return authenticatedAdminResponse(access, NextResponse.json({ error: "该订单当前不能确认纸质合同。" }, { status: 409 }));
  }
}
