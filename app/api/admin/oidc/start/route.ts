import { NextRequest, NextResponse } from "next/server";
import { adminCookieName } from "@/lib/admin-auth";
import { adminAccessMode } from "@/lib/admin-identity";
import {
  adminOidcTransactionCookieName,
  adminOidcTransactionCookieOptions,
  createAdminOidcAuthorization,
  type AdminOidcIntent,
} from "@/lib/admin-oidc";
import {
  assertAdminHost,
  AdminRequestSecurityError,
  configuredAdminOrigin,
} from "@/lib/admin-request-security";
import { readAdminSession } from "@/lib/admin-session-store";
import { withinDurableRateLimit } from "@/lib/rate-limit";
import { anonymizeClientAddress, requestClientAddress } from "@/lib/request-client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    assertAdminHost(request);
    if (adminAccessMode() !== "oidc") {
      return NextResponse.json({ error: "OIDC 登录只在生产环境启用。" }, { status: 404 });
    }
    const clientHash = anonymizeClientAddress(requestClientAddress(request));
    if (!(await withinDurableRateLimit(`admin:oidc:start:${clientHash}`, 20, 60 * 60 * 1_000))) {
      return NextResponse.json({ error: "身份登录请求过于频繁，请稍后再试。" }, { status: 429 });
    }
    const intent: AdminOidcIntent = request.nextUrl.searchParams.get("intent") === "reauth"
      ? "reauth"
      : "login";
    const session = intent === "reauth"
      ? await readAdminSession(request.cookies.get(adminCookieName())?.value)
      : null;
    if (intent === "reauth" && !session) {
      return NextResponse.redirect(
        new URL("/admin?oidc=session-required", configuredAdminOrigin() || request.nextUrl.origin),
        303,
      );
    }
    const authorization = await createAdminOidcAuthorization(
      intent,
      session?.actorHash ?? null,
    );
    const response = NextResponse.redirect(authorization.authorizationUrl, 303);
    response.cookies.set(
      adminOidcTransactionCookieName(),
      authorization.cookieValue,
      adminOidcTransactionCookieOptions(),
    );
    return response;
  } catch (error) {
    if (error instanceof AdminRequestSecurityError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({
      error: "暂时无法连接后台身份服务。",
      code: "ADMIN_OIDC_UNAVAILABLE",
    }, { status: 503 });
  }
}
