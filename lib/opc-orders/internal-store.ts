import "server-only";

import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  alipayDecimalToAmount,
  catalogPriceToAlipayAmount,
  type OpcAlipayAmount,
  type OpcAlipayChannel,
} from "../opc-payment-config.ts";
import { decryptSensitiveText, encryptSensitiveText } from "../sensitive-data.ts";
import type { OpcEsignFlowStatus, OpcSignerParty } from "../opc-esign.ts";
import { opcResumeTokenKeyring } from "../secret-keyring.ts";
import { PRODUCTION_ADMIN_EMAIL } from "../admin-profile.ts";
import {
  ICP_NUMBER,
  LEGAL_OPERATOR_CREDIT_CODE,
  LEGAL_OPERATOR_NAME,
  PUBLIC_ORIGIN,
} from "../legal-profile.ts";
import {
  mutateStateDocument,
  readStateDocument,
  type StateDocumentDefinition,
} from "../state-document-store.ts";

import {
  OpcOrderConcurrentModificationError,
  type OpcCheckoutAgreement,
  type OpcOrderContact,
  type OpcOrderStatus,
  type OpcPaperDelivery,
  type StoredOpcNotification,
  type StoredOpcPaymentReceipt,
  type StoredOpcRefund,
  type StoredOpcSignature,
} from "./model.ts";

type StoredOpcPayment = {
  provider: "alipay";
  amount: OpcAlipayAmount;
  appId: string | null;
  sellerId: string | null;
  tradeNo: string | null;
  tradeStatus: string | null;
  channel: OpcAlipayChannel | null;
  requestCreatedAt: string | null;
  notifiedAt: string | null;
  checkedAt: string | null;
};

export type StoredOpcOrder = {
  id: string;
  reference: string;
  idempotencyHash: string;
  requestFingerprint: string | null;
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
  payment: StoredOpcPayment;
  paymentReceipt: StoredOpcPaymentReceipt | null;
  notifications: StoredOpcNotification[];
  refund: StoredOpcRefund | null;
  signatureMethod: "paper" | "electronic";
  checkoutAgreement: OpcCheckoutAgreement | null;
  contactEncrypted: string | null;
  signerEncrypted: string | null;
  deliveryEncrypted: string | null;
  resumeTokenHash: string | null;
  resumeTokenNonce: string | null;
  resumeTokenKeyId: string | null;
  resumeTokenExpiresAt: string | null;
  signature: StoredOpcSignature;
  status: OpcOrderStatus;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  paperContractApprovedAt: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
  completedAt: string | null;
  contactDeletedAt: string | null;
};

type OpcOrderStore = {
  version: 8;
  orders: StoredOpcOrder[];
};

export function assertExpectedUpdatedAt(order: StoredOpcOrder, expectedUpdatedAt?: string) {
  if (expectedUpdatedAt !== undefined && order.updatedAt !== expectedUpdatedAt) {
    throw new OpcOrderConcurrentModificationError();
  }
}

type LegacyStoredOpcOrder = Partial<StoredOpcOrder> & {
  resumeTokenEncrypted?: string | null;
  alipayAmount?: string;
  alipaySellerId?: string | null;
  alipayTradeNo?: string | null;
  alipayTradeStatus?: string | null;
  paymentChannel?: OpcAlipayChannel | null;
  paymentRequestCreatedAt?: string | null;
  paymentNotifiedAt?: string | null;
  paymentCheckedAt?: string | null;
};

function parseStoredPayment(order: LegacyStoredOpcOrder): StoredOpcPayment {
  const storedAmount = order.payment?.amount;
  const amount = (
    storedAmount?.currency === "CNY"
    && Number.isSafeInteger(storedAmount.minorUnits)
    && alipayDecimalToAmount(storedAmount.decimal)?.minorUnits === storedAmount.minorUnits
  )
    ? storedAmount
    : typeof order.alipayAmount === "string"
      ? alipayDecimalToAmount(order.alipayAmount)
      : catalogPriceToAlipayAmount(order.quotedPrice ?? "");
  if (!amount) throw new Error("OPC 订单记录缺少有效的人民币支付金额。");
  return {
    provider: "alipay",
    amount,
    appId: order.payment?.appId ?? null,
    sellerId: order.payment?.sellerId ?? order.alipaySellerId ?? null,
    tradeNo: order.payment?.tradeNo ?? order.alipayTradeNo ?? null,
    tradeStatus: order.payment?.tradeStatus ?? order.alipayTradeStatus ?? null,
    channel: order.payment?.channel ?? order.paymentChannel ?? null,
    requestCreatedAt: order.payment?.requestCreatedAt ?? order.paymentRequestCreatedAt ?? null,
    notifiedAt: order.payment?.notifiedAt ?? order.paymentNotifiedAt ?? null,
    checkedAt: order.payment?.checkedAt ?? order.paymentCheckedAt ?? null,
  };
}

