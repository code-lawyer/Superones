import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  adminSessionAnonymousId,
  createAdminSession,
  isValidAdminPassword,
  readAdminSession,
} from "@/lib/admin-auth";
import { withinRateLimit } from "@/lib/rate-limit";
import { anonymizeClientAddress, requestClientAddress } from "@/lib/request-client";
import {
  clearLoginFailures,
  loginThrottleState,
  recordAuditEvent,
  recordLoginFailure,
} from "@/lib/security-audit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const clientHash = anonymizeClientAddress(requestClientAddress(request));
  if (
    !withinRateLimit(`admin:login:${clientHash}`, 8, 60 * 60 * 1000)
    || (await loginThrottleState(clientHash)).locked
  ) {
    await recordAuditEvent({
      actorHash: clientHash,
      action: "admin.login",
      targetType: "session",
      targetId: "shared-admin",
      result: "rejected",
      reason: "locked",
    });
    return NextResponse.json({ error: "登录尝试次数过多，请稍后再试。" }, { status: 429 });
  }
  try {
    const body = await request.json() as { password?: unknown };
    if (typeof body.password !== "string" || !(await isValidAdminPassword(body.password))) {
      await recordLoginFailure(clientHash);
      await recordAuditEvent({
        actorHash: clientHash,
        action: "admin.login",
        targetType: "session",
        targetId: "shared-admin",
        result: "rejected",
        reason: "invalid-credential",
      });
      return NextResponse.json({ error: "密码不正确。" }, { status: 401 });
    }
    await clearLoginFailures(clientHash);
    const token = createAdminSession();
    const session = readAdminSession(token);
    if (!session) throw new Error("无法创建后台会话。");
    await recordAuditEvent({
      actorHash: adminSessionAnonymousId(session),
      action: "admin.login",
      targetType: "session",
      targetId: "shared-admin",
      result: "success",
    });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_COOKIE, token, adminCookieOptions);
    return response;
  } catch (error) {
    await recordAuditEvent({
      actorHash: clientHash,
      action: "admin.login",
      targetType: "session",
      targetId: "shared-admin",
      result: "failed",
      reason: error instanceof Error ? error.message.slice(0, 120) : "invalid-request",
    }).catch(() => undefined);
    return NextResponse.json({ error: "登录请求无效。" }, { status: 400 });
  }
}
