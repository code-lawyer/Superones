import { NextRequest, NextResponse } from "next/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { adminCookieName, adminCookieOptions } from "@/lib/admin-auth";
import { authenticateAdminRequest } from "@/lib/admin-access";
import { adminPasskeyRejectionReason, recordRejectedAdminPasskeyProof } from "@/lib/admin-passkey-audit";
import { finishAdminPasskeyRegistration } from "@/lib/admin-passkey";
import { getAdminPasskeyCeremony } from "@/lib/admin-passkey-store";
import { assertAdminMutationRequest, AdminRequestSecurityError } from "@/lib/admin-request-security";
import { passkeyAdminIdentity } from "@/lib/admin-identity";
import { createAdminSession, hasRecentAdminReauthentication } from "@/lib/admin-session-store";
import { anonymizeClientAddress, requestClientAddress } from "@/lib/request-client";
import { recordAuditEvent } from "@/lib/security-audit";

export const runtime = "nodejs";

class AdminPasskeyReauthenticationRequired extends Error {
  readonly code = "ADMIN_REAUTH_REQUIRED";
}

export async function POST(request: NextRequest) {
  const clientHash = anonymizeClientAddress(requestClientAddress(request));
  let auditActorHash = clientHash;
  try {
    assertAdminMutationRequest(request);
    const body = await request.json() as { ceremonyId?: unknown; response?: unknown };
    if (typeof body.ceremonyId !== "string" || !body.response || typeof body.response !== "object") {
      await recordRejectedAdminPasskeyProof({
        actorHash: auditActorHash,
        action: "admin.passkey.register",
        targetType: "credential",
        targetId: "owner",
        reason: "ADMIN_PASSKEY_RESPONSE_INVALID",
      }).catch(() => undefined);
      return NextResponse.json({ error: "Passkey 注册响应无效。", code: "ADMIN_PASSKEY_RESPONSE_INVALID" }, { status: 400 });
    }
    const ceremony = await getAdminPasskeyCeremony(body.ceremonyId, "registration");
    if (!ceremony) throw new Error("invalid-ceremony");
    let authorizeCompletion: (() => Promise<void>) | undefined;
    if (ceremony.actorHash) {
      const access = await authenticateAdminRequest(request, { mutation: true });
      auditActorHash = access.session.actorHash;
      if (access.session.actorHash !== ceremony.actorHash) throw new Error("actor-mismatch");
      authorizeCompletion = async () => {
        const currentAccess = await authenticateAdminRequest(request, { mutation: true });
        if (
          currentAccess.session.actorHash !== ceremony.actorHash
          || !hasRecentAdminReauthentication(currentAccess.session)
        ) {
          throw new AdminPasskeyReauthenticationRequired("添加 Passkey 前需要在五分钟内重新验证。");
        }
      };
    }
    const result = await finishAdminPasskeyRegistration({
      ceremonyId: body.ceremonyId,
      response: body.response as RegistrationResponseJSON,
      authorizeCompletion,
    });
    const created = await createAdminSession(passkeyAdminIdentity());
    await recordAuditEvent({
      actorHash: created.session.actorHash,
      action: "admin.passkey.register",
      targetType: "credential",
      targetId: "owner",
      result: "success",
    });
    const response = NextResponse.json({ ok: true, recoveryCodes: result.recoveryCodes });
    response.headers.set("Cache-Control", "private, no-store");
    response.cookies.set(adminCookieName(), created.token, adminCookieOptions());
    return response;
  } catch (error) {
    await recordRejectedAdminPasskeyProof({
      actorHash: auditActorHash,
      action: "admin.passkey.register",
      targetType: "credential",
      targetId: "owner",
      reason: adminPasskeyRejectionReason(error),
    }).catch(() => undefined);
    if (error instanceof AdminRequestSecurityError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof AdminPasskeyReauthenticationRequired) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    return NextResponse.json({ error: "Passkey 注册证明校验失败。", code: "ADMIN_PASSKEY_REGISTRATION_REJECTED" }, { status: 401 });
  }
}
