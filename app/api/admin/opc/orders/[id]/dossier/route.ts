import { NextRequest, NextResponse } from "next/server";
import {
  adminAccessErrorResponse,
  authenticateAdminRequest,
  authenticatedAdminResponse,
  configuredAdminReauthenticationUrl,
} from "@/lib/admin-access";
import { hasRecentAdminReauthentication } from "@/lib/admin-session-store";
import { createOpcOrderLifecycle } from "@/lib/opc-order-lifecycle";
import { listAuditEventsForTarget, recordAuditEvent } from "@/lib/security-audit";

export const runtime = "nodejs";
const lifecycle = createOpcOrderLifecycle({});

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  let access;
  try { access = await authenticateAdminRequest(request); } catch (error) { return adminAccessErrorResponse(error); }
  const { id } = await context.params;
  const audit = { actorHash: access.session.actorHash, action: "admin.opc-order.dossier-view", targetType: "opc-order", targetId: id };
  if (!hasRecentAdminReauthentication(access.session)) {
    await recordAuditEvent({ ...audit, result: "rejected", reason: "recent-reauthentication-required" });
    return authenticatedAdminResponse(access, NextResponse.json({
      error: "查看完整订单资料前需要重新验证管理员身份。",
      code: "ADMIN_REAUTH_REQUIRED",
      reauthenticationUrl: configuredAdminReauthenticationUrl(),
    }, { status: 403 }));
  }
  try {
    const dossier = await lifecycle.readAdminSensitiveDossier({ id });
    await recordAuditEvent({ ...audit, result: "success", diff: { reference: dossier.reference } });
    const auditTrail = await listAuditEventsForTarget("opc-order", id);
    return authenticatedAdminResponse(access, NextResponse.json({ dossier: { ...dossier, auditTrail } }, { headers: { "Cache-Control": "private, no-store" } }));
  } catch (error) {
    await recordAuditEvent({ ...audit, result: "failed", reason: error instanceof Error ? error.name : "unknown" });
    return authenticatedAdminResponse(access, NextResponse.json({ error: "订单资料不存在或已按保留期清除。" }, { status: 404 }));
  }
}
