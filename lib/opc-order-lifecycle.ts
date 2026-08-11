import "server-only";

import type { OpcSignerParty } from "./opc-esign.ts";
import {
  createOpcOrder,
  getOpcOrderPaymentOrder,
  recordOpcPaymentRequest,
} from "./opc-orders/checkout.ts";
import type {
  OpcCheckoutAgreement,
  OpcOrderContact,
  OpcPaperDelivery,
} from "./opc-orders/model.ts";
import {
  applyOpcAlipayTradeResult,
  claimOpcPublicPaymentQuery,
  getOpcPaymentReceipt,
  recordOpcAlipayQuery,
  verifyOpcBankTransfer,
} from "./opc-orders/payment.ts";
import {
  beginOpcFullRefund,
  completeOpcFullRefund,
} from "./opc-orders/refund.ts";
import {
  getAdminOpcOrderDossier,
  getAdminOpcOrderSensitiveDossier,
  updateOpcOrderStatus,
} from "./opc-orders/admin.ts";
import { getOpcOrderByResumeToken } from "./opc-orders/signature.ts";
import type { OpcAlipayAmount, OpcAlipayChannel } from "./opc-payment-config.ts";

export type OpcPaymentSessionOrder = {
  reference: string;
  serviceCode: string;
  serviceName: string;
  serviceRevision: string;
  amount: OpcAlipayAmount;
};

export type OpcPaymentSession = {
  url: string;
  channel: OpcAlipayChannel;
  appId: string;
  sellerId: string;
  amount: OpcAlipayAmount;
};

export type OpcPaymentSessionAdapter = {
  createSession(order: OpcPaymentSessionOrder, channel: OpcAlipayChannel): Promise<OpcPaymentSession>;
};

export type OpcFullRefundRequest = {
  reference: string;
  tradeNo: string;
  refundRequestNo: string;
  reason: string;
  amount: OpcAlipayAmount;
};

export type OpcFullRefundResult = {
  status: "succeeded" | "processing" | "not_found";
  reference: string;
  refundRequestNo: string;
  amount: OpcAlipayAmount;
};

export type OpcRefundAdapter = {
  refundFull(order: OpcFullRefundRequest): Promise<OpcFullRefundResult>;
  queryFull(order: OpcFullRefundRequest): Promise<OpcFullRefundResult>;
};

export type CreateOpcCheckoutInput = {
  idempotencyKey: string;
  signatureMethod: "paper";
  serviceKind: "infrastructure" | "specialty";
  serviceSlug: string;
  serviceCode: string;
  serviceName: string;
  serviceRevision: string;
  quotedPrice: string;
  servicePeriod: string;
  serviceOutcome: string;
  serviceScope: string;
  serviceBoundary: string;
  contact: OpcOrderContact;
  signer: OpcSignerParty;
  delivery: OpcPaperDelivery;
  agreement: OpcCheckoutAgreement;
  paymentChannel: OpcAlipayChannel;
};

export function createOpcOrderLifecycle(dependencies: {
  payments?: OpcPaymentSessionAdapter;
  refunds?: OpcRefundAdapter;
}) {
  return {
    async createCheckout(input: CreateOpcCheckoutInput) {
      if (!dependencies.payments) throw new Error("支付会话服务尚未配置。");
      const order = await createOpcOrder(input);
      const paymentOrder = await getOpcOrderPaymentOrder(order.reference);
      const session = await dependencies.payments.createSession({
        reference: paymentOrder.reference,
        serviceCode: paymentOrder.serviceCode,
        serviceName: paymentOrder.serviceName,
        serviceRevision: paymentOrder.serviceRevision,
        amount: paymentOrder.paymentAmount,
      }, input.paymentChannel);
      if (session.amount.minorUnits !== paymentOrder.paymentAmount.minorUnits) {
        throw new Error("支付会话金额与 OPC 订单金额不一致。");
      }
      await recordOpcPaymentRequest(order.reference, session.channel, session.sellerId, session.appId);
      return {
        order,
        paymentUrl: session.url,
      };
    },
    async applyPaymentEvidence(input: Parameters<typeof applyOpcAlipayTradeResult>[0]) {
      return applyOpcAlipayTradeResult(input);
    },
    async verifyBankTransfer(input: Parameters<typeof verifyOpcBankTransfer>[0]) {
      return verifyOpcBankTransfer(input);
    },
    async readPaymentReceipt(input: { reference: string; resumeToken: string }) {
      return getOpcPaymentReceipt(input.reference, input.resumeToken);
    },
    async readResumedOrder(input: { reference: string; resumeToken: string }) {
      return getOpcOrderByResumeToken(input.reference, input.resumeToken);
    },
    async applyActivePaymentQuery(input: Parameters<typeof recordOpcAlipayQuery>[1] & { reference: string }) {
      return recordOpcAlipayQuery(input.reference, input);
    },
    async claimPublicPaymentQuery(input: { reference: string; minimumIntervalMs?: number }) {
      return claimOpcPublicPaymentQuery(input.reference, input.minimumIntervalMs);
    },
    async readAdminOrderDossier(input: { id: string }) {
      return getAdminOpcOrderDossier(input.id);
    },
    async readAdminSensitiveDossier(input: { id: string }) {
      return getAdminOpcOrderSensitiveDossier(input.id);
    },
    async approvePaperContract(input: { id: string; expectedUpdatedAt?: string }) {
      return updateOpcOrderStatus(input.id, "paid", input.expectedUpdatedAt);
    },
    async beginFullRefund(input: { id: string; reason: string; expectedUpdatedAt?: string }) {
      return beginOpcFullRefund(input.id, input.reason, input.expectedUpdatedAt);
    },
    async confirmFullRefund(input: Parameters<typeof completeOpcFullRefund>[0]) {
      return completeOpcFullRefund(input);
    },
    async completeOrder(input: { id: string }) {
      return updateOpcOrderStatus(input.id, "completed");
    },
    async refundFullAmount(input: { id: string; reason: string; expectedUpdatedAt?: string }) {
      if (!dependencies.refunds) throw new Error("退款服务尚未配置。");
      const claim = await beginOpcFullRefund(input.id, input.reason, input.expectedUpdatedAt);
      if (claim.alreadyRefunded) return claim.order;
      let result = claim.newlyRequested
        ? await dependencies.refunds.refundFull(claim.request)
        : await dependencies.refunds.queryFull(claim.request);
      if (result.status === "not_found") result = await dependencies.refunds.refundFull(claim.request);
      if (result.status === "processing") result = await dependencies.refunds.queryFull(claim.request);
      if (result.status === "processing") return claim.order;
      if (result.status === "not_found") return claim.order;
      return completeOpcFullRefund({ id: input.id, ...result });
    },
  };
}
