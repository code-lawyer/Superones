import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  adminAccessErrorResponse,
  authenticateAdminRequest,
  authenticatedAdminResponse,
  configuredAdminReauthenticationUrl,
} from "@/lib/admin-access";
import { hasRecentAdminReauthentication } from "@/lib/admin-session-store";
import { getAdminOpcContractArchive } from "@/lib/opc-orders/admin";
import { readOpcContractArchive } from "@/lib/opc-contract-archive";
import { recordAuditEvent } from "@/lib/security-audit";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  let access;
  try {
    access = await authenticateAdminRequest(request);
  } catch (error) {
    return adminAccessErrorResponse(error);
  }
  const { id } = await context.params;
  const audit = { actorHash: access.session.actorHash, action: "admin.opc-order.contract-download", targetType: "opc-order", targetId: id };
  try {
    if (!hasRecentAdminReauthentication(access.session)) {
      await recordAuditEvent({ ...audit, result: "rejected", reason: "recent-reauthentication-required" });
      return authenticatedAdminResponse(access, NextResponse.json({
        error: "下载合同前需要重新验证管理员身份。",
        code: "ADMIN_REAUTH_REQUIRED",
        reauthenticationUrl: configuredAdminReauthenticationUrl(),
      }, { status: 403 }));
    }
    const archive = await getAdminOpcContractArchive(id);
    const pdf = await readOpcContractArchive(archive.objectKey);
    const actualSha256 = createHash("sha256").update(pdf).digest("hex");
    if (!archive.sha256 || actualSha256 !== archive.sha256) throw new Error("合同归档完整性校验失败。");
    await recordAuditEvent({ ...audit, result: "success", diff: { reference: archive.reference, sha256: archive.sha256 } });
    return authenticatedAdminResponse(access, new NextResponse(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${archive.reference}-signed-contract.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }));
  } catch (error) {
    await recordAuditEvent({ ...audit, result: "failed", reason: error instanceof Error ? error.name : "unknown" });
    return authenticatedAdminResponse(access, NextResponse.json({ error: "合同归档暂时无法下载。" }, { status: 404 }));
  }
}
