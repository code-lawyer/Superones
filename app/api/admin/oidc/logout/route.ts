import { NextRequest, NextResponse } from "next/server";
import { configuredAdminOidcLogoutUrl } from "@/lib/admin-oidc";
import { assertAdminHost, configuredAdminOrigin } from "@/lib/admin-request-security";

export const runtime = "nodejs";

function adminHome(request: NextRequest) {
  return new URL("/admin", configuredAdminOrigin() || request.nextUrl.origin);
}

export async function GET(request: NextRequest) {
  try {
    assertAdminHost(request);
    const logoutUrl = await configuredAdminOidcLogoutUrl().catch(() => null);
    return NextResponse.redirect(logoutUrl || adminHome(request), 303);
  } catch {
    return NextResponse.redirect(adminHome(request), 303);
  }
}
