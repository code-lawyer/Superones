import { NextRequest, NextResponse } from "next/server";
import {
  adminAccessErrorResponse,
  authenticateAdminRequest,
  authenticatedAdminResponse,
  configuredAdminReauthenticationUrl,
} from "@/lib/admin-access";
import { hasRecentAdminReauthentication } from "@/lib/admin-session-store";
import { getAdminOpcContactExport } from "@/lib/opc-orders/admin";
import { recordAuditEvent } from "@/lib/security-audit";

export const runtime = "nodejs";

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  let access;
  try {
    access = await authenticateAdminRequest(request);
  } catch (error) {
    return adminAccessErrorResponse(error);
  }
  const { id } = await context.params;
  const audit = { actorHash: access.session.actorHash, action: "admin.opc-order.contact-export", targetType: "opc-order", targetId: id };
  try {
    if (!hasRecentAdminReauthentication(access.session)) {
      await recordAuditEvent({ ...audit, result: "rejected", reason: "recent-reauthentication-required" });
      return authenticatedAdminResponse(access, NextResponse.json({
        error: "导出客户联系方式前需要重新验证管理员身份。",
        code: "ADMIN_REAUTH_REQUIRED",
        reauthenticationUrl: configuredAdminReauthenticationUrl(),
      }, { status: 403 }));
    }
    const order = await getAdminOpcContactExport(id);
    const rows = [
      ["订单号", "服务", "签约身份", "客户/经办人", "手机", "邮箱", "微信", "组织名称", "统一社会信用代码", "法定代表人", "备注"],
      [order.reference, order.serviceName, order.signer.type, order.contact.name, order.contact.phone, order.contact.email, order.contact.wechat, order.signer.organizationName, order.signer.organizationCreditCode, order.signer.legalRepresentativeName, order.contact.note],
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
    await recordAuditEvent({ ...audit, result: "success", diff: { reference: order.reference } });
    return authenticatedAdminResponse(access, new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${order.reference}-customer-contact.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }));
  } catch (error) {
    await recordAuditEvent({ ...audit, result: "failed", reason: error instanceof Error ? error.name : "unknown" });
    return authenticatedAdminResponse(access, NextResponse.json({ error: "客户联系方式不可导出或已按保留期清除。" }, { status: 404 }));
  }
}
