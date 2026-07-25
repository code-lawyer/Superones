import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, adminCookieOptions, adminSessionAnonymousId, readAdminSession } from "@/lib/admin-auth";
import { recordAuditEvent } from "@/lib/security-audit";

export async function POST(request: NextRequest) {
  const session = readAdminSession(request.cookies.get(ADMIN_COOKIE)?.value);
  if (session) {
    await recordAuditEvent({
      actorHash: adminSessionAnonymousId(session),
      action: "admin.logout",
      targetType: "session",
      targetId: "shared-admin",
      result: "success",
    }).catch(() => undefined);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", { ...adminCookieOptions, maxAge: 0 });
  return response;
}
