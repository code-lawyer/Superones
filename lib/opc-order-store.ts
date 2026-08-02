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
import { LEGAL_OPERATOR_CREDIT_CODE, LEGAL_OPERATOR_NAME } from "./legal-profile.ts";
import {
  mutateStateDocument,
  readStateDocument,
  type StateDocumentDefinition,
} from "./state-document-store.ts";

export const OPC_ORDER_STATUSES = ["awaiting_signature", "awaiting_payment", "payment_exception", "paid", "completed", "cancelled", "refunded"] as const;
export type OpcOrderStatus = (typeof OPC_ORDER_STATUSES)[number];

type OpcOrderContact = {
  name: string;
  phone: string;
  email: string;
  wechat: string;
  note: string;
};

type StoredOpcPayment = {
  provider: "alipay";
  amount: OpcAlipayAmount;
  sellerId: string | null;
  tradeNo: string | null;
  tradeStatus: string | null;
  channel: OpcAlipayChannel | null;
  requestCreatedAt: string | null;
  notifiedAt: string | null;
  checkedAt: string | null;
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
  contactEncrypted: string | null;
  signerEncrypted: string | null;
  resumeTokenHash: string | null;
  resumeTokenNonce: string | null;
  resumeTokenKeyId: string | null;
  resumeTokenExpiresAt: string | null;
  signature: StoredOpcSignature;
  status: OpcOrderStatus;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
  completedAt: string | null;
  contactDeletedAt: string | null;
};

type OpcOrderStore = {
  version: 6;
  orders: StoredOpcOrder[];
};

