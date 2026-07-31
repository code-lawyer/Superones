import { NextRequest, NextResponse } from "next/server";
import { clearAdminSessionCookie } from "@/lib/admin-access";
import { adminCookieName } from "@/lib/admin-auth";
import { assertAdminMutationRequest, AdminRequestSecurityError } from "@/lib/admin-request-security";
import { readAdminSession, revokeAdminSession } from "@/lib/admin-session-store";
import { recordAuditEvent } from "@/lib/security-audit";
import { adminAccessMode } from "@/lib/admin-identity";

export async function POST(request: NextRequest) {
  try {
    assertAdminMutationRequest(request);
  } catch (error) {
    if (error instanceof AdminRequestSecurityError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
  const token = request.cookies.get(adminCookieName())?.value;
  const session = await readAdminSession(token);
  if (session) {
    await revokeAdminSession(token);
    await recordAuditEvent({
      actorHash: session.actorHash,
      action: "admin.logout",
      targetType: "session",
      targetId: session.id,
      result: "success",
    }).catch(() => undefined);
  }
  return clearAdminSessionCookie(NextResponse.json({
    ok: true,
    logoutUrl: adminAccessMode() === "oidc" ? "/api/admin/oidc/logout" : null,
  }));
}
