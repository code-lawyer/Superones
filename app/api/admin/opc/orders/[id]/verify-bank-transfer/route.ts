import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server.js";
import {
  adminAccessErrorResponse,
  authenticateAdminRequest,
  authenticatedAdminResponse,
  configuredAdminReauthenticationUrl,
} from "../../../../../../../lib/admin-access.ts";
import { hasRecentAdminReauthentication } from "../../../../../../../lib/admin-session-store.ts";
import { createOpcOrderLifecycle } from "../../../../../../../lib/opc-order-lifecycle.ts";
import { normalizeOpcBankTransactionId } from "../../../../../../../lib/opc-orders/payment.ts";
import { recordAuditEvent } from "../../../../../../../lib/security-audit.ts";
import { withPersistenceTransaction } from "../../../../../../../lib/state-document-store.ts";

export const runtime = "nodejs";
const lifecycle = createOpcOrderLifecycle({});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  let access;
  try {
    access = await authenticateAdminRequest(request, { mutation: true });
  } catch (error) {
    return adminAccessErrorResponse(error);
  }
  const { id } = await context.params;
  const audit = {
    actorHash: access.session.actorHash,
    action: "admin.opc-order.bank-transfer-verified",
    targetType: "opc-order",
    targetId: id,
  };
  if (!hasRecentAdminReauthentication(access.session)) {
    await recordAuditEvent({ ...audit, result: "rejected", reason: "recent-reauthentication-required" });
    return authenticatedAdminResponse(access, NextResponse.json({
      error: "确认银行到账前需要重新验证管理员身份。",
      code: "ADMIN_REAUTH_REQUIRED",
      reauthenticationUrl: configuredAdminReauthenticationUrl(),
    }, { status: 403 }));
  }

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (
      typeof body.expectedUpdatedAt !== "string"
      || typeof body.amountDecimal !== "string"
      || typeof body.bankTransactionId !== "string"
      || typeof body.payerName !== "string"
      || typeof body.paidAt !== "string"
    ) {
      await recordAuditEvent({ ...audit, result: "rejected", reason: "bank-evidence-required" });
      return authenticatedAdminResponse(access, NextResponse.json({ error: "请完整填写银行入账证据并刷新订单版本。" }, { status: 400 }));
    }
    const normalizedTransactionId = normalizeOpcBankTransactionId(body.bankTransactionId);
    const transactionFingerprint = createHash("sha256").update(normalizedTransactionId).digest("hex").slice(0, 12);
    const order = await withPersistenceTransaction(async () => {
      const updated = await lifecycle.verifyBankTransfer({
        id,
        expectedUpdatedAt: body.expectedUpdatedAt as string,
        amountDecimal: body.amountDecimal as string,
        bankTransactionId: normalizedTransactionId,
        payerName: body.payerName as string,
        paidAt: body.paidAt as string,
      });
      await recordAuditEvent({
        ...audit,
        result: "success",
        diff: {
          status: updated.status,
          amountDecimal: body.amountDecimal,
          transactionFingerprint,
          expectedUpdatedAt: body.expectedUpdatedAt,
        },
      });
      return updated;
    });
    return authenticatedAdminResponse(access, NextResponse.json({ order }));
  } catch (error) {
    await recordAuditEvent({
      ...audit,
      result: "failed",
      reason: error instanceof Error ? error.message.slice(0, 120) : "unknown",
    });
    return authenticatedAdminResponse(access, NextResponse.json({ error: "银行到账核验未完成，请重新核对金额、流水号和订单状态。" }, { status: 409 }));
  }
}
