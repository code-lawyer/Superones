import "server-only";

import { decryptSensitiveText } from "../sensitive-data.ts";
import type { OpcSignerParty } from "../opc-esign.ts";
import {
  assertExpectedUpdatedAt,
  mutateOpcOrderStore,
  publicOrder,
  readOpcOrderStore,
  scrubExpiredContacts,
} from "./internal-store.ts";
import type {
  OpcOrderContact,
  OpcOrderStatus,
  OpcPaperDelivery,
} from "./model.ts";

export async function runOpcOrderRetention(now = new Date()) {
  return mutateOpcOrderStore((store) => ({
    scrubbed: scrubExpiredContacts(store, now),
    checkedAt: now.toISOString(),
  }));
}

export async function listAdminOpcOrders() {
  const store = await readOpcOrderStore();
  return [...store.orders]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 1_000)
    .map((order) => {
      const contactAvailable = Boolean(order.contactEncrypted && order.signerEncrypted);
      const {
        contactEncrypted: _contactEncrypted,
        signerEncrypted: _signerEncrypted,
        deliveryEncrypted: _deliveryEncrypted,
        resumeTokenHash: _resumeTokenHash,
        resumeTokenNonce: _resumeTokenNonce,
        resumeTokenKeyId: _resumeTokenKeyId,
        resumeTokenExpiresAt: _resumeTokenExpiresAt,
        signature: storedSignature,
        idempotencyHash: _idempotencyHash,
        requestFingerprint: _requestFingerprint,
        notifications: storedNotifications,
        payment: storedPayment,
        ...record
      } = order;
      const { payerNameEncrypted: _payerNameEncrypted, ...payment } = storedPayment;
      const {
        preparationClaimId: _preparationClaimId,
        preparationLeaseExpiresAt: _preparationLeaseExpiresAt,
        archiveClaimId: _archiveClaimId,
        archiveLeaseExpiresAt: _archiveLeaseExpiresAt,
        callbackEventHashes: _callbackEventHashes,
        ...signature
      } = storedSignature;
      const notifications = storedNotifications.map(({ claimId: _claimId, leaseExpiresAt: _leaseExpiresAt, ...event }) => event);
      return { ...record, payment, notifications, signature, contactAvailable };
    });
}

export async function getAdminOpcOrderDossier(id: string) {
  const store = await readOpcOrderStore();
  const order = store.orders.find((value) => value.id === id);
  if (!order) throw new Error("OPC 订单不存在。");
  const { payerNameEncrypted: _payerNameEncrypted, ...payment } = order.payment;
  return {
    ...publicOrder(order),
    payment,
    paymentReceipt: order.paymentReceipt,
    notifications: order.notifications.map(({ claimId: _claimId, leaseExpiresAt: _leaseExpiresAt, ...event }) => event),
    checkoutAgreement: order.checkoutAgreement,
    timestamps: {
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      paidAt: order.paidAt,
      paperContractApprovedAt: order.paperContractApprovedAt,
      refundedAt: order.refundedAt,
      completedAt: order.completedAt,
    },
  };
}

export async function getAdminOpcOrderSensitiveDossier(id: string) {
  const store = await readOpcOrderStore();
  const order = store.orders.find((value) => value.id === id);
  if (!order) throw new Error("OPC 订单不存在。");
  if (!order.contactEncrypted || !order.signerEncrypted) throw new Error("订单敏感资料已按保留期清除。");
  const { payerNameEncrypted, ...payment } = order.payment;
  return {
    ...publicOrder(order),
    service: {
      kind: order.serviceKind,
      slug: order.serviceSlug,
      code: order.serviceCode,
      name: order.serviceName,
      revision: order.serviceRevision,
      quotedPrice: order.quotedPrice,
      period: order.servicePeriod,
      outcome: order.serviceOutcome,
      scope: order.serviceScope,
      boundary: order.serviceBoundary,
    },
    contact: JSON.parse(decryptSensitiveText(order.contactEncrypted)) as OpcOrderContact,
    signer: JSON.parse(decryptSensitiveText(order.signerEncrypted)) as OpcSignerParty,
    delivery: order.deliveryEncrypted
      ? JSON.parse(decryptSensitiveText(order.deliveryEncrypted)) as OpcPaperDelivery
      : null,
    payment: {
      ...payment,
      payerName: payerNameEncrypted ? decryptSensitiveText(payerNameEncrypted) : "",
    },
    paymentReceipt: order.paymentReceipt,
    checkoutAgreement: order.checkoutAgreement,
    refund: order.refund,
    notifications: order.notifications.map(({ claimId: _claimId, leaseExpiresAt: _leaseExpiresAt, ...event }) => event),
    timestamps: {
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      paidAt: order.paidAt,
      paperContractApprovedAt: order.paperContractApprovedAt,
      refundedAt: order.refundedAt,
      completedAt: order.completedAt,
    },
  };
}

export async function updateOpcOrderStatus(id: string, status: OpcOrderStatus, expectedUpdatedAt?: string) {
  return mutateOpcOrderStore((store) => {
    scrubExpiredContacts(store, new Date());
    const order = store.orders.find((value) => value.id === id);
    if (!order) throw new Error("OPC 订单不存在。");
    assertExpectedUpdatedAt(order, expectedUpdatedAt);
    if (order.status === status) return publicOrder(order);

    const allowed: Record<OpcOrderStatus, OpcOrderStatus[]> = {
      awaiting_signature: ["cancelled"],
      awaiting_payment: [],
      payment_exception: ["refund_pending"],
      paid_pending_contract: ["paid", "refund_pending"],
      paid: ["completed", "refund_pending"],
      refund_pending: ["refunded"],
      completed: [],
      cancelled: [],
      refunded: [],
    };
    if (!allowed[order.status].includes(status)) {
      throw new Error(`订单不能从 ${order.status} 变更为 ${status}。`);
    }
    const timestamp = new Date().toISOString();
    order.status = status;
    order.updatedAt = timestamp;
    if (status === "paid") {
      order.paidAt ??= timestamp;
      if (order.signatureMethod === "paper") order.paperContractApprovedAt ??= timestamp;
    }
    if (status === "cancelled") order.cancelledAt = timestamp;
    if (status === "refunded") order.refundedAt = timestamp;
    if (status === "completed") order.completedAt = timestamp;
    return publicOrder(order);
  });
}

export async function getAdminOpcContractArchive(id: string) {
  const store = await readOpcOrderStore();
  const order = store.orders.find((value) => value.id === id);
  if (!order) throw new Error("OPC 订单不存在。");
  if (order.signature.archive.status !== "archived" || !order.signature.archive.objectKey) {
    throw new Error("该订单尚无可下载的已签合同归档。");
  }
  return {
    reference: order.reference,
    objectKey: order.signature.archive.objectKey,
    sha256: order.signature.archive.sha256,
    sizeBytes: order.signature.archive.sizeBytes,
  };
}

export async function getAdminOpcContactExport(id: string) {
  return mutateOpcOrderStore((store) => {
    scrubExpiredContacts(store, new Date());
    const order = store.orders.find((value) => value.id === id);
    if (!order) throw new Error("OPC 订单不存在。");
    if (!order.contactEncrypted || !order.signerEncrypted) throw new Error("该订单的非合同联系方式已按 24 个月规则清除。");
    return {
      reference: order.reference,
      serviceName: order.serviceName,
      contact: JSON.parse(decryptSensitiveText(order.contactEncrypted)) as OpcOrderContact,
      signer: JSON.parse(decryptSensitiveText(order.signerEncrypted)) as OpcSignerParty,
    };
  });
}
