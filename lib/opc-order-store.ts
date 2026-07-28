import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { decryptSensitiveText, encryptSensitiveText } from "./sensitive-data.ts";
import {
  mutateStateDocument,
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
  version: 1;
  orders: StoredOpcOrder[];
};

const orderDocument: StateDocumentDefinition<OpcOrderStore> = {
  namespace: "opc-orders",
  fileName: "opc-orders.json",
  create: () => ({ version: 1, orders: [] }),
  parse: (value) => {
    const parsed = value as OpcOrderStore;
    if (parsed.version !== 1 || !Array.isArray(parsed.orders)) {
      throw new Error("OPC 订单存储格式无效。");
    }
    return parsed;
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
      awaiting_payment: ["paid", "cancelled"],
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
