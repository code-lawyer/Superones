import { NextRequest, NextResponse } from "next/server";
import { authenticateAdminRequest, adminAccessErrorResponse } from "@/lib/admin-access";
import { adminPasskeyRejectionReason, recordRejectedAdminPasskeyEvent } from "@/lib/admin-passkey-audit";
import { hasRecentAdminReauthentication } from "@/lib/admin-session-store";
import { beginAdminPasskeyRegistration } from "@/lib/admin-passkey";
import { assertAdminMutationRequest, AdminRequestSecurityError } from "@/lib/admin-request-security";
import { withinDurableRateLimit } from "@/lib/rate-limit";
import { anonymizeClientAddress, requestClientAddress } from "@/lib/request-client";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const clientHash = anonymizeClientAddress(requestClientAddress(request));
  let auditActorHash = clientHash;
  try {
    assertAdminMutationRequest(request);
    if (!(await withinDurableRateLimit(`admin:passkey:register:${clientHash}`, 10, 60 * 60 * 1000))) {
      await recordRejectedAdminPasskeyEvent({
        actorHash: auditActorHash,
        action: "admin.passkey.register",
        targetType: "credential",
        targetId: "owner",
        reason: "ADMIN_PASSKEY_RATE_LIMITED",
      }).catch(() => undefined);
      return NextResponse.json({ error: "注册尝试过于频繁。", code: "ADMIN_PASSKEY_RATE_LIMITED" }, { status: 429 });
    }
    const body = await request.json() as { enrollmentToken?: unknown };
    const enrollmentToken = typeof body.enrollmentToken === "string" ? body.enrollmentToken.trim() : "";
    if (enrollmentToken) {
      return NextResponse.json(await beginAdminPasskeyRegistration({ enrollmentToken }));
    }
    const access = await authenticateAdminRequest(request, { mutation: true });
    auditActorHash = access.session.actorHash;
    if (!hasRecentAdminReauthentication(access.session)) {
      await recordRejectedAdminPasskeyEvent({
        actorHash: auditActorHash,
        action: "admin.passkey.register",
        targetType: "credential",
        targetId: "owner",
        reason: "ADMIN_REAUTH_REQUIRED",
      }).catch(() => undefined);
      return NextResponse.json({ error: "添加 Passkey 前需要在五分钟内重新验证。", code: "ADMIN_REAUTH_REQUIRED" }, { status: 403 });
    }
    return NextResponse.json(await beginAdminPasskeyRegistration({ actorHash: access.session.actorHash }));
  } catch (error) {
    await recordRejectedAdminPasskeyEvent({
      actorHash: auditActorHash,
      action: "admin.passkey.register",
      targetType: "credential",
      targetId: "owner",
      reason: adminPasskeyRejectionReason(error, "ADMIN_PASSKEY_REGISTRATION_REJECTED"),
    }).catch(() => undefined);
    if (error instanceof AdminRequestSecurityError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    try {
      return adminAccessErrorResponse(error);
    } catch {
      return NextResponse.json({ error: "Passkey 注册令牌无效或已过期。", code: "ADMIN_PASSKEY_REGISTRATION_REJECTED" }, { status: 401 });
    }
  }
}