const orderDocument: StateDocumentDefinition<OpcOrderStore> = {
  namespace: "opc-orders",
  fileName: "opc-orders.json",
  create: () => ({ version: 8, orders: [] }),
  parse: (value) => {
    const parsed = value as { version?: unknown; orders?: unknown[] };
    if (![1, 2, 3, 4, 5, 6, 7, 8].includes(parsed.version as number) || !Array.isArray(parsed.orders)) {
      throw new Error("OPC 订单存储格式无效。");
    }
    return {
      version: 8,
      orders: parsed.orders.map((value) => {
        const order = value as LegacyStoredOpcOrder;
        if (
          !order.id
          || !order.reference
          || !order.serviceName
          || !order.quotedPrice
        ) {
          throw new Error("OPC 订单记录缺少必要字段。");
        }
        const {
          alipayAmount: _alipayAmount,
          alipaySellerId: _alipaySellerId,
          alipayTradeNo: _alipayTradeNo,
          alipayTradeStatus: _alipayTradeStatus,
          paymentChannel: _paymentChannel,
          paymentRequestCreatedAt: _paymentRequestCreatedAt,
          paymentNotifiedAt: _paymentNotifiedAt,
          paymentCheckedAt: _paymentCheckedAt,
          resumeTokenEncrypted: _resumeTokenEncrypted,
          ...record
        } = order;
        return {
          ...record,
          servicePeriod: order.servicePeriod ?? "",
          serviceOutcome: order.serviceOutcome ?? "",
          serviceScope: order.serviceScope ?? "",
          serviceBoundary: order.serviceBoundary ?? "",
          requestFingerprint: /^[a-f0-9]{64}$/.test(order.requestFingerprint ?? "")
            ? order.requestFingerprint!
            : null,
          payment: parseStoredPayment(order),
          paymentReceipt: order.paymentReceipt ? {
            ...order.paymentReceipt,
            reference: order.paymentReceipt.reference ?? order.reference,
            paymentStatus: order.paymentReceipt.paymentStatus ?? "verified_paid",
          } : null,
          notifications: (order.notifications ?? []).map((event) => ({
            ...event,
            claimId: event.claimId ?? null,
            leaseExpiresAt: event.leaseExpiresAt ?? null,
          })),
          refund: order.refund ?? null,
          signatureMethod: order.signatureMethod ?? "electronic",
          checkoutAgreement: order.checkoutAgreement ? {
            ...order.checkoutAgreement,
            title: order.checkoutAgreement.title ?? "OPC 在线订单及纸质合同预付款协议",
            text: order.checkoutAgreement.text ?? "",
          } : null,
          paperContractApprovedAt: order.paperContractApprovedAt ?? null,
          signerEncrypted: order.signerEncrypted ?? null,
          deliveryEncrypted: order.deliveryEncrypted ?? null,
          resumeTokenHash: order.resumeTokenHash ?? null,
          resumeTokenNonce: order.resumeTokenNonce ?? null,
          resumeTokenKeyId: order.resumeTokenKeyId ?? null,
          resumeTokenExpiresAt: order.resumeTokenExpiresAt ?? null,
          signature: {
            ...(order.signature ?? {
            provider: "legacy",
            status: "completed",
            flowId: null,
            fileId: null,
            templateId: null,
            templateVersion: null,
            createdAt: order.createdAt ?? null,
            notifiedAt: null,
            checkedAt: order.createdAt ?? null,
            completedAt: order.createdAt ?? null,
            failureReason: null,
            }),
            preparationClaimId: order.signature?.preparationClaimId ?? null,
            preparationLeaseExpiresAt: order.signature?.preparationLeaseExpiresAt ?? null,
            archiveClaimId: order.signature?.archiveClaimId ?? null,
            archiveLeaseExpiresAt: order.signature?.archiveLeaseExpiresAt ?? null,
            callbackEventHashes: order.signature?.callbackEventHashes ?? [],
            archive: order.signature?.archive ?? {
              status: order.signature?.provider === "legacy" ? "archived" : "pending",
              objectKey: null,
              manifestKey: null,
              sha256: null,
              sizeBytes: null,
              verifiedAt: null,
              archivedAt: order.signature?.provider === "legacy" ? order.createdAt ?? null : null,
              retainUntil: null,
              evidence: [],
              failureReason: null,
            },
          },
        } as StoredOpcOrder;
      }),
    };
  },
};

