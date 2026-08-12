import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { StoredOpcOrder } from "../lib/opc-orders/internal-store.ts";

const agreementText = `OPC 服务订单及线下对公转账协议\n${"协议正文。".repeat(80)}`;
const identityConsent = { version: "opc-contract-identity-consent-v1" as const, acceptedAt: "2026-08-11T12:00:00.000Z" };

test("offline bank-transfer checkout creates an online-agreement order without paper delivery", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-opc-offline-order-"));
  const previous = Object.fromEntries([
    "VAULT2077_DATA_DIR",
    "VAULT2077_DATA_KEYS",
    "VAULT2077_DATA_ACTIVE_KEY_ID",
    "VAULT2077_OPC_RESUME_TOKEN_KEYS",
    "VAULT2077_OPC_RESUME_TOKEN_ACTIVE_KEY_ID",
  ].map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    VAULT2077_DATA_DIR: root,
    VAULT2077_DATA_KEYS: JSON.stringify({ test: "d".repeat(40) }),
    VAULT2077_DATA_ACTIVE_KEY_ID: "test",
    VAULT2077_OPC_RESUME_TOKEN_KEYS: JSON.stringify({ test: "r".repeat(40) }),
    VAULT2077_OPC_RESUME_TOKEN_ACTIVE_KEY_ID: "test",
  });
  try {
    const checkout = await import(`../lib/opc-orders/checkout.ts?offline=${Date.now()}`);
    const storeModule = await import(`../lib/opc-orders/internal-store.ts?offline=${Date.now()}`);
    const order = await checkout.createOpcOrder({
      idempotencyKey: "4aa750f8-32f9-4a5b-b826-a67f87a03f5b",
      signatureMethod: "online",
      paymentProvider: "bank_transfer",
      serviceKind: "specialty",
      serviceSlug: "single-commercial-contract-review",
      serviceCode: "S-01-01",
      serviceName: "单份商业合同审查包",
      serviceRevision: "SKU.01",
      quotedPrice: "人民币 1,980 元",
      servicePeriod: "5 个工作日",
      serviceOutcome: "审查意见",
      serviceScope: "审查一份合同",
      serviceBoundary: "不含诉讼代理",
      contact: { name: "测试联系人", phone: "13800138000", email: "first@example.com", wechat: "", note: "", identityDocumentNumber: "11010519491231002X" },
      signer: {
        type: "individual", name: "测试联系人", phone: "13800138000",
        organizationName: "", organizationCreditCode: "", legalRepresentativeName: "",
      },
      agreement: {
        version: "opc-offline-bank-transfer-v1",
        title: "OPC 服务订单及线下对公转账协议",
        text: agreementText,
        sha256: createHash("sha256").update(agreementText).digest("hex"),
        acceptedAt: "2026-08-10T12:00:00.000Z",
      },
      identityConsent,
      offlinePaymentSnapshot: {
        revision: "offline-payment-2026-08-10",
        account: {
          name: "上海睿诚明达咨询管理有限公司",
          bankName: "测试银行",
          branchName: "测试支行",
          accountNumber: "1234567890123456",
          cnapsCode: "",
        },
        agreementSha256: "a".repeat(64),
        contactQrSha256: "b".repeat(64),
      },
    });
    const stored = (await storeModule.readOpcOrderStore()).orders[0];

    assert.equal(order.status, "awaiting_payment");
    assert.equal(order.signatureMethod, "online");
    assert.equal(order.paymentProvider, "bank_transfer");
    assert.equal(order.transferMemo, order.reference);
    assert.equal(stored.deliveryEncrypted, null);
    assert.equal(stored.signature.status, "completed");
    assert.equal(stored.payment.offlineProfileRevision, "offline-payment-2026-08-10");
    assert.equal(stored.payment.accountNumber, "1234567890123456");

    const payment = await import(`../lib/opc-orders/payment.ts?offline-payment=${Date.now()}`);
    const paidAt = stored.createdAt;
    const verified = await payment.verifyOpcBankTransfer({
      id: stored.id,
      expectedUpdatedAt: stored.updatedAt,
      amountDecimal: "1980.00",
      bankTransactionId: "bank-20260810-000001",
      payerName: "测试联系人",
      paidAt,
    });
    const paid = (await storeModule.readOpcOrderStore()).orders[0];
    assert.equal(verified.status, "paid");
    assert.equal(paid.payment.tradeStatus, "BANK_VERIFIED");
    assert.equal(paid.paymentReceipt?.payment.provider, "bank_transfer");
    assert.equal(paid.paymentReceipt?.payment.tradeNo, "BANK-20260810-000001");
    assert.equal(paid.paymentReceipt?.payment.paidAt, paidAt);
    assert.equal(paid.paymentReceipt?.generatedAt, paid.payment.checkedAt);
    const paymentNotifications = paid.notifications.filter(
      (event: StoredOpcOrder["notifications"][number]) => event.eventType === "payment_confirmed",
    );
    assert.equal(paymentNotifications.length, 2);
    assert.ok(paymentNotifications.every(
      (event: StoredOpcOrder["notifications"][number]) => event.nextAttemptAt === paid.payment.checkedAt,
    ));
    const duplicateOrder = await checkout.createOpcOrder({
      idempotencyKey: "1a7eb1fa-52b5-47b7-8f0b-50da456329c6",
      signatureMethod: "online",
      paymentProvider: "bank_transfer",
      serviceKind: "specialty",
      serviceSlug: "single-commercial-contract-review",
      serviceCode: "S-01-01",
      serviceName: "单份商业合同审查包",
      serviceRevision: "SKU.01",
      quotedPrice: "人民币 1,980 元",
      servicePeriod: "5 个工作日",
      serviceOutcome: "审查意见",
      serviceScope: "审查一份合同",
      serviceBoundary: "不含诉讼代理",
      contact: { name: "第二联系人", phone: "13900139000", email: "second@example.com", wechat: "", note: "", identityDocumentNumber: "11010519491231002X" },
      signer: {
        type: "individual", name: "第二联系人", phone: "13900139000",
        organizationName: "", organizationCreditCode: "", legalRepresentativeName: "",
      },
      agreement: {
        version: "opc-offline-bank-transfer-v1",
        title: "OPC 服务订单及线下对公转账协议",
        text: agreementText,
        sha256: createHash("sha256").update(agreementText).digest("hex"),
        acceptedAt: "2026-08-10T12:45:00.000Z",
      },
      identityConsent,
      offlinePaymentSnapshot: {
        revision: "offline-payment-2026-08-10",
        account: {
          name: "上海睿诚明达咨询管理有限公司",
          bankName: "测试银行",
          branchName: "测试支行",
          accountNumber: "1234567890123456",
          cnapsCode: "",
        },
        agreementSha256: "a".repeat(64),
        contactQrSha256: "b".repeat(64),
      },
    });
    const duplicateStored = (await storeModule.readOpcOrderStore()).orders.find((candidate: { id: string }) => candidate.id === duplicateOrder.id)!;
    await assert.rejects(() => payment.verifyOpcBankTransfer({
      id: duplicateStored.id,
      expectedUpdatedAt: duplicateStored.updatedAt,
      amountDecimal: "1979.99",
      bankTransactionId: "BANK-20260810-WRONG-AMOUNT",
      payerName: "第二联系人",
      paidAt: duplicateStored.createdAt,
    }), /金额与订单固定金额不一致/);
    await assert.rejects(() => payment.verifyOpcBankTransfer({
      id: duplicateStored.id,
      expectedUpdatedAt: duplicateStored.updatedAt,
      amountDecimal: "1980.00",
      bankTransactionId: "BANK-20260810-BEFORE-ORDER",
      payerName: "第二联系人",
      paidAt: new Date(new Date(duplicateStored.createdAt).getTime() - 1).toISOString(),
    }), /早于订单创建时间/);
    await assert.rejects(() => payment.verifyOpcBankTransfer({
      id: duplicateStored.id,
      expectedUpdatedAt: duplicateStored.updatedAt,
      amountDecimal: "1980.00",
      bankTransactionId: "BANK-20260810-FUTURE",
      payerName: "第二联系人",
      paidAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    }), /银行入账时间无效/);
    await assert.rejects(() => payment.verifyOpcBankTransfer({
      id: duplicateStored.id,
      expectedUpdatedAt: duplicateStored.updatedAt,
      amountDecimal: "1980.00",
      bankTransactionId: "BANK-20260810-000001",
      payerName: "第二联系人",
      paidAt: duplicateStored.createdAt,
    }), /流水号已绑定其他订单/);
    await assert.rejects(() => payment.verifyOpcBankTransfer({
      id: duplicateStored.id,
      expectedUpdatedAt: "1970-01-01T00:00:00.000Z",
      amountDecimal: "1980.00",
      bankTransactionId: "BANK-20260810-STALE-VERSION",
      payerName: "第二联系人",
      paidAt: duplicateStored.createdAt,
    }), /订单状态已经变化/);
    const requiredSnapshotFields = [
      "offlineProfileRevision",
      "accountName",
      "bankName",
      "branchName",
      "accountNumber",
      "transferMemo",
      "agreementSha256",
      "contactQrSha256",
    ] as const;
    for (const [index, field] of requiredSnapshotFields.entries()) {
      let original: string | null = null;
      await storeModule.mutateOpcOrderStore((store: { orders: StoredOpcOrder[] }) => {
        const target = store.orders.find((candidate) => candidate.id === duplicateStored.id)!;
        original = target.payment[field];
        target.payment[field] = null;
      });
      await assert.rejects(() => payment.verifyOpcBankTransfer({
        id: duplicateStored.id,
        expectedUpdatedAt: duplicateStored.updatedAt,
        amountDecimal: "1980.00",
        bankTransactionId: `BANK-20260810-MISSING-${String(index).padStart(2, "0")}`,
        payerName: "第二联系人",
        paidAt: duplicateStored.createdAt,
      }), /缺少企业收款资料快照/);
      await storeModule.mutateOpcOrderStore((store: { orders: StoredOpcOrder[] }) => {
        const target = store.orders.find((candidate) => candidate.id === duplicateStored.id)!;
        target.payment[field] = original;
      });
    }
    const rejectedOrder = (await storeModule.readOpcOrderStore()).orders.find((candidate: { id: string }) => candidate.id === duplicateStored.id)!;
    assert.equal(rejectedOrder.status, "awaiting_payment");
    assert.equal(rejectedOrder.notifications.length, 2);
    assert.ok(rejectedOrder.notifications.every(
      (event: StoredOpcOrder["notifications"][number]) => event.eventType === "order_created",
    ));
    const notification = await payment.claimNextOpcPaymentNotification();
    assert.equal(notification?.provider, "bank_transfer");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("unpaid bank-transfer orders can be cancelled and enter the 90-day privacy cleanup", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-opc-offline-cancel-"));
  const previous = Object.fromEntries([
    "VAULT2077_DATA_DIR",
    "VAULT2077_DATA_KEYS",
    "VAULT2077_DATA_ACTIVE_KEY_ID",
    "VAULT2077_OPC_RESUME_TOKEN_KEYS",
    "VAULT2077_OPC_RESUME_TOKEN_ACTIVE_KEY_ID",
  ].map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    VAULT2077_DATA_DIR: root,
    VAULT2077_DATA_KEYS: JSON.stringify({ test: "d".repeat(40) }),
    VAULT2077_DATA_ACTIVE_KEY_ID: "test",
    VAULT2077_OPC_RESUME_TOKEN_KEYS: JSON.stringify({ test: "r".repeat(40) }),
    VAULT2077_OPC_RESUME_TOKEN_ACTIVE_KEY_ID: "test",
  });
  try {
    const checkout = await import(`../lib/opc-orders/checkout.ts?cancel=${Date.now()}`);
    const storeModule = await import(`../lib/opc-orders/internal-store.ts?cancel=${Date.now()}`);
    const admin = await import(`../lib/opc-orders/admin.ts?cancel=${Date.now()}`);
    const order = await checkout.createOpcOrder({
      idempotencyKey: "22a4f604-2471-4f6f-9cb1-d5e3b0bbca48",
      signatureMethod: "online",
      paymentProvider: "bank_transfer",
      serviceKind: "specialty",
      serviceSlug: "single-commercial-contract-review",
      serviceCode: "S-01-01",
      serviceName: "单份商业合同审查包",
      serviceRevision: "SKU.01",
      quotedPrice: "人民币 1,980 元",
      servicePeriod: "5 个工作日",
      serviceOutcome: "审查意见",
      serviceScope: "审查一份合同",
      serviceBoundary: "不含诉讼代理",
      contact: { name: "取消联系人", phone: "13800138000", email: "cancel@example.com", wechat: "", note: "", identityDocumentNumber: "11010519491231002X" },
      signer: { type: "individual", name: "取消联系人", phone: "13800138000", organizationName: "", organizationCreditCode: "", legalRepresentativeName: "" },
      agreement: { version: "opc-offline-bank-transfer-v1", title: "OPC 服务订单及线下对公转账协议", text: agreementText, sha256: createHash("sha256").update(agreementText).digest("hex"), acceptedAt: "2026-08-10T12:00:00.000Z" },
      identityConsent,
      offlinePaymentSnapshot: {
        revision: "offline-payment-2026-08-10",
        account: { name: "上海睿诚明达咨询管理有限公司", bankName: "测试银行", branchName: "测试支行", accountNumber: "1234567890123456", cnapsCode: "" },
        agreementSha256: "a".repeat(64),
        contactQrSha256: "b".repeat(64),
      },
    });
    const stored = (await storeModule.readOpcOrderStore()).orders.find((candidate: { id: string }) => candidate.id === order.id)!;
    const cancelled = await admin.cancelAwaitingOpcBankTransferOrder(order.id, stored.updatedAt);
    assert.equal(cancelled.status, "cancelled");
    const cancelledStored = (await storeModule.readOpcOrderStore()).orders.find((candidate: { id: string }) => candidate.id === order.id)!;
    await admin.runOpcOrderRetention(new Date(new Date(cancelledStored.cancelledAt!).getTime() + 91 * 24 * 60 * 60 * 1000));
    const scrubbed = (await storeModule.readOpcOrderStore()).orders.find((candidate: { id: string }) => candidate.id === order.id)!;
    assert.equal(scrubbed.contactEncrypted, null);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});
