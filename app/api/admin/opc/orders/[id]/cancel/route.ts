import { NextRequest, NextResponse } from "next/server";
import {
  adminAccessErrorResponse,
  authenticateAdminRequest,
  authenticatedAdminResponse,
  configuredAdminReauthenticationUrl,
} from "@/lib/admin-access";
import { hasRecentAdminReauthentication } from "@/lib/admin-session-store";
import {
  cancelAwaitingOpcBankTransferOrder,
  cancelAwaitingOpcOrderWithProviderEvidence,
  type OpcPaymentCancellationEvidence,
} from "@/lib/opc-orders/refund";
import { listAdminOpcOrders } from "@/lib/opc-orders/admin";
import { recordOpcAlipayQuery } from "@/lib/opc-orders/payment";
import {
  closeOpcAlipayTrade,
  OpcAlipayProviderError,
  queryOpcAlipayTrade,
  requireOpcAlipayConfiguration,
} from "@/lib/opc-payment-config";
import { recordAuditEvent } from "@/lib/security-audit";
import { withPersistenceTransaction } from "@/lib/state-document-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  let access;
  try { access = await authenticateAdminRequest(request, { mutation: true }); } catch (error) { return adminAccessErrorResponse(error); }
  const { id } = await context.params;
  const audit = { actorHash: access.session.actorHash, action: "admin.opc-order.cancel-payment", targetType: "opc-order", targetId: id };
  if (!hasRecentAdminReauthentication(access.session)) {
    await recordAuditEvent({ ...audit, result: "rejected", reason: "recent-reauthentication-required" });
    return authenticatedAdminResponse(access, NextResponse.json({ error: "取消待付款订单前需要重新验证管理员身份。", code: "ADMIN_REAUTH_REQUIRED", reauthenticationUrl: configuredAdminReauthenticationUrl() }, { status: 403 }));
  }
  try {
    const body = await request.json().catch(() => ({})) as { expectedUpdatedAt?: unknown };
    if (typeof body.expectedUpdatedAt !== "string") {
      await recordAuditEvent({ ...audit, result: "rejected", reason: "expected-version-required" });
      return authenticatedAdminResponse(access, NextResponse.json({ error: "订单版本无效，请刷新后台后重试。" }, { status: 409 }));
    }
    const order = (await listAdminOpcOrders()).find((item) => item.id === id);
    if (!order || order.status !== "awaiting_payment") {
      await recordAuditEvent({ ...audit, result: "rejected", reason: "order-not-awaiting-payment" });
      return authenticatedAdminResponse(access, NextResponse.json({ error: "该订单当前不是待付款状态。" }, { status: 409 }));
    }
    if (order.payment.provider === "bank_transfer") {
      const updated = await withPersistenceTransaction(async () => {
        const result = await cancelAwaitingOpcBankTransferOrder(id, body.expectedUpdatedAt as string);
        await recordAuditEvent({
          ...audit,
          result: "success",
          diff: {
            reference: result.reference,
            status: result.status,
            cancellationEvidence: "bank-transfer-not-yet-verified",
          },
        });
        return result;
      });
      return authenticatedAdminResponse(access, NextResponse.json({ order: updated }));
    }
    const configuration = requireOpcAlipayConfiguration();
    if (order.payment.appId !== configuration.appId || order.payment.sellerId !== configuration.sellerId) {
      await recordAuditEvent({ ...audit, result: "rejected", reason: "bound-alipay-configuration-mismatch" });
      return authenticatedAdminResponse(access, NextResponse.json({ error: "该订单绑定的支付宝应用或商户与当前配置不一致，不能使用当前凭证取消。" }, { status: 409 }));
    }

    const query = await queryOpcAlipayTrade(order.reference, configuration);
    if (query.found && ["TRADE_SUCCESS", "TRADE_FINISHED"].includes(query.tradeStatus ?? "")) {
      await withPersistenceTransaction(async () => {
        await recordOpcAlipayQuery(order.reference, query);
        await recordAuditEvent({ ...audit, result: "rejected", reason: "alipay-trade-already-paid" });
      });
      return authenticatedAdminResponse(access, NextResponse.json({ error: "支付宝交易已经付款，订单不能取消；请按纸质合同或退款流程处理。" }, { status: 409 }));
    }

    let cancellationEvidence: OpcPaymentCancellationEvidence | null = query.found && query.tradeStatus === "TRADE_CLOSED"
      ? { provider: "alipay", kind: "provider_closed", providerTradeStatus: "TRADE_CLOSED" }
      : null;
    if (!cancellationEvidence) {
      const closeResult = await closeOpcAlipayTrade(order.reference, configuration);
      if (closeResult.status === "paid") {
        const paidQuery = await queryOpcAlipayTrade(order.reference, configuration);
        await withPersistenceTransaction(async () => {
          await recordOpcAlipayQuery(order.reference, paidQuery);
          await recordAuditEvent({ ...audit, result: "rejected", reason: "alipay-trade-paid-during-close" });
        });
        return authenticatedAdminResponse(access, NextResponse.json({ error: "支付宝交易在关单前已经付款，订单不能取消；请按纸质合同或退款流程处理。" }, { status: 409 }));
      }
      if (closeResult.status === "not_found") {
        const requestCreatedAt = Date.parse(order.payment.requestCreatedAt ?? "");
        const absolutePaymentExpiryPassed = Number.isFinite(requestCreatedAt)
          && Date.now() >= requestCreatedAt + 31 * 60 * 1_000;
        if (!absolutePaymentExpiryPassed) {
          await recordAuditEvent({ ...audit, result: "rejected", reason: "alipay-trade-not-created-and-link-active" });
          return authenticatedAdminResponse(access, NextResponse.json({ error: "支付宝尚无可关闭的交易，付款链接仍可能有效；请在付款链接生成 31 分钟后重试取消。" }, { status: 409 }));
        }
        cancellationEvidence = {
          provider: "alipay",
          kind: "expired_not_found",
          requestCreatedAt: new Date(requestCreatedAt).toISOString(),
          linkExpiredAt: new Date(requestCreatedAt + 30 * 60 * 1_000).toISOString(),
        };
      }
      if (closeResult.status === "closed") {
        cancellationEvidence = { provider: "alipay", kind: "provider_closed", providerTradeStatus: "TRADE_CLOSED" };
      }
    }
    if (!cancellationEvidence) throw new Error("支付宝取消证据不完整。");

    const updated = await withPersistenceTransaction(async () => {
      const result = await cancelAwaitingOpcOrderWithProviderEvidence(id, body.expectedUpdatedAt as string, cancellationEvidence);
      await recordAuditEvent({
        ...audit,
        result: "success",
        diff: {
          reference: result.reference,
          status: result.status,
          cancellationEvidence: cancellationEvidence.kind,
          providerTradeStatus: cancellationEvidence.kind === "provider_closed" ? cancellationEvidence.providerTradeStatus : "TRADE_NOT_EXIST_AFTER_EXPIRY",
          paymentRequestCreatedAt: cancellationEvidence.kind === "expired_not_found" ? cancellationEvidence.requestCreatedAt : null,
          paymentLinkExpiredAt: cancellationEvidence.kind === "expired_not_found" ? cancellationEvidence.linkExpiredAt : null,
        },
      });
      return result;
    });
    return authenticatedAdminResponse(access, NextResponse.json({ order: updated }));
  } catch (error) {
    await recordAuditEvent({ ...audit, result: "failed", reason: error instanceof OpcAlipayProviderError ? error.code : error instanceof Error ? error.message.slice(0, 120) : "unknown" });
    return authenticatedAdminResponse(access, NextResponse.json({ error: "暂时无法安全取消该待付款订单，请稍后重试。" }, { status: 409 }));
  }
}