export function idempotencyHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function orderRequestFingerprint(input: {
  serviceKind: "infrastructure" | "specialty";
  serviceSlug: string;
  serviceCode: string;
  serviceName: string;
  serviceRevision: string;
  quotedPrice: string;
  contact: OpcOrderContact;
  signer: OpcSignerParty;
  signatureMethod?: "paper" | "electronic";
  delivery?: OpcPaperDelivery;
  agreement?: OpcCheckoutAgreement;
}) {
  const agreement = input.agreement
    ? { version: input.agreement.version, sha256: input.agreement.sha256 }
    : null;
  return createHash("sha256").update(JSON.stringify({
    serviceKind: input.serviceKind,
    serviceSlug: input.serviceSlug,
    serviceCode: input.serviceCode,
    serviceName: input.serviceName,
    serviceRevision: input.serviceRevision,
    quotedPrice: input.quotedPrice,
    contact: input.contact,
    signer: input.signer,
    signatureMethod: input.signatureMethod ?? "electronic",
    delivery: input.delivery ?? null,
    // acceptedAt is server-generated request metadata, not part of the
    // customer's semantic checkout intent. Retrying the same request must not
    // conflict merely because the route generated a later acceptance timestamp.
    agreement,
  })).digest("hex");
}

function orderReference(now = new Date()) {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `OPC-${date}-${randomBytes(6).toString("hex").toUpperCase()}`;
}

export function uniqueOrderReference(store: OpcOrderStore) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = orderReference();
    if (!store.orders.some((order) => order.reference === candidate)) return candidate;
  }
  throw new Error("暂时无法生成唯一订单号，请重新提交。");
}

function deriveResumeToken(reference: string, nonce: string, keyId: string) {
  const keyring = opcResumeTokenKeyring();
  const secret = keyring.keys.get(keyId);
  if (!secret) return null;
  return createHmac("sha256", secret).update(`${reference}.${nonce}`).digest("base64url");
}

