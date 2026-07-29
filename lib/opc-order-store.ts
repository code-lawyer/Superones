import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  catalogPriceToAlipayAmount,
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

type StoredOpcOrder = {
  id: string;
  reference: string;
  idempotencyHash: string;
  serviceKind: "infrastructure" | "specialty";
  serviceSlug: string;
  serviceCode: string;
  serviceName: string;
  serviceRevision: string;
  quotedPrice: string;
  alipayAmount: string;
  alipayTradeNo: string | null;
  alipayTradeStatus: string | null;
  paymentChannel: OpcAlipayChannel | null;
  paymentRequestCreatedAt: string | null;
  paymentNotifiedAt: string | null;
  paymentCheckedAt: string | null;
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
  version: 2;
  orders: StoredOpcOrder[];
};

const orderDocument: StateDocumentDefinition<OpcOrderStore> = {
  namespace: "opc-orders",
  fileName: "opc-orders.json",
  create: () => ({ version: 2, orders: [] }),
  parse: (value) => {
    const parsed = value as { version?: unknown; orders?: unknown[] };
    if ((parsed.version !== 1 && parsed.version !== 2) || !Array.isArray(parsed.orders)) {
      throw new Error("OPC 订单存储格式无效。");
    }
    return {
      version: 2,
      orders: parsed.orders.map((value) => {
        const order = value as Partial<StoredOpcOrder>;
        const alipayAmount = typeof order.alipayAmount === "string"
          ? order.alipayAmount
          : catalogPriceToAlipayAmount(order.quotedPrice ?? "");
        if (
          !order.id
          || !order.reference
          || !order.serviceName
          || !order.quotedPrice
          || !alipayAmount
        ) {
          throw new Error("OPC 订单记录缺少必要字段。");
        }
        return {
          ...order,
          alipayAmount,
          alipayTradeNo: order.alipayTradeNo ?? null,
          alipayTradeStatus: order.alipayTradeStatus ?? null,
          paymentChannel: order.paymentChannel ?? null,
          paymentRequestCreatedAt: order.paymentRequestCreatedAt ?? null,
          paymentNotifiedAt: order.paymentNotifiedAt ?? null,
          paymentCheckedAt: order.paymentCheckedAt ?? null,
        } as StoredOpcOrder;
      }),
    };
  },
};

function idempotencyHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
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
  const alipayAmount = catalogPriceToAlipayAmount(input.quotedPrice);
  if (!alipayAmount) throw new Error("服务公开价格无法转换为支付宝订单金额。");
  const requestHash = idempotencyHash(input.idempotencyKey);
  return mutateStateDocument(orderDocument, (store) => {
    scrubExpiredContacts(store, new Date());
    const existing = store.orders.find((order) => order.idempotencyHash === requestHash);
    if (existing) return publicOrder(existing);

    const timestamp = new Date().toISOString();
    const order: StoredOpcOrder = {
      id: randomUUID(),
      reference: uniqueOrderReference(store),
      idempotencyHash: requestHash,
      serviceKind: input.serviceKind,
      serviceSlug: input.serviceSlug,
      serviceCode: input.serviceCode,
      serviceName: input.serviceName,
      serviceRevision: input.serviceRevision,
      quotedPrice: input.quotedPrice,
      alipayAmount,
      alipayTradeNo: null,
      alipayTradeStatus: null,
      paymentChannel: null,
      paymentRequestCreatedAt: null,
      paymentNotifiedAt: null,
      paymentCheckedAt: null,
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
    alipayAmount: order.alipayAmount,
  };
}

export async function recordOpcPaymentRequest(reference: string, channel: OpcAlipayChannel) {
  return mutateStateDocument(orderDocument, (store) => {
    const order = store.orders.find((value) => value.reference === reference);
    if (!order) throw new Error("OPC 订单不存在。");
    if (order.status !== "awaiting_payment") throw new Error("该 OPC 订单当前不接受重复付款。");
    const timestamp = new Date().toISOString();
    order.paymentChannel = channel;
    order.paymentRequestCreatedAt = timestamp;
    order.updatedAt = timestamp;
    return publicOrder(order);
  });
}

export async function applyOpcAlipayTradeResult(input: {
  reference: string;
  tradeNo: string | null;
  tradeStatus: string;
  totalAmount: string | null;
  source: "notify" | "query";
}) {
  return mutateStateDocument(orderDocument, (store) => {
    const order = store.orders.find((value) => value.reference === input.reference);
    if (!order) throw new Error("OPC 订单不存在。");
    if (input.totalAmount && input.totalAmount !== order.alipayAmount) {
      throw new Error("支付宝交易金额与 OPC 订单金额不一致。");
    }
    if (
      input.tradeNo
      && store.orders.some((value) => value.id !== order.id && value.alipayTradeNo === input.tradeNo)
    ) {
      throw new Error("支付宝交易号已关联到其他 OPC 订单。");
    }

    const timestamp = new Date().toISOString();
    order.alipayTradeNo = input.tradeNo ?? order.alipayTradeNo;
    order.alipayTradeStatus = input.tradeStatus;
    order.updatedAt = timestamp;
    if (input.source === "notify") order.paymentNotifiedAt = timestamp;
    else order.paymentCheckedAt = timestamp;

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
      tradeNo: null,
      tradeStatus: "TRADE_NOT_EXIST",
      totalAmount: null,
      source: "query",
    });
  }
  return applyOpcAlipayTradeResult({
    reference,
    tradeNo: result.tradeNo,
    tradeStatus: result.tradeStatus ?? "UNKNOWN",
    totalAmount: result.totalAmount,
    source: "query",
  });
}

export async function listAdminOpcOrders() {
  return mutateStateDocument(orderDocument, (store) => {
    scrubExpiredContacts(store, new Date());
    return store.orders
      .map((order) => {
        const contact = order.contactEncrypted
          ? JSON.parse(decryptSensitiveText(order.contactEncrypted)) as OpcOrderContact
          : null;
        const { contactEncrypted: _contactEncrypted, idempotencyHash: _idempotencyHash, ...record } = order;
        return { ...record, contact };
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 1_000);
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
