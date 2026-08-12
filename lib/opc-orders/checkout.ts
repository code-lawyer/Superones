import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { catalogPriceToOpcPaymentAmount } from "../opc-payment-amount.ts";
import { encryptSensitiveText } from "../sensitive-data.ts";
import { PRODUCTION_ADMIN_EMAIL } from "../admin-profile.ts";
import type { OpcSignerParty } from "../opc-esign.ts";
import { isValidPrcIdentityCard } from "../prc-identity-card.ts";
import {
  createResumeCredential,
  idempotencyHash,
  mutateOpcOrderStore,
  orderRequestFingerprint,
  publicOrder,
  recoverResumeToken,
  scrubExpiredContacts,
  uniqueOrderReference,
  type StoredOpcOrder,
} from "./internal-store.ts";
import {
  OpcOrderIdempotencyConflictError,
  type OpcCheckoutAgreement,
  type OpcIdentityConsent,
  type OpcOrderContact,
  type OpcOfflinePaymentSnapshot,
  type OpcPaperDelivery,
} from "./model.ts";

export async function createOpcOrder(input: {
  idempotencyKey: string;
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
  signatureMethod?: "paper" | "electronic" | "online";
  delivery?: OpcPaperDelivery;
  agreement?: OpcCheckoutAgreement;
  identityConsent?: OpcIdentityConsent;
  paymentProvider?: "bank_transfer";
  offlinePaymentSnapshot?: OpcOfflinePaymentSnapshot;
}) {
  const signatureMethod = input.signatureMethod ?? "electronic";
  if (signatureMethod === "paper") {
    if (!input.delivery) throw new Error("纸质签约订单缺少寄送信息。");
    if (
      !input.agreement
      || input.agreement.text.length < 200
      || createHash("sha256").update(input.agreement.text).digest("hex") !== input.agreement.sha256
    ) {
      throw new Error("纸质签约订单缺少有效的在线协议证据。");
    }
  }
  if (signatureMethod === "online") {
    if (
      input.paymentProvider !== "bank_transfer"
      || !input.offlinePaymentSnapshot
      || !input.agreement
      || input.agreement.text.length < 200
      || createHash("sha256").update(input.agreement.text).digest("hex") !== input.agreement.sha256
    ) {
      throw new Error("线下转账订单缺少有效的在线协议或付款资料快照。");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contact.email.trim())) {
      throw new Error("线下转账订单需要有效邮箱以接收订单和到账通知。");
    }
    if (!isValidPrcIdentityCard(input.contact.identityDocumentNumber ?? "") || !input.identityConsent) {
      throw new Error("线下转账订单需要签约身份信息及单独授权证据。");
    }
  }
  const paymentAmount = catalogPriceToOpcPaymentAmount(input.quotedPrice);
  if (!paymentAmount) throw new Error("服务公开价格无法转换为人民币订单金额。");
  const requestHash = idempotencyHash(input.idempotencyKey);
  const requestFingerprint = orderRequestFingerprint(input);
  return mutateOpcOrderStore((store) => {
    scrubExpiredContacts(store, new Date());
    const existing = store.orders.find((order) => order.idempotencyHash === requestHash);
    if (existing) {
      const legacyIdentityMatches = (
        existing.serviceKind === input.serviceKind
        && existing.serviceSlug === input.serviceSlug
        && existing.serviceCode === input.serviceCode
        && existing.serviceName === input.serviceName
        && existing.serviceRevision === input.serviceRevision
        && existing.quotedPrice === input.quotedPrice
      );
      if (
        (existing.requestFingerprint && existing.requestFingerprint !== requestFingerprint)
        || (!existing.requestFingerprint && !legacyIdentityMatches)
      ) {
        throw new OpcOrderIdempotencyConflictError();
      }
      return {
        ...publicOrder(existing),
        resumeToken: recoverResumeToken(existing),
      };
    }

    const now = new Date();
    const timestamp = now.toISOString();
    const reference = uniqueOrderReference(store);
    const orderId = randomUUID();
    const resumeCredential = createResumeCredential(reference, now);
    const order: StoredOpcOrder = {
      id: orderId,
      reference,
      idempotencyHash: requestHash,
      requestFingerprint,
      serviceKind: input.serviceKind,
      serviceSlug: input.serviceSlug,
      serviceCode: input.serviceCode,
      serviceName: input.serviceName,
      serviceRevision: input.serviceRevision,
      quotedPrice: input.quotedPrice,
      servicePeriod: input.servicePeriod,
      serviceOutcome: input.serviceOutcome,
      serviceScope: input.serviceScope,
      serviceBoundary: input.serviceBoundary,
      payment: {
        provider: "bank_transfer",
        amount: paymentAmount,
        tradeNo: null,
        tradeStatus: null,
        requestCreatedAt: null,
        notifiedAt: null,
        checkedAt: null,
        offlineProfileRevision: input.offlinePaymentSnapshot?.revision ?? null,
        accountName: input.offlinePaymentSnapshot?.account.name ?? null,
        bankName: input.offlinePaymentSnapshot?.account.bankName ?? null,
        branchName: input.offlinePaymentSnapshot?.account.branchName ?? null,
        accountNumber: input.offlinePaymentSnapshot?.account.accountNumber ?? null,
        cnapsCode: input.offlinePaymentSnapshot?.account.cnapsCode ?? null,
        transferMemo: input.paymentProvider === "bank_transfer" ? reference : null,
        agreementSha256: input.offlinePaymentSnapshot?.agreementSha256 ?? null,
        contactQrSha256: input.offlinePaymentSnapshot?.contactQrSha256 ?? null,
        payerNameEncrypted: null,
      },
      paymentReceipt: null,
      notifications: signatureMethod === "online" && input.paymentProvider === "bank_transfer"
        ? [
            {
              eventId: `order-created:administrator:${orderId}`,
              eventType: "order_created" as const,
              audience: "administrator" as const,
              recipient: PRODUCTION_ADMIN_EMAIL,
              status: "pending" as const,
              attempts: 0,
              nextAttemptAt: timestamp,
              sentAt: null,
              lastError: null,
              claimId: null,
              leaseExpiresAt: null,
            },
            ...(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contact.email.trim()) ? [{
              eventId: `order-created:customer:${orderId}`,
              eventType: "order_created" as const,
              audience: "customer" as const,
              recipient: null,
              status: "pending" as const,
              attempts: 0,
              nextAttemptAt: timestamp,
              sentAt: null,
              lastError: null,
              claimId: null,
              leaseExpiresAt: null,
            }] : []),
          ]
        : [],
      refund: null,
      refundApplication: null,
      signatureMethod,
      checkoutAgreement: input.agreement ?? null,
      identityConsent: input.identityConsent ?? null,
      contactEncrypted: encryptSensitiveText(JSON.stringify(input.contact)),
      signerEncrypted: encryptSensitiveText(JSON.stringify(input.signer)),
      deliveryEncrypted: input.delivery ? encryptSensitiveText(JSON.stringify(input.delivery)) : null,
      resumeTokenHash: idempotencyHash(resumeCredential.token),
      resumeTokenNonce: resumeCredential.nonce,
      resumeTokenKeyId: resumeCredential.keyId,
      resumeTokenExpiresAt: resumeCredential.expiresAt,
      signature: {
        provider: signatureMethod === "online" ? "legacy" : "mock",
        status: signatureMethod === "online" ? "completed" : "preparing",
        flowId: null,
        fileId: null,
        templateId: null,
        templateVersion: null,
        createdAt: timestamp,
        notifiedAt: null,
        checkedAt: null,
        completedAt: signatureMethod === "online" ? timestamp : null,
        failureReason: null,
        preparationClaimId: null,
        preparationLeaseExpiresAt: null,
        archiveClaimId: null,
        archiveLeaseExpiresAt: null,
        callbackEventHashes: [],
        archive: {
          status: signatureMethod === "online" ? "archived" : "pending",
          objectKey: null,
          manifestKey: null,
          sha256: null,
          sizeBytes: null,
          verifiedAt: null,
          archivedAt: signatureMethod === "online" ? timestamp : null,
          retainUntil: null,
          evidence: [],
          failureReason: null,
        },
      },
      status: signatureMethod === "paper" || signatureMethod === "online" ? "awaiting_payment" : "awaiting_signature",
      createdAt: timestamp,
      updatedAt: timestamp,
      paidAt: null,
      paperContractApprovedAt: null,
      cancelledAt: null,
      refundedAt: null,
      completedAt: null,
      contactDeletedAt: null,
    };
    store.orders.push(order);
    return { ...publicOrder(order), resumeToken: resumeCredential.token };
  });
}
