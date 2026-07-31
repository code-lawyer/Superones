import { NextRequest, NextResponse } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { adminCookieName, adminCookieOptions } from "@/lib/admin-auth";
import { authenticateAdminRequest } from "@/lib/admin-access";
import { adminPasskeyRejectionReason, recordRejectedAdminPasskeyProof, type AdminPasskeyAuditAction } from "@/lib/admin-passkey-audit";
import { finishAdminPasskeyAuthentication } from "@/lib/admin-passkey";
import { assertAdminMutationRequest, AdminRequestSecurityError } from "@/lib/admin-request-security";
import { createAdminSession, markAdminSessionReauthenticated } from "@/lib/admin-session-store";
import { anonymizeClientAddress, requestClientAddress } from "@/lib/request-client";
import { recordAuditEvent } from "@/lib/security-audit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const clientHash = anonymizeClientAddress(requestClientAddress(request));
  let auditActorHash = clientHash;
  let auditAction: AdminPasskeyAuditAction = "admin.login";
  let auditTargetId = "passkey-login";
  try {
    assertAdminMutationRequest(request);
    const body = await request.json() as { ceremonyId?: unknown; purpose?: unknown; response?: unknown };
    if (
      typeof body.ceremonyId !== "string"
      || !body.response
      || typeof body.response !== "object"
      || !["login", "reauthentication"].includes(String(body.purpose))
    ) {
      await recordRejectedAdminPasskeyProof({
        actorHash: auditActorHash,
        action: auditAction,
        targetType: "session",
        targetId: auditTargetId,
        reason: "ADMIN_PASSKEY_RESPONSE_INVALID",
      }).catch(() => undefined);
      return NextResponse.json({ error: "Passkey 验证响应无效。", code: "ADMIN_PASSKEY_RESPONSE_INVALID" }, { status: 400 });
    }
    const purpose = body.purpose as "login" | "reauthentication";
    auditAction = purpose === "reauthentication" ? "admin.reauthenticate" : "admin.login";
    auditTargetId = purpose === "reauthentication" ? "passkey-reauthentication" : "passkey-login";
    const access = purpose === "reauthentication"
      ? await authenticateAdminRequest(request, { mutation: true })
      : null;
    if (access) {
      auditActorHash = access.session.actorHash;
      auditTargetId = access.session.id;
    }
    const identity = await finishAdminPasskeyAuthentication({
      ceremonyId: body.ceremonyId,
      purpose,
      response: body.response as AuthenticationResponseJSON,
      actorHash: access?.session.actorHash,
    });
    if (access) {
      const session = await markAdminSessionReauthenticated(access.token, identity.authenticatedAt);
      if (!session) throw new Error("session-expired");
      await recordAuditEvent({ actorHash: session.actorHash, action: "admin.reauthenticate", targetType: "session", targetId: session.id, result: "success", diff: { mode: "passkey" } });
      const response = NextResponse.json({ ok: true });
      response.cookies.set(adminCookieName(), access.token, adminCookieOptions());
      return response;
    }
    const created = await createAdminSession(identity);
    await recordAuditEvent({ actorHash: created.session.actorHash, action: "admin.login", targetType: "session", targetId: created.session.id, result: "success", diff: { mode: "passkey" } });
    const response = NextResponse.json({ ok: true, role: created.session.role });
    response.cookies.set(adminCookieName(), created.token, adminCookieOptions());
    return response;
  } catch (error) {
    await recordRejectedAdminPasskeyProof({
      actorHash: auditActorHash,
      action: auditAction,
      targetType: "session",
      targetId: auditTargetId,
      reason: adminPasskeyRejectionReason(error),
    }).catch(() => undefined);
    if (error instanceof AdminRequestSecurityError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Passkey 身份校验失败。", code: "ADMIN_PASSKEY_AUTHENTICATION_REJECTED" }, { status: 401 });
  }
}
