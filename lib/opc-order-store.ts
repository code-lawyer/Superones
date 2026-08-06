import "server-only";

import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  alipayDecimalToAmount,
  catalogPriceToAlipayAmount,
  type OpcAlipayAmount,
  type OpcAlipayChannel,
  type OpcAlipayPaymentOrder,
  type OpcAlipayQueryResult,
} from "./opc-payment-config.ts";
import { decryptSensitiveText, encryptSensitiveText } from "./sensitive-data.ts";
import type { OpcEsignCreatedFlow, OpcEsignFlowStatus, OpcSignerParty } from "./opc-esign.ts";
import type { OpcContractArchiveRecord } from "./opc-contract-archive.ts";
import { opcResumeTokenKeyring } from "./secret-keyring.ts";
import { PRODUCTION_ADMIN_EMAIL } from "./admin-profile.ts";
import {
  ICP_NUMBER,
  LEGAL_OPERATOR_CREDIT_CODE,
  LEGAL_OPERATOR_NAME,
  PUBLIC_ORIGIN,
} from "./legal-profile.ts";
import {
  mutateStateDocument,
  readStateDocument,
  type StateDocumentDefinition,
} from "./state-document-store.ts";

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

type StoredOpcOrder = {
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

function assertExpectedUpdatedAt(order: StoredOpcOrder, expectedUpdatedAt?: string) {
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

function idempotencyHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function orderRequestFingerprint(input: {
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

function uniqueOrderReference(store: OpcOrderStore) {
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

function createResumeCredential(reference: string, now: Date) {
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

function recoverResumeToken(order: StoredOpcOrder) {
  if (!order.resumeTokenNonce || !order.resumeTokenKeyId || !order.resumeTokenExpiresAt) return null;
  if (Date.now() >= new Date(order.resumeTokenExpiresAt).getTime()) return null;
  const token = deriveResumeToken(order.reference, order.resumeTokenNonce, order.resumeTokenKeyId);
  return token && idempotencyHash(token) === order.resumeTokenHash ? token : null;
}

function publicOrder(order: StoredOpcOrder) {
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

function scrubExpiredContacts(store: OpcOrderStore, now: Date) {
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

export async function runOpcOrderRetention(now = new Date()) {
  return mutateStateDocument(orderDocument, (store) => ({
    scrubbed: scrubExpiredContacts(store, now),
    checkedAt: now.toISOString(),
  }));
}

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
  signatureMethod?: "paper" | "electronic";
  delivery?: OpcPaperDelivery;
  agreement?: OpcCheckoutAgreement;
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
  const paymentAmount = catalogPriceToAlipayAmount(input.quotedPrice);
  if (!paymentAmount) throw new Error("服务公开价格无法转换为支付宝订单金额。");
  const requestHash = idempotencyHash(input.idempotencyKey);
  const requestFingerprint = orderRequestFingerprint(input);
  return mutateStateDocument(orderDocument, (store) => {
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
    const resumeCredential = createResumeCredential(reference, now);
    const order: StoredOpcOrder = {
      id: randomUUID(),
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
        provider: "alipay",
        amount: paymentAmount,
        appId: null,
        sellerId: null,
        tradeNo: null,
        tradeStatus: null,
        channel: null,
        requestCreatedAt: null,
        notifiedAt: null,
        checkedAt: null,
      },
      paymentReceipt: null,
      notifications: [],
      refund: null,
      signatureMethod,
      checkoutAgreement: input.agreement ?? null,
      contactEncrypted: encryptSensitiveText(JSON.stringify(input.contact)),
      signerEncrypted: encryptSensitiveText(JSON.stringify(input.signer)),
      deliveryEncrypted: input.delivery ? encryptSensitiveText(JSON.stringify(input.delivery)) : null,
      resumeTokenHash: idempotencyHash(resumeCredential.token),
      resumeTokenNonce: resumeCredential.nonce,
      resumeTokenKeyId: resumeCredential.keyId,
      resumeTokenExpiresAt: resumeCredential.expiresAt,
      signature: {
        provider: "mock",
        status: "preparing",
        flowId: null,
        fileId: null,
        templateId: null,
        templateVersion: null,
        createdAt: timestamp,
        notifiedAt: null,
        checkedAt: null,
        completedAt: null,
        failureReason: null,
        preparationClaimId: null,
        preparationLeaseExpiresAt: null,
        archiveClaimId: null,
        archiveLeaseExpiresAt: null,
        callbackEventHashes: [],
        archive: {
          status: "pending",
          objectKey: null,
          manifestKey: null,
          sha256: null,
          sizeBytes: null,
          verifiedAt: null,
          archivedAt: null,
          retainUntil: null,
          evidence: [],
          failureReason: null,
        },
      },
      status: signatureMethod === "paper" ? "awaiting_payment" : "awaiting_signature",
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

export async function getOpcOrderPaymentOrder(reference: string): Promise<OpcAlipayPaymentOrder> {
  const store = await readStateDocument(orderDocument);
  const order = store.orders.find((value) => value.reference === reference);
  if (!order) throw new Error("OPC 订单不存在。");
  if (order.status !== "awaiting_payment") throw new Error("该 OPC 订单当前不接受重复付款。");
  return {
    reference: order.reference,
    serviceCode: order.serviceCode,
    serviceName: order.serviceName,
    serviceRevision: order.serviceRevision,
    paymentAmount: order.payment.amount,
  };
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

function ensurePaperPaymentArtifacts(order: StoredOpcOrder, timestamp: string, tradeNo: string) {
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

export async function recordOpcPaymentRequest(
  reference: string,
  channel: OpcAlipayChannel,
  sellerId: string,
  appId: string,
) {
  return mutateStateDocument(orderDocument, (store) => {
    const order = store.orders.find((value) => value.reference === reference);
    if (!order) throw new Error("OPC 订单不存在。");
    if (order.status !== "awaiting_payment") throw new Error("该 OPC 订单当前不接受重复付款。");
    if (!/^\d{16,32}$/.test(appId)) throw new Error("支付宝应用 ID 格式无效。");
    if (!/^\d{16,32}$/.test(sellerId)) throw new Error("支付宝商户 PID 格式无效。");
    if (order.payment.appId && order.payment.appId !== appId) {
      throw new Error("OPC 订单绑定的支付宝应用 ID 与当前配置不一致。");
    }
    if (order.payment.sellerId && order.payment.sellerId !== sellerId) {
      throw new Error("OPC 订单绑定的支付宝商户 PID 与当前配置不一致。");
    }
    const timestamp = new Date().toISOString();
    order.payment.appId = appId;
    order.payment.sellerId = sellerId;
    order.payment.channel = channel;
    order.payment.requestCreatedAt = timestamp;
    order.updatedAt = timestamp;
    return publicOrder(order);
  });
}

function validResumeToken(order: StoredOpcOrder, token: string) {
  if (!order.resumeTokenExpiresAt || Date.now() >= new Date(order.resumeTokenExpiresAt).getTime()) return false;
  const actual = Buffer.from(idempotencyHash(token));
  const expected = Buffer.from(order.resumeTokenHash ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function claimOpcSignaturePreparation(reference: string, resumeToken: string) {
  return mutateStateDocument(orderDocument, (store) => {
    const order = store.orders.find((value) => value.reference === reference);
    if (!order || !validResumeToken(order, resumeToken)) throw new Error("订单签署凭据无效或已经过期。");
    if (order.signature.flowId) return { claimed: false as const, flowExists: true as const, claimId: null };
    const now = new Date();
    if (
      order.signature.preparationClaimId
      && order.signature.preparationLeaseExpiresAt
      && new Date(order.signature.preparationLeaseExpiresAt).getTime() > now.getTime()
    ) {
      return { claimed: false as const, flowExists: false as const, claimId: null };
    }
    const claimId = randomUUID();
    order.signature.preparationClaimId = claimId;
    order.signature.preparationLeaseExpiresAt = new Date(now.getTime() + 2 * 60_000).toISOString();
    order.signature.status = "preparing";
    order.signature.failureReason = null;
    order.updatedAt = now.toISOString();
    return { claimed: true as const, flowExists: false as const, claimId };
  });
}

export async function getOpcSignaturePreparation(reference: string, resumeToken: string) {
  const store = await readStateDocument(orderDocument);
  const order = store.orders.find((value) => value.reference === reference);
  if (!order || !validResumeToken(order, resumeToken) || !order.signerEncrypted) {
    throw new Error("订单签署凭据无效或已经过期。");
  }
  const signer = JSON.parse(decryptSensitiveText(order.signerEncrypted)) as OpcSignerParty;
  return {
    reference: order.reference,
    status: order.status,
    signature: order.signature,
    signer,
    fields: {
      order_reference: order.reference,
      service_code: order.serviceCode,
      service_name: order.serviceName,
      service_revision: order.serviceRevision,
      quoted_price: order.quotedPrice,
      service_period: order.servicePeriod,
      service_outcome: order.serviceOutcome,
      service_scope: order.serviceScope,
      service_boundary: order.serviceBoundary,
      provider_name: LEGAL_OPERATOR_NAME,
      provider_credit_code: LEGAL_OPERATOR_CREDIT_CODE,
      customer_name: signer.name,
      customer_phone: signer.phone,
      customer_org_name: signer.organizationName,
      customer_org_credit_code: signer.organizationCreditCode,
      customer_legal_representative: signer.legalRepresentativeName,
    },
  };
}

export async function bindOpcSignatureFlow(
  reference: string,
  resumeToken: string,
  claimId: string,
  flow: OpcEsignCreatedFlow,
) {
  return mutateStateDocument(orderDocument, (store) => {
    const order = store.orders.find((value) => value.reference === reference);
    if (!order || !validResumeToken(order, resumeToken)) throw new Error("订单签署凭据无效或已经过期。");
    if (order.signature.preparationClaimId !== claimId) throw new Error("订单签署创建租约无效或已经过期。");
    if (order.signature.flowId && order.signature.flowId !== flow.flowId) {
      throw new Error("订单已经绑定其他签署流程。");
    }
    const timestamp = new Date().toISOString();
    order.signature = {
      ...order.signature,
      provider: flow.provider,
      status: "awaiting_signer",
      flowId: flow.flowId,
      fileId: flow.fileId,
      templateId: flow.templateId,
      templateVersion: flow.templateVersion,
      createdAt: order.signature.createdAt ?? timestamp,
      failureReason: null,
      preparationClaimId: null,
      preparationLeaseExpiresAt: null,
    };
    order.updatedAt = timestamp;
    return { ...publicOrder(order), resumeToken };
  });
}

export async function markOpcSignaturePreparationFailed(reference: string, resumeToken: string, claimId: string) {
  return mutateStateDocument(orderDocument, (store) => {
    const order = store.orders.find((value) => value.reference === reference);
    if (!order || !validResumeToken(order, resumeToken) || order.signature.preparationClaimId !== claimId) return;
    order.signature.status = "failed";
    order.signature.failureReason = "provider_request_failed";
    order.signature.preparationClaimId = null;
    order.signature.preparationLeaseExpiresAt = null;
    order.updatedAt = new Date().toISOString();
  });
}

export async function recordOpcSignatureCallback(flowId: string, eventHash: string) {
  return mutateStateDocument(orderDocument, (store) => {
    const order = store.orders.find((value) => value.signature.flowId === flowId);
    if (!order) return null;
    if (!/^[a-f0-9]{64}$/.test(eventHash)) throw new Error("签署回调事件摘要无效。");
    if (order.signature.callbackEventHashes.includes(eventHash)) return publicOrder(order);
    const timestamp = new Date().toISOString();
    order.signature.notifiedAt ??= timestamp;
    order.signature.callbackEventHashes = [...order.signature.callbackEventHashes.slice(-31), eventHash];
    order.updatedAt = timestamp;
    return publicOrder(order);
  });
}

function applySignatureStatus(order: StoredOpcOrder, status: OpcEsignFlowStatus, timestamp: string) {
  order.signature.status = status;
  order.signature.checkedAt = timestamp;
  order.updatedAt = timestamp;
  if (status === "completed") order.signature.completedAt ??= timestamp;
}

export async function applyOpcSignatureStatus(
  reference: string,
  resumeToken: string,
  status: OpcEsignFlowStatus,
) {
  return mutateStateDocument(orderDocument, (store) => {
    const order = store.orders.find((value) => value.reference === reference);
    if (!order || !validResumeToken(order, resumeToken)) throw new Error("订单签署凭据无效或已经过期。");
    if (!order.signature.flowId) throw new Error("订单尚未建立签署流程。");
    const timestamp = new Date().toISOString();
    applySignatureStatus(order, status, timestamp);
    return { ...publicOrder(order), resumeToken };
  });
}

export async function applyOpcSignatureStatusByFlow(flowId: string, status: OpcEsignFlowStatus) {
  return mutateStateDocument(orderDocument, (store) => {
    const order = store.orders.find((value) => value.signature.flowId === flowId);
    if (!order) throw new Error("签署流程未匹配到 OPC 订单。");
    const timestamp = new Date().toISOString();
    applySignatureStatus(order, status, timestamp);
    return publicOrder(order);
  });
}

export async function getOpcOrderByResumeToken(reference: string, resumeToken: string) {
  const store = await readStateDocument(orderDocument);
  const order = store.orders.find((value) => value.reference === reference);
  if (!order || !validResumeToken(order, resumeToken)) throw new Error("订单签署凭据无效或已经过期。");
  return {
    ...publicOrder(order),
    flowId: order.signature.flowId,
    provider: order.signature.provider,
    resumeToken,
  };
}

export async function completeMockOpcSignature(reference: string, resumeToken: string) {
  if (process.env.NODE_ENV === "production") throw new Error("生产环境不能使用模拟签署。");
  return applyOpcSignatureStatus(reference, resumeToken, "completed");
}

export async function getOpcSignatureArchivePreparationByFlow(flowId: string) {
  const store = await readStateDocument(orderDocument);
  const order = store.orders.find((value) => value.signature.flowId === flowId);
  if (!order || !order.signature.fileId) throw new Error("签署流程未匹配到可归档的 OPC 订单。");
  return {
    reference: order.reference,
    flowId,
    fileId: order.signature.fileId,
    provider: order.signature.provider,
    signatureStatus: order.signature.status,
    archive: order.signature.archive,
  };
}

export async function claimOpcSignatureArchive(flowId: string) {
  return mutateStateDocument(orderDocument, (store) => {
    const order = store.orders.find((value) => value.signature.flowId === flowId);
    if (!order) throw new Error("签署流程未匹配到 OPC 订单。");
    if (order.signature.archive.status === "archived") return { claimed: false as const, archived: true as const, claimId: null };
    const now = new Date();
    if (
      order.signature.archiveClaimId
      && order.signature.archiveLeaseExpiresAt
      && new Date(order.signature.archiveLeaseExpiresAt).getTime() > now.getTime()
    ) {
      return { claimed: false as const, archived: false as const, claimId: null };
    }
    const claimId = randomUUID();
    order.signature.archiveClaimId = claimId;
    order.signature.archiveLeaseExpiresAt = new Date(now.getTime() + 5 * 60_000).toISOString();
    order.signature.archive.status = "pending";
    order.signature.archive.failureReason = null;
    order.updatedAt = now.toISOString();
    return { claimed: true as const, archived: false as const, claimId };
  });
}

export async function completeOpcSignatureArchive(
  flowId: string,
  claimId: string,
  archive: Omit<OpcContractArchiveRecord, "status" | "failureReason">,
) {
  return mutateStateDocument(orderDocument, (store) => {
    const order = store.orders.find((value) => value.signature.flowId === flowId);
    if (!order) throw new Error("签署流程未匹配到 OPC 订单。");
    if (order.signature.status !== "completed") throw new Error("签署流程尚未完成，不能归档放行付款。");
    if (order.signature.archiveClaimId !== claimId) throw new Error("合同归档租约无效或已经过期。");
    const timestamp = new Date().toISOString();
    order.signature.archive = { ...archive, status: "archived", failureReason: null };
    order.signature.archiveClaimId = null;
    order.signature.archiveLeaseExpiresAt = null;
    if (order.status === "awaiting_signature") order.status = "awaiting_payment";
    order.updatedAt = timestamp;
    return publicOrder(order);
  });
}

export async function markOpcSignatureArchiveFailed(flowId: string, claimId: string, reason = "archive_failed") {
  return mutateStateDocument(orderDocument, (store) => {
    const order = store.orders.find((value) => value.signature.flowId === flowId);
    if (!order || order.signature.archiveClaimId !== claimId) return null;
    order.signature.archive.status = "failed";
    order.signature.archive.failureReason = reason;
    order.signature.archiveClaimId = null;
    order.signature.archiveLeaseExpiresAt = null;
    order.updatedAt = new Date().toISOString();
    return publicOrder(order);
  });
}

export async function applyOpcAlipayTradeResult(input: {
  reference: string;
  configuredSellerId?: string;
  sellerId?: string;
  appId: string;
  tradeNo: string | null;
  tradeStatus: string;
  amount: OpcAlipayAmount | null;
  source: "notify" | "query";
}) {
  return mutateStateDocument(orderDocument, (store) => {
    const order = store.orders.find((value) => value.reference === input.reference);
    if (!order) throw new Error("OPC 订单不存在。");
    if (!input.appId || (order.payment.appId && input.appId !== order.payment.appId)) {
      throw new Error("支付宝交易应用 ID 与 OPC 订单绑定应用不一致。");
    }
    const evidenceSellerId = input.source === "notify" ? input.sellerId : input.configuredSellerId;
    if (!evidenceSellerId || !/^\d{16,32}$/.test(evidenceSellerId)) {
      throw new Error("支付宝交易商户 PID 格式无效。");
    }
    if (order.payment.sellerId && evidenceSellerId !== order.payment.sellerId) {
      throw new Error("支付宝交易商户 PID 与 OPC 订单绑定商户不一致。");
    }
    if (input.amount && input.amount.minorUnits !== order.payment.amount.minorUnits) {
      throw new Error("支付宝交易金额与 OPC 订单金额不一致。");
    }
    if (
      input.tradeNo
      && store.orders.some((value) => value.id !== order.id && value.payment.tradeNo === input.tradeNo)
    ) {
      throw new Error("支付宝交易号已关联到其他 OPC 订单。");
    }
    if (
      (input.tradeStatus === "TRADE_SUCCESS" || input.tradeStatus === "TRADE_FINISHED")
      && (!input.tradeNo || !input.amount)
    ) {
      throw new Error("支付宝已支付交易缺少交易号或金额。");
    }

    const timestamp = new Date().toISOString();
    order.payment.appId ??= input.appId;
    order.payment.sellerId = evidenceSellerId;
    order.payment.tradeNo = input.tradeNo ?? order.payment.tradeNo;
    order.payment.tradeStatus = input.tradeStatus;
    order.updatedAt = timestamp;
    if (input.source === "notify") order.payment.notifiedAt = timestamp;
    else order.payment.checkedAt = timestamp;

    if (input.tradeStatus === "TRADE_SUCCESS" || input.tradeStatus === "TRADE_FINISHED") {
      order.paidAt ??= timestamp;
      if (order.signatureMethod === "paper") {
        ensurePaperPaymentArtifacts(order, order.paidAt, input.tradeNo!);
        if (!["paid", "refund_pending", "completed", "refunded"].includes(order.status)) {
          order.status = "paid_pending_contract";
          order.cancelledAt = null;
        }
      } else {
        const contractReady = order.signature.status === "completed" && order.signature.archive.status === "archived";
        if (order.status !== "completed" && order.status !== "refunded") {
          order.status = contractReady ? "paid" : "payment_exception";
        }
        if (contractReady) order.cancelledAt = null;
      }
    }
    return publicOrder(order);
  });
}

export async function recordOpcAlipayQuery(reference: string, result: OpcAlipayQueryResult) {
  if (!result.found) {
    return applyOpcAlipayTradeResult({
      reference,
      appId: result.appId,
      configuredSellerId: result.configuredSellerId,
      tradeNo: null,
      tradeStatus: "TRADE_NOT_EXIST",
      amount: null,
      source: "query",
    });
  }
  return applyOpcAlipayTradeResult({
    reference,
    appId: result.appId,
    configuredSellerId: result.configuredSellerId,
    tradeNo: result.tradeNo,
    tradeStatus: result.tradeStatus ?? "UNKNOWN",
    amount: result.amount,
    source: "query",
  });
}

export async function claimOpcPublicPaymentQuery(reference: string, minimumIntervalMs = 15_000) {
  return mutateStateDocument(orderDocument, (store) => {
    const order = store.orders.find((value) => value.reference === reference);
    if (!order) throw new Error("OPC 订单不存在。");
    if (order.status !== "awaiting_payment" && order.status !== "payment_exception") return false;
    const now = new Date();
    const lastAttempt = order.payment.checkedAt ? new Date(order.payment.checkedAt).getTime() : 0;
    if (Number.isFinite(lastAttempt) && now.getTime() - lastAttempt < minimumIntervalMs) return false;
    // checkedAt is the time of the latest signed provider-query attempt. Claiming
    // it atomically prevents parallel tabs from fanning out provider requests.
    order.payment.checkedAt = now.toISOString();
    return true;
  });
}

export async function claimNextOpcPaymentNotification() {
  return mutateStateDocument(orderDocument, (store) => {
    const now = new Date();
    const order = store.orders.find((candidate) => candidate.notifications.some((event) => {
      const due = new Date(event.nextAttemptAt).getTime() <= now.getTime();
      const expiredLease = event.status === "sending"
        && (!event.leaseExpiresAt || new Date(event.leaseExpiresAt).getTime() <= now.getTime());
      return due && (event.status === "pending" || event.status === "failed" || expiredLease);
    }));
    if (!order) return null;
    const event = order.notifications.find((candidate) => {
      const due = new Date(candidate.nextAttemptAt).getTime() <= now.getTime();
      const expiredLease = candidate.status === "sending"
        && (!candidate.leaseExpiresAt || new Date(candidate.leaseExpiresAt).getTime() <= now.getTime());
      return due && (candidate.status === "pending" || candidate.status === "failed" || expiredLease);
    });
    if (!event || !order.paymentReceipt) return null;
    const claimId = randomUUID();
    event.status = "sending";
    event.attempts += 1;
    event.claimId = claimId;
    event.leaseExpiresAt = new Date(now.getTime() + 2 * 60_000).toISOString();
    order.updatedAt = now.toISOString();
    return {
      claimId,
      eventId: event.eventId,
      recipient: event.recipient,
      reference: order.reference,
      serviceName: order.serviceName,
      serviceCode: order.serviceCode,
      amount: order.payment.amount,
      paidAt: order.paidAt!,
      tradeNo: order.payment.tradeNo!,
    };
  });
}

export async function completeOpcPaymentNotification(eventId: string, claimId: string) {
  return mutateStateDocument(orderDocument, (store) => {
    for (const order of store.orders) {
      const event = order.notifications.find((candidate) => candidate.eventId === eventId);
      if (!event || event.claimId !== claimId) continue;
      const timestamp = new Date().toISOString();
      event.status = "sent";
      event.sentAt = timestamp;
      event.lastError = null;
      event.claimId = null;
      event.leaseExpiresAt = null;
      order.updatedAt = timestamp;
      return true;
    }
    return false;
  });
}

export async function failOpcPaymentNotification(eventId: string, claimId: string, reason: string) {
  return mutateStateDocument(orderDocument, (store) => {
    for (const order of store.orders) {
      const event = order.notifications.find((candidate) => candidate.eventId === eventId);
      if (!event || event.claimId !== claimId) continue;
      const now = new Date();
      const delayMinutes = Math.min(60, 2 ** Math.min(event.attempts, 6));
      event.status = "failed";
      event.lastError = reason.slice(0, 240);
      event.nextAttemptAt = new Date(now.getTime() + delayMinutes * 60_000).toISOString();
      event.claimId = null;
      event.leaseExpiresAt = null;
      order.updatedAt = now.toISOString();
      return true;
    }
    return false;
  });
}

export async function beginOpcFullRefund(id: string, reason: string, expectedUpdatedAt?: string) {
  return mutateStateDocument(orderDocument, (store) => {
    const order = store.orders.find((value) => value.id === id);
    if (!order) throw new Error("OPC 订单不存在。");
    assertExpectedUpdatedAt(order, expectedUpdatedAt);
    if (order.refund?.status === "succeeded" || order.status === "refunded") {
      return { alreadyRefunded: true as const, order: publicOrder(order), request: null };
    }
    if (order.signatureMethod !== "paper") throw new Error("该操作只适用于纸质签约订单。");
    if (!["paid_pending_contract", "paid", "refund_pending"].includes(order.status)) {
      throw new Error(`订单不能从 ${order.status} 发起退款。`);
    }
    if (!order.payment.tradeNo || !order.paidAt) throw new Error("订单缺少已核验的支付宝交易信息。");
    if (order.refund?.status === "pending") {
      return {
        alreadyRefunded: false as const,
        newlyRequested: false as const,
        order: publicOrder(order),
        request: {
          reference: order.reference,
          tradeNo: order.payment.tradeNo,
          refundRequestNo: order.refund.requestNo,
          reason: order.refund.reason,
          amount: order.refund.amount,
        },
      };
    }
    const timestamp = new Date().toISOString();
    order.refund ??= {
      status: "pending",
      requestNo: `RF-${order.reference.replaceAll("-", "")}`,
      reason: reason.trim().slice(0, 200) || "纸质合同未获确认",
      amount: order.payment.amount,
      requestedAt: timestamp,
      completedAt: null,
    };
    order.status = "refund_pending";
    order.updatedAt = timestamp;
    return {
      alreadyRefunded: false as const,
      newlyRequested: true as const,
      order: publicOrder(order),
      request: {
        reference: order.reference,
        tradeNo: order.payment.tradeNo,
        refundRequestNo: order.refund.requestNo,
        reason: order.refund.reason,
        amount: order.refund.amount,
      },
    };
  });
}

export async function completeOpcFullRefund(input: {
  id: string;
  reference: string;
  refundRequestNo: string;
  amount: OpcAlipayAmount;
  expectedUpdatedAt?: string;
}) {
  return mutateStateDocument(orderDocument, (store) => {
    const order = store.orders.find((value) => value.id === input.id);
    if (!order) throw new Error("OPC 订单不存在。");
    assertExpectedUpdatedAt(order, input.expectedUpdatedAt);
    if (order.status === "refunded" && order.refund?.status === "succeeded") return publicOrder(order);
    if (!order.refund || order.status !== "refund_pending") throw new Error("订单没有待确认的退款请求。");
    if (order.reference !== input.reference || order.refund.requestNo !== input.refundRequestNo) {
      throw new Error("支付宝退款结果与订单退款请求不一致。");
    }
    if (input.amount.minorUnits !== order.payment.amount.minorUnits) {
      throw new Error("支付宝退款金额不是订单全额，不能标记为已退款。");
    }
    const timestamp = new Date().toISOString();
    order.refund.status = "succeeded";
    order.refund.completedAt = timestamp;
    order.status = "refunded";
    order.refundedAt = timestamp;
    order.updatedAt = timestamp;
    return publicOrder(order);
  });
}

export async function listAdminOpcOrders() {
  const store = await readStateDocument(orderDocument);
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
        ...record
      } = order;
      const {
        preparationClaimId: _preparationClaimId,
        preparationLeaseExpiresAt: _preparationLeaseExpiresAt,
        archiveClaimId: _archiveClaimId,
        archiveLeaseExpiresAt: _archiveLeaseExpiresAt,
        callbackEventHashes: _callbackEventHashes,
        ...signature
      } = storedSignature;
      const notifications = storedNotifications.map(({ claimId: _claimId, leaseExpiresAt: _leaseExpiresAt, ...event }) => event);
      return { ...record, notifications, signature, contactAvailable };
    });
}

export async function getOpcPaymentReceipt(reference: string, resumeToken: string) {
  const store = await readStateDocument(orderDocument);
  const order = store.orders.find((value) => value.reference === reference);
  if (!order || !validResumeToken(order, resumeToken)) {
    throw new Error("订单凭证无效或已经过期。");
  }
  if (!order.paymentReceipt) throw new Error("该订单尚未生成付款完成凭证。");
  return order.paymentReceipt;
}

export async function getAdminOpcOrderDossier(id: string) {
  const store = await readStateDocument(orderDocument);
  const order = store.orders.find((value) => value.id === id);
  if (!order) throw new Error("OPC 订单不存在。");
  return {
    ...publicOrder(order),
    payment: order.payment,
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
  const store = await readStateDocument(orderDocument);
  const order = store.orders.find((value) => value.id === id);
  if (!order) throw new Error("OPC 订单不存在。");
  if (!order.contactEncrypted || !order.signerEncrypted) throw new Error("订单敏感资料已按保留期清除。");
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
    payment: order.payment,
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
  return mutateStateDocument(orderDocument, (store) => {
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

export type OpcPaymentCancellationEvidence =
  | { provider: "alipay"; kind: "provider_closed"; providerTradeStatus: "TRADE_CLOSED" }
  | { provider: "alipay"; kind: "expired_not_found"; requestCreatedAt: string; linkExpiredAt: string };

export async function cancelAwaitingOpcOrderWithProviderEvidence(
  id: string,
  expectedUpdatedAt: string,
  evidence: OpcPaymentCancellationEvidence,
) {
  if (evidence.provider !== "alipay") throw new Error("待付款订单取消证据无效。");
  if (evidence.kind === "provider_closed" && evidence.providerTradeStatus !== "TRADE_CLOSED") {
    throw new Error("缺少支付宝关单成功证据，不能取消待付款订单。");
  }
  return mutateStateDocument(orderDocument, (store) => {
    const order = store.orders.find((value) => value.id === id);
    if (!order) throw new Error("OPC 订单不存在。");
    assertExpectedUpdatedAt(order, expectedUpdatedAt);
    if (order.status !== "awaiting_payment") throw new Error("只有待付款订单可以在支付宝关单后取消。");
    if (evidence.kind === "expired_not_found") {
      if (order.payment.requestCreatedAt !== evidence.requestCreatedAt) {
        throw new Error("支付宝过期证据与订单当前支付会话不匹配。");
      }
      const requestCreatedAt = Date.parse(evidence.requestCreatedAt);
      const expectedExpiry = requestCreatedAt + 30 * 60 * 1_000;
      if (
        !Number.isFinite(requestCreatedAt)
        || evidence.linkExpiredAt !== new Date(expectedExpiry).toISOString()
        || Date.now() < expectedExpiry + 60 * 1_000
      ) {
        throw new Error("支付宝交易不存在，但绝对付款期限尚未安全结束。");
      }
    }
    const timestamp = new Date().toISOString();
    order.status = "cancelled";
    order.cancelledAt = timestamp;
    order.updatedAt = timestamp;
    return publicOrder(order);
  });
}

export async function getAdminOpcContractArchive(id: string) {
  const store = await readStateDocument(orderDocument);
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
  return mutateStateDocument(orderDocument, (store) => {
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
