import { NextRequest, NextResponse } from "next/server";
import { adminPasskeyRejectionReason, recordRejectedAdminPasskeyEvent } from "@/lib/admin-passkey-audit";
import { exchangeAdminRecoveryCode } from "@/lib/admin-passkey-store";
import { assertAdminMutationRequest, AdminRequestSecurityError } from "@/lib/admin-request-security";
import { withinDurableRateLimit } from "@/lib/rate-limit";
import { anonymizeClientAddress, requestClientAddress } from "@/lib/request-client";
import { recordAuditEvent } from "@/lib/security-audit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const clientHash = anonymizeClientAddress(requestClientAddress(request));
  try {
    assertAdminMutationRequest(request);
    if (!(await withinDurableRateLimit(`admin:passkey:recover:${clientHash}`, 5, 60 * 60 * 1000))) {
      await recordRejectedAdminPasskeyEvent({
        actorHash: clientHash,
        action: "admin.passkey.recover",
        targetType: "credential",
        targetId: "owner",
        reason: "ADMIN_RECOVERY_RATE_LIMITED",
      }).catch(() => undefined);
      return NextResponse.json({ error: "恢复尝试过于频繁。", code: "ADMIN_RECOVERY_RATE_LIMITED" }, { status: 429 });
    }
    const body = await request.json() as { recoveryCode?: unknown };
    if (typeof body.recoveryCode !== "string" || body.recoveryCode.length < 20) throw new Error("invalid-code");
    const result = await exchangeAdminRecoveryCode(body.recoveryCode.trim());
    await recordAuditEvent({ actorHash: clientHash, action: "admin.passkey.recover", targetType: "credential", targetId: "owner", result: "success" });
    return NextResponse.json(
      { ok: true, enrollmentToken: result.token, expiresAt: result.expiresAt },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    await recordRejectedAdminPasskeyEvent({
      actorHash: clientHash,
      action: "admin.passkey.recover",
      targetType: "credential",
      targetId: "owner",
      reason: adminPasskeyRejectionReason(error, "invalid-or-used-recovery-code"),
    }).catch(() => undefined);
    if (error instanceof AdminRequestSecurityError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "恢复码无效或已经使用。", code: "ADMIN_RECOVERY_REJECTED" }, { status: 401 });
  }
}
