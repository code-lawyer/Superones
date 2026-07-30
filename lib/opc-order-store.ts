import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  alipayDecimalToAmount,
  catalogPriceToAlipayAmount,
  type OpcAlipayAmount,
  type OpcAlipayChannel,
  type OpcAlipayPaymentOrder,
  type OpcAlipayQueryResult,
} from "./opc-payment-config.ts";
import { decryptSensitiveText, encryptSensitiveText } from "./sensitive-data.ts";
import {
  mutateStateDocument,
  readStateDocument,
  type StateDocumentDefinition,
} from "./state-document-store.ts";

export const OPC_ORDER_STATUSES = ["awaiting_payment", "paid", "completed", "cancelled", "refunded"] as const;
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
  payment: StoredOpcPayment;
  contactEncrypted: string | null;
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
  version: 4;
  orders: StoredOpcOrder[];
};

export class OpcOrderIdempotencyConflictError extends Error {
  constructor() {
    super("该幂等请求已用于不同的订单内容，请刷新页面后重新提交。");
    this.name = "OpcOrderIdempotencyConflictError";
  }
}

type LegacyStoredOpcOrder = Partial<StoredOpcOrder> & {
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
  create: () => ({ version: 4, orders: [] }),
  parse: (value) => {
    const parsed = value as { version?: unknown; orders?: unknown[] };
    if (![1, 2, 3, 4].includes(parsed.version as number) || !Array.isArray(parsed.orders)) {
      throw new Error("OPC 订单存储格式无效。");
    }
    return {
      version: 4,
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
          ...record
        } = order;
        return {
          ...record,
          requestFingerprint: /^[a-f0-9]{64}$/.test(order.requestFingerprint ?? "")
            ? order.requestFingerprint!
            : null,
          payment: parseStoredPayment(order),
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
}) {
  return createHash("sha256").update(JSON.stringify({
    serviceKind: input.serviceKind,
    serviceSlug: input.serviceSlug,
    serviceCode: input.serviceCode,
    serviceName: input.serviceName,
    serviceRevision: input.serviceRevision,
    quotedPrice: input.quotedPrice,
    contact: input.contact,
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

function publicOrder(order: StoredOpcOrder) {
  return {
    id: order.id,
    reference: order.reference,
    status: order.status,
    serviceName: order.serviceName,
    quotedPrice: order.quotedPrice,
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
  contact: OpcOrderContact;
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
      return publicOrder(existing);
    }

    const timestamp = new Date().toISOString();
    const order: StoredOpcOrder = {
      id: randomUUID(),
      reference: uniqueOrderReference(store),
      idempotencyHash: requestHash,
      requestFingerprint,
      serviceKind: input.serviceKind,
      serviceSlug: input.serviceSlug,
      serviceCode: input.serviceCode,
      serviceName: input.serviceName,
      serviceRevision: input.serviceRevision,
      quotedPrice: input.quotedPrice,
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
      status: "awaiting_payment",
      createdAt: timestamp,
      updatedAt: timestamp,
      paidAt: null,
      cancelledAt: null,
      refundedAt: null,
      completedAt: null,
      contactDeletedAt: null,
    };
    store.orders.push(order);
    return publicOrder(order);
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
      if (order.status !== "completed" && order.status !== "refunded") order.status = "paid";
      order.paidAt ??= timestamp;
      order.cancelledAt = null;
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
          const {
            contactEncrypted: _contactEncrypted,
            idempotencyHash: _idempotencyHash,
            requestFingerprint: _requestFingerprint,
            ...record
          } = order;
          return { ...record, contact };
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
      awaiting_payment: ["cancelled"],
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
