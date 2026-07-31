import { NextRequest, NextResponse } from "next/server";
import { authenticateAdminRequest, adminAccessErrorResponse } from "@/lib/admin-access";
import { adminPasskeyRejectionReason, recordRejectedAdminPasskeyEvent, type AdminPasskeyAuditAction } from "@/lib/admin-passkey-audit";
import { beginAdminPasskeyAuthentication } from "@/lib/admin-passkey";
import { assertAdminMutationRequest, AdminRequestSecurityError } from "@/lib/admin-request-security";
import { withinDurableRateLimit } from "@/lib/rate-limit";
import { anonymizeClientAddress, requestClientAddress } from "@/lib/request-client";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const clientHash = anonymizeClientAddress(requestClientAddress(request));
  let auditActorHash = clientHash;
  let auditAction: AdminPasskeyAuditAction = "admin.login";
  let auditTargetId = "passkey-login";
  try {
    assertAdminMutationRequest(request);
    if (!(await withinDurableRateLimit(`admin:passkey:authenticate:${clientHash}`, 20, 60 * 60 * 1000))) {
      await recordRejectedAdminPasskeyEvent({
        actorHash: auditActorHash,
        action: auditAction,
        targetType: "session",
        targetId: auditTargetId,
        reason: "ADMIN_PASSKEY_RATE_LIMITED",
      }).catch(() => undefined);
      return NextResponse.json({ error: "验证尝试过于频繁。", code: "ADMIN_PASSKEY_RATE_LIMITED" }, { status: 429 });
    }
    const body = await request.json() as { purpose?: unknown };
    const purpose = body.purpose === "reauthentication" ? "reauthentication" : "login";
    auditAction = purpose === "reauthentication" ? "admin.reauthenticate" : "admin.login";
    auditTargetId = purpose === "reauthentication" ? "passkey-reauthentication" : "passkey-login";
    if (purpose === "reauthentication") {
      const access = await authenticateAdminRequest(request, { mutation: true });
      auditActorHash = access.session.actorHash;
      auditTargetId = access.session.id;
      return NextResponse.json(await beginAdminPasskeyAuthentication({ purpose, actorHash: access.session.actorHash }));
    }
    return NextResponse.json(await beginAdminPasskeyAuthentication({ purpose }));
  } catch (error) {
    await recordRejectedAdminPasskeyEvent({
      actorHash: auditActorHash,
      action: auditAction,
      targetType: "session",
      targetId: auditTargetId,
      reason: adminPasskeyRejectionReason(error, "ADMIN_PASSKEY_UNAVAILABLE"),
    }).catch(() => undefined);
    if (error instanceof AdminRequestSecurityError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    try {
      return adminAccessErrorResponse(error);
    } catch {
      return NextResponse.json({ error: "无法开始 Passkey 验证。", code: "ADMIN_PASSKEY_UNAVAILABLE" }, { status: 409 });
    }
  }
}
