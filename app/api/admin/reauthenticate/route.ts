import { NextRequest, NextResponse } from "next/server";
import {
  adminAccessErrorResponse,
  authenticateAdminRequest,
  authenticatedAdminJson,
  configuredAdminReauthenticationUrl,
} from "@/lib/admin-access";
import { ADMIN_REAUTH_SECONDS, adminActorHash, isValidLocalAdminPassword } from "@/lib/admin-auth";
import { adminAccessMode, readGatewayAdminIdentity } from "@/lib/admin-identity";
import {
  markAdminSessionReauthenticated,
} from "@/lib/admin-session-store";
import { recordAuditEvent } from "@/lib/security-audit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let access;
  try {
    access = await authenticateAdminRequest(request, { mutation: true });
  } catch (error) {
    return adminAccessErrorResponse(error);
  }
  try {
    const body = await request.json() as { password?: unknown };
    const mode = adminAccessMode();
    const gatewayIdentity = mode === "identity-gateway"
      ? await readGatewayAdminIdentity(request.headers)
      : null;
    const authenticatedAt = gatewayIdentity
      ? gatewayIdentity.authenticatedAt
      : typeof body.password === "string" && await isValidLocalAdminPassword(body.password)
        ? new Date().toISOString()
        : "";
    const actorMatches = gatewayIdentity
      ? adminActorHash(gatewayIdentity.subject) === access.session.actorHash
      : true;
    const authenticatedTime = Date.parse(authenticatedAt);
    if (
      !authenticatedAt
      || !actorMatches
      || !Number.isFinite(authenticatedTime)
      || Date.now() - authenticatedTime >= ADMIN_REAUTH_SECONDS * 1000
      || authenticatedTime > Date.now() + 5_000
    ) {
      await recordAuditEvent({
        actorHash: access.session.actorHash,
        action: "admin.reauthenticate",
        targetType: "session",
        targetId: access.session.id,
        result: "rejected",
        reason: "fresh-identity-required",
      });
      return authenticatedAdminJson(access, {
        error: "需要通过身份入口重新验证后再执行高风险操作。",
        code: "ADMIN_REAUTH_REQUIRED",
        reauthenticationUrl: configuredAdminReauthenticationUrl(),
      }, { status: 403 });
    }
    const session = await markAdminSessionReauthenticated(access.token, authenticatedAt);
    if (!session) throw new Error("后台会话已失效。");
    await recordAuditEvent({
      actorHash: session.actorHash,
      action: "admin.reauthenticate",
      targetType: "session",
      targetId: session.id,
      result: "success",
    });
    return authenticatedAdminJson({ ...access, session }, {
      ok: true,
      reauthenticatedUntil: new Date(authenticatedTime + ADMIN_REAUTH_SECONDS * 1000).toISOString(),
    });
  } catch (error) {
    await recordAuditEvent({
      actorHash: access.session.actorHash,
      action: "admin.reauthenticate",
      targetType: "session",
      targetId: access.session.id,
      result: "rejected",
      reason: error instanceof Error ? error.message.slice(0, 120) : "reauthentication-failed",
    }).catch(() => undefined);
    return authenticatedAdminJson(access, {
      error: "身份重新验证失败。",
      code: "ADMIN_REAUTH_FAILED",
      reauthenticationUrl: configuredAdminReauthenticationUrl(),
    }, { status: 401 });
  }
}
