import { NextRequest, NextResponse } from "next/server";
import { authenticateAdminRequest, adminAccessErrorResponse, authenticatedAdminJson } from "@/lib/admin-access";
import { adminPasskeyRejectionReason, recordRejectedAdminPasskeyEvent } from "@/lib/admin-passkey-audit";
import { listActiveAdminPasskeys, revokeAdminPasskey } from "@/lib/admin-passkey-store";
import { hasRecentAdminReauthentication } from "@/lib/admin-session-store";
import { anonymizeClientAddress, requestClientAddress } from "@/lib/request-client";
import { recordAuditEvent } from "@/lib/security-audit";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const access = await authenticateAdminRequest(request);
    const credentials = (await listActiveAdminPasskeys()).map(({ publicKey: _publicKey, counter: _counter, ...value }) => value);
    return authenticatedAdminJson(access, { credentials });
  } catch (error) {
    return adminAccessErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  let auditActorHash = anonymizeClientAddress(requestClientAddress(request));
  let auditTargetId = "owner";
  const auditRejected = (reason: string) => recordRejectedAdminPasskeyEvent({
    actorHash: auditActorHash,
    action: "admin.passkey.revoke",
    targetType: "credential",
    targetId: auditTargetId,
    reason,
  }).catch(() => undefined);
  try {
    const access = await authenticateAdminRequest(request, { mutation: true });
    auditActorHash = access.session.actorHash;
    if (!hasRecentAdminReauthentication(access.session)) {
      await auditRejected("ADMIN_REAUTH_REQUIRED");
      return authenticatedAdminJson(access, { error: "撤销 Passkey 前需要在五分钟内重新验证。", code: "ADMIN_REAUTH_REQUIRED" }, { status: 403 });
    }
    const body = await request.json() as { credentialId?: unknown; confirm?: unknown };
    if (typeof body.credentialId === "string") auditTargetId = body.credentialId;
    if (typeof body.credentialId !== "string" || body.confirm !== true) {
      await auditRejected("ADMIN_CONFIRMATION_REQUIRED");
      return authenticatedAdminJson(access, { error: "需要明确确认撤销。", code: "ADMIN_CONFIRMATION_REQUIRED" }, { status: 400 });
    }
    if (!(await revokeAdminPasskey(body.credentialId))) {
      await auditRejected("ADMIN_PASSKEY_NOT_FOUND");
      return authenticatedAdminJson(access, { error: "Passkey 不存在或已撤销。", code: "ADMIN_PASSKEY_NOT_FOUND" }, { status: 404 });
    }
    await recordAuditEvent({ actorHash: access.session.actorHash, action: "admin.passkey.revoke", targetType: "credential", targetId: body.credentialId, result: "success" });
    return authenticatedAdminJson(access, { ok: true });
  } catch (error) {
    await auditRejected(adminPasskeyRejectionReason(error, "ADMIN_PASSKEY_REVOKE_REJECTED"));
    try {
      return adminAccessErrorResponse(error);
    } catch {
      return NextResponse.json({ error: error instanceof Error ? error.message : "无法撤销 Passkey。", code: "ADMIN_PASSKEY_REVOKE_REJECTED" }, { status: 409 });
    }
  }
}
