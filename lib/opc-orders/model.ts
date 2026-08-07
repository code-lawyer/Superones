import type { OpcContractArchiveRecord } from "../opc-contract-archive.ts";
import type { OpcEsignFlowStatus, OpcSignerParty } from "../opc-esign.ts";
import type { OpcAlipayAmount } from "../opc-payment-config.ts";

export const OPC_ORDER_STATUSES = ["awaiting_signature", "awaiting_payment", "payment_exception", "paid_pending_contract", "paid", "refund_pending", "completed", "cancelled", "refunded"] as const;
export type OpcOrderStatus = (typeof OPC_ORDER_STATUSES)[number];

export type OpcOrderContact = {
  name: string;
  phone: string;
  email: string;
  wechat: string;
  note: string;
};

export type OpcPaperDelivery = {
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  addressLine: string;
};

export type OpcCheckoutAgreement = {
  version: string;
  title: string;
  text: string;
  sha256: string;
  acceptedAt: string;
};

export type StoredOpcPaymentReceipt = {
  receiptId: string;
  receiptNumber: string;
  reference: string;
  paymentStatus: "verified_paid";
  snapshotSha256: string;
  generatedAt: string;
  operator: {
    name: string;
    creditCode: string;
    publicOrigin: string;
    icpNumber: string;
  };
  customer: {
    type: OpcSignerParty["type"];
    name: string;
    organizationName: string;
    organizationCreditCode: string;
    legalRepresentativeName: string;
    contactName: string;
    maskedPhone: string;
    maskedDeliveryAddress: string;
  };
  service: {
    code: string;
    name: string;
    revision: string;
    outcome: string;
    scope: string;
    boundary: string;
  };
  payment: {
    provider: "alipay";
    amount: OpcAlipayAmount;
    paidAt: string;
    tradeNo: string;
  };
};

export type StoredOpcNotification = {
  eventId: string;
  eventType: "payment_confirmed";
  recipient: string;
  status: "pending" | "sending" | "sent" | "failed";
  attempts: number;
  nextAttemptAt: string;
  sentAt: string | null;
  lastError: string | null;
  claimId: string | null;
  leaseExpiresAt: string | null;
};

export type StoredOpcRefund = {
  status: "pending" | "succeeded";
  requestNo: string;
  reason: string;
  amount: OpcAlipayAmount;
  requestedAt: string;
  completedAt: string | null;
};

export type StoredOpcSignature = {
  provider: "mock" | "esign" | "legacy";
  status: "preparing" | OpcEsignFlowStatus;
  flowId: string | null;
  fileId: string | null;
  templateId: string | null;
  templateVersion: string | null;
  createdAt: string | null;
  notifiedAt: string | null;
  checkedAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
  preparationClaimId: string | null;
  preparationLeaseExpiresAt: string | null;
  archiveClaimId: string | null;
  archiveLeaseExpiresAt: string | null;
  callbackEventHashes: string[];
  archive: OpcContractArchiveRecord;
};

export class OpcOrderIdempotencyConflictError extends Error {
  constructor() {
    super("该幂等请求已用于不同的订单内容，请刷新页面后重新提交。");
    this.name = "OpcOrderIdempotencyConflictError";
  }
}

export class OpcOrderConcurrentModificationError extends Error {
  constructor() {
    super("订单状态已经变化，请刷新后台后重新确认操作。");
    this.name = "OpcOrderConcurrentModificationError";
  }
}
