import { NextRequest, NextResponse } from "next/server.js";
import {
  adminCookieName,
  adminCookieOptions,
  isValidLocalAdminPassword,
} from "@/lib/admin-auth";
import { adminAccessMode, localAdminIdentity } from "@/lib/admin-identity";
import { discoverAdminLoginState } from "@/lib/admin-login-discovery";
import { assertAdminHost, assertAdminMutationRequest, AdminRequestSecurityError } from "@/lib/admin-request-security";
import { createAdminSession } from "@/lib/admin-session-store";
import {
  AdminAccessError,
  adminAccessErrorResponse,
  authenticatedAdminJson,
} from "@/lib/admin-access";
import { withinDurableRateLimit } from "@/lib/rate-limit";
import { anonymizeClientAddress, requestClientAddress } from "@/lib/request-client";
import {
  clearLoginFailures,
  loginThrottleState,
  recordAuditEvent,
  recordLoginFailure,
} from "@/lib/security-audit";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    assertAdminHost(request);
    const { access, body } = await discoverAdminLoginState(request);
    return access
      ? authenticatedAdminJson(access, body)
      : NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AdminAccessError) return adminAccessErrorResponse(error);
    if (error instanceof AdminRequestSecurityError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const clientHash = anonymizeClientAddress(requestClientAddress(request));
  try {
    assertAdminMutationRequest(request);
  } catch (error) {
    if (error instanceof AdminRequestSecurityError) {
      await recordAuditEvent({
        actorHash: clientHash,
        action: "admin.login",
        targetType: "session",
        targetId: adminAccessMode(),
        result: "rejected",
        reason: error.code,
      }).catch(() => undefined);
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
  if (
    !(await withinDurableRateLimit(`admin:login:${clientHash}`, 8, 60 * 60 * 1000))
    || (await loginThrottleState(clientHash)).locked
  ) {
    await recordAuditEvent({
      actorHash: clientHash,
      action: "admin.login",
      targetType: "session",
      targetId: adminAccessMode(),
      result: "rejected",
      reason: "locked",
    });
    return NextResponse.json({ error: "登录尝试次数过多，请稍后再试。", code: "ADMIN_LOGIN_LOCKED" }, { status: 429 });
  }
  try {
    if (adminAccessMode() === "passkey") {
      return NextResponse.json({
        error: "请通过本站 Passkey 安全入口登录。",
        code: "ADMIN_PASSKEY_REQUIRED",
      }, { status: 409 });
    }
    const body = await request.json() as { password?: unknown };
    const identity = typeof body.password === "string" && await isValidLocalAdminPassword(body.password)
      ? localAdminIdentity()
      : null;
    if (!identity) throw new Error("invalid-credential");
    await clearLoginFailures(clientHash);
    const created = await createAdminSession(identity);
    await recordAuditEvent({
      actorHash: created.session.actorHash,
      action: "admin.login",
      targetType: "session",
      targetId: created.session.id,
      result: "success",
      diff: { role: created.session.role, mode: adminAccessMode() },
    });
    const response = NextResponse.json({ ok: true, role: created.session.role });
    response.cookies.set(adminCookieName(), created.token, adminCookieOptions());
    return response;
  } catch (error) {
    await recordLoginFailure(clientHash);
    await recordAuditEvent({
      actorHash: clientHash,
      action: "admin.login",
      targetType: "session",
      targetId: adminAccessMode(),
      result: "rejected",
      reason: error instanceof Error ? error.message.slice(0, 120) : "invalid-identity",
    }).catch(() => undefined);
    return NextResponse.json({
      error: "密码不正确。",
      code: "ADMIN_IDENTITY_REJECTED",
    }, { status: 401 });
  }
}