export function createResumeCredential(reference: string, now: Date) {
  const keyring = opcResumeTokenKeyring();
  const nonce = randomBytes(16).toString("base64url");
  const token = deriveResumeToken(reference, nonce, keyring.activeKeyId);
  if (!token) throw new Error("OPC 订单恢复令牌密钥不可用。");
  return {
    token,
    nonce,
    keyId: keyring.activeKeyId,
    expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function recoverResumeToken(order: StoredOpcOrder) {
  if (!order.resumeTokenNonce || !order.resumeTokenKeyId || !order.resumeTokenExpiresAt) return null;
  if (Date.now() >= new Date(order.resumeTokenExpiresAt).getTime()) return null;
  const token = deriveResumeToken(order.reference, order.resumeTokenNonce, order.resumeTokenKeyId);
  return token && idempotencyHash(token) === order.resumeTokenHash ? token : null;
}

export function publicOrder(order: StoredOpcOrder) {
  return {
    id: order.id,
    reference: order.reference,
    status: order.status,
    signatureMethod: order.signatureMethod,
    serviceName: order.serviceName,
    quotedPrice: order.quotedPrice,
    paymentAmount: order.payment.amount,
    signatureStatus: order.signature.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export function scrubExpiredContacts(store: OpcOrderStore, now: Date) {
  let scrubbed = 0;
  for (const order of store.orders) {
    const terminalAt = order.refundedAt ?? order.completedAt ?? order.cancelledAt;
    const retentionDays = order.cancelledAt && !order.paidAt ? 90 : 730;
    const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
    if (
      order.contactEncrypted
      && terminalAt
      && new Date(terminalAt).getTime() <= cutoff
    ) {
      order.contactEncrypted = null;
      if (order.signerEncrypted) {
        const signer = JSON.parse(decryptSensitiveText(order.signerEncrypted)) as OpcSignerParty;
        order.signerEncrypted = encryptSensitiveText(JSON.stringify({ ...signer, phone: "" }));
      }
      order.deliveryEncrypted = null;
      order.resumeTokenHash = null;
      order.resumeTokenNonce = null;
      order.resumeTokenKeyId = null;
      order.resumeTokenExpiresAt = null;
      order.contactDeletedAt = now.toISOString();
      scrubbed += 1;
    }
  }
  return scrubbed;
}

function maskPhone(phone: string) {
  const normalized = phone.trim();
  if (normalized.length <= 7) return "****";
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

function maskDeliveryAddress(delivery: OpcPaperDelivery | null) {
  if (!delivery) return "";
  return `${delivery.province}${delivery.city}${delivery.district}******`;
}

export function ensurePaperPaymentArtifacts(order: StoredOpcOrder, timestamp: string, tradeNo: string) {
  if (!order.paymentReceipt) {
    const contact = order.contactEncrypted
      ? JSON.parse(decryptSensitiveText(order.contactEncrypted)) as OpcOrderContact
      : { name: "", phone: "", email: "", wechat: "", note: "" };
    const signer = order.signerEncrypted
      ? JSON.parse(decryptSensitiveText(order.signerEncrypted)) as OpcSignerParty
      : {
          type: "individual" as const,
          name: "",
          phone: "",
          organizationName: "",
          organizationCreditCode: "",
          legalRepresentativeName: "",
        };
    const delivery = order.deliveryEncrypted
      ? JSON.parse(decryptSensitiveText(order.deliveryEncrypted)) as OpcPaperDelivery
      : null;
    const snapshot = {
      receiptId: randomUUID(),
      receiptNumber: `V2077-PAY-${order.reference.slice(4)}`,
      reference: order.reference,
      paymentStatus: "verified_paid" as const,
      generatedAt: timestamp,
      operator: {
        name: LEGAL_OPERATOR_NAME,
        creditCode: LEGAL_OPERATOR_CREDIT_CODE,
        publicOrigin: PUBLIC_ORIGIN,
        icpNumber: ICP_NUMBER,
      },
      customer: {
        type: signer.type,
        name: signer.name,
        organizationName: signer.organizationName,
        organizationCreditCode: signer.organizationCreditCode,
        legalRepresentativeName: signer.legalRepresentativeName,
        contactName: contact.name,
        maskedPhone: maskPhone(contact.phone || signer.phone),
        maskedDeliveryAddress: maskDeliveryAddress(delivery),
      },
      service: {
        code: order.serviceCode,
        name: order.serviceName,
        revision: order.serviceRevision,
        outcome: order.serviceOutcome,
        scope: order.serviceScope,
        boundary: order.serviceBoundary,
      },
      payment: {
        provider: "alipay" as const,
        amount: order.payment.amount,
        paidAt: timestamp,
        tradeNo,
      },
    };
    order.paymentReceipt = {
      ...snapshot,
      snapshotSha256: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
    };
  }
  const eventId = `payment-confirmed:${order.id}`;
  if (!order.notifications.some((event) => event.eventId === eventId)) {
    order.notifications.push({
      eventId,
      eventType: "payment_confirmed",
      recipient: PRODUCTION_ADMIN_EMAIL,
      status: "pending",
      attempts: 0,
      nextAttemptAt: timestamp,
      sentAt: null,
      lastError: null,
      claimId: null,
      leaseExpiresAt: null,
    });
  }
}

export function validResumeToken(order: StoredOpcOrder, token: string) {
  if (!order.resumeTokenExpiresAt || Date.now() >= new Date(order.resumeTokenExpiresAt).getTime()) return false;
  const actual = Buffer.from(idempotencyHash(token));
  const expected = Buffer.from(order.resumeTokenHash ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function applySignatureStatus(order: StoredOpcOrder, status: OpcEsignFlowStatus, timestamp: string) {
  order.signature.status = status;
  order.signature.checkedAt = timestamp;
  order.updatedAt = timestamp;
  if (status === "completed") order.signature.completedAt ??= timestamp;
}

export function readOpcOrderStore() {
  return readStateDocument(orderDocument);
}

export function mutateOpcOrderStore<Result>(
  mutator: (store: OpcOrderStore) => Result | Promise<Result>,
) {
  return mutateStateDocument(orderDocument, mutator);
}