export class OpcOrderIdempotencyConflictError extends Error {
  constructor() {
    super("该幂等请求已用于不同的订单内容，请刷新页面后重新提交。");
    this.name = "OpcOrderIdempotencyConflictError";
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
  create: () => ({ version: 6, orders: [] }),
  parse: (value) => {
    const parsed = value as { version?: unknown; orders?: unknown[] };
    if (![1, 2, 3, 4, 5, 6].includes(parsed.version as number) || !Array.isArray(parsed.orders)) {
      throw new Error("OPC 订单存储格式无效。");
    }
    return {
      version: 6,
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
          signerEncrypted: order.signerEncrypted ?? null,
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
}) {
  return createHash("sha256").update(JSON.stringify({
    serviceKind: input.serviceKind,
    serviceSlug: input.serviceSlug,
    serviceCode: input.serviceCode,
    serviceName: input.serviceName,
    serviceRevision: input.serviceRevision,
    quotedPrice: input.quotedPrice,
    contact: input.contact,
    signer: input.signer,
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
    serviceName: order.serviceName,
    quotedPrice: order.quotedPrice,
    signatureStatus: order.signature.status,
    createdAt: order.createdAt,
  };
}

function scrubExpiredContacts(store: OpcOrderStore, now: Date) {
  const cutoff = now.getTime() - 730 * 24 * 60 * 60 * 1000;
  for (const order of store.orders) {
    const terminalAt = order.refundedAt ?? order.completedAt ?? order.cancelledAt;
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
      order.resumeTokenHash = null;
      order.resumeTokenNonce = null;
      order.resumeTokenKeyId = null;
      order.resumeTokenExpiresAt = null;
      order.contactDeletedAt = now.toISOString();
    }
  }
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
}) {
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
        sellerId: null,
        tradeNo: null,
        tradeStatus: null,
        channel: null,
        requestCreatedAt: null,
        notifiedAt: null,
        checkedAt: null,
      },
      contactEncrypted: encryptSensitiveText(JSON.stringify(input.contact)),
      signerEncrypted: encryptSensitiveText(JSON.stringify(input.signer)),
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
      status: "awaiting_signature",
      createdAt: timestamp,
      updatedAt: timestamp,
      paidAt: null,
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

export async function recordOpcPaymentRequest(
  reference: string,
  channel: OpcAlipayChannel,
  sellerId: string,
) {
  return mutateStateDocument(orderDocument, (store) => {
    const order = store.orders.find((value) => value.reference === reference);
    if (!order) throw new Error("OPC 订单不存在。");
    if (order.status !== "awaiting_payment") throw new Error("该 OPC 订单当前不接受重复付款。");
    if (!/^\d{16,32}$/.test(sellerId)) throw new Error("支付宝商户 PID 格式无效。");
    if (order.payment.sellerId && order.payment.sellerId !== sellerId) {
      throw new Error("OPC 订单绑定的支付宝商户 PID 与当前配置不一致。");
    }
    const timestamp = new Date().toISOString();
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
  sellerId: string;
  tradeNo: string | null;
  tradeStatus: string;
  amount: OpcAlipayAmount | null;
  source: "notify" | "query";
}) {
  return mutateStateDocument(orderDocument, (store) => {
    const order = store.orders.find((value) => value.reference === input.reference);
    if (!order) throw new Error("OPC 订单不存在。");
    if (!/^\d{16,32}$/.test(input.sellerId)) {
      throw new Error("支付宝交易商户 PID 格式无效。");
    }
    if (order.payment.sellerId && input.sellerId !== order.payment.sellerId) {
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
    order.payment.sellerId = input.sellerId;
    order.payment.tradeNo = input.tradeNo ?? order.payment.tradeNo;
    order.payment.tradeStatus = input.tradeStatus;
    order.updatedAt = timestamp;
    if (input.source === "notify") order.payment.notifiedAt = timestamp;
    else order.payment.checkedAt = timestamp;

    if (input.tradeStatus === "TRADE_SUCCESS" || input.tradeStatus === "TRADE_FINISHED") {
      const contractReady = order.signature.status === "completed" && order.signature.archive.status === "archived";
      if (order.status !== "completed" && order.status !== "refunded") {
        order.status = contractReady ? "paid" : "payment_exception";
      }
      order.paidAt ??= timestamp;
      if (contractReady) order.cancelledAt = null;
    }
    return publicOrder(order);
  });
}

export async function recordOpcAlipayQuery(reference: string, result: OpcAlipayQueryResult) {
  if (!result.found) {
    return applyOpcAlipayTradeResult({
      reference,
      sellerId: result.sellerId,
      tradeNo: null,
      tradeStatus: "TRADE_NOT_EXIST",
      amount: null,
      source: "query",
    });
  }
  return applyOpcAlipayTradeResult({
    reference,
    sellerId: result.sellerId,
    tradeNo: result.tradeNo,
    tradeStatus: result.tradeStatus ?? "UNKNOWN",
    amount: result.amount,
    source: "query",
  });
}

export async function listAdminOpcOrders() {
    return mutateStateDocument(orderDocument, (store) => {
      scrubExpiredContacts(store, new Date());
      return store.orders
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 1_000)
        .map((order) => {
          const contact = order.contactEncrypted
            ? JSON.parse(decryptSensitiveText(order.contactEncrypted)) as OpcOrderContact
            : null;
          const signer = order.signerEncrypted
            ? JSON.parse(decryptSensitiveText(order.signerEncrypted)) as OpcSignerParty
            : null;
          const {
            contactEncrypted: _contactEncrypted,
            signerEncrypted: _signerEncrypted,
            resumeTokenHash: _resumeTokenHash,
            resumeTokenNonce: _resumeTokenNonce,
            resumeTokenKeyId: _resumeTokenKeyId,
            resumeTokenExpiresAt: _resumeTokenExpiresAt,
            signature: storedSignature,
            idempotencyHash: _idempotencyHash,
            requestFingerprint: _requestFingerprint,
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
          return { ...record, signature, contact, signer };
        });
    });
  }

export async function updateOpcOrderStatus(id: string, status: OpcOrderStatus) {
  return mutateStateDocument(orderDocument, (store) => {
    scrubExpiredContacts(store, new Date());
    const order = store.orders.find((value) => value.id === id);
    if (!order) throw new Error("OPC 订单不存在。");
    if (order.status === status) return publicOrder(order);

    const allowed: Record<OpcOrderStatus, OpcOrderStatus[]> = {
      awaiting_signature: ["cancelled"],
      awaiting_payment: ["cancelled"],
      payment_exception: ["refunded"],
      paid: ["completed", "refunded"],
      completed: ["refunded"],
      cancelled: [],
      refunded: [],
    };
    if (!allowed[order.status].includes(status)) {
      throw new Error(`订单不能从 ${order.status} 变更为 ${status}。`);
    }
    const timestamp = new Date().toISOString();
    order.status = status;
    order.updatedAt = timestamp;
    if (status === "paid") order.paidAt = timestamp;
    if (status === "cancelled") order.cancelledAt = timestamp;
    if (status === "refunded") order.refundedAt = timestamp;
    if (status === "completed") order.completedAt = timestamp;
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
