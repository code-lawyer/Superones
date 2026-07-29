import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const keyring = JSON.stringify({ test: "o".repeat(40) });

test("OPC orders encrypt contact details and reuse an idempotent request", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-opc-orders-"));
  const previousDataDir = process.env.VAULT2077_DATA_DIR;
  const previousKeys = process.env.VAULT2077_DATA_KEYS;
  const previousActiveKey = process.env.VAULT2077_DATA_ACTIVE_KEY_ID;
  process.env.VAULT2077_DATA_DIR = root;
  process.env.VAULT2077_DATA_KEYS = keyring;
  process.env.VAULT2077_DATA_ACTIVE_KEY_ID = "test";
  try {
    const store = await import(`../lib/opc-order-store.ts?test=${Date.now()}`);
    const input = {
      idempotencyKey: "62d7d196-b202-48f6-9e2b-183c4060f98e",
      serviceKind: "specialty" as const,
      serviceSlug: "single-commercial-contract-review",
      serviceCode: "S-01-01",
      serviceName: "单份商业合同审查包",
      serviceRevision: "SKU.01",
      quotedPrice: "人民币 1,980 元",
      contact: {
        name: "测试联系人",
        phone: "13800138000",
        email: "",
        wechat: "vault-test",
        note: "希望本周开始。",
      },
    };
    const created = await store.createOpcOrder(input);
    const repeated = await store.createOpcOrder(input);
    assert.equal(repeated.id, created.id);
    assert.equal(repeated.reference, created.reference);

    const orders = await store.listAdminOpcOrders();
    assert.equal(orders.length, 1);
    assert.equal(orders[0].contact?.phone, "13800138000");
    assert.equal(orders[0].status, "awaiting_payment");
    assert.equal(orders[0].payment.amount.decimal, "1980.00");

    await store.recordOpcPaymentRequest(created.reference, "page", "2088000000000001");
    await store.applyOpcAlipayTradeResult({
      reference: created.reference,
      sellerId: "2088000000000001",
      tradeNo: "2026072822001000000000000001",
      tradeStatus: "TRADE_SUCCESS",
      amount: { currency: "CNY", minorUnits: 198_000, decimal: "1980.00" },
      source: "notify",
    });
    const paid = (await store.listAdminOpcOrders())[0];
    assert.equal(paid.status, "paid");
    assert.equal(paid.payment.tradeNo, "2026072822001000000000000001");
    assert.equal(paid.payment.sellerId, "2088000000000001");
    assert.ok(paid.payment.notifiedAt);
    await store.applyOpcAlipayTradeResult({
      reference: created.reference,
      sellerId: "2088000000000001",
      tradeNo: "2026072822001000000000000001",
      tradeStatus: "TRADE_SUCCESS",
      amount: { currency: "CNY", minorUnits: 198_000, decimal: "1980.00" },
      source: "notify",
    });
    assert.equal((await store.listAdminOpcOrders()).length, 1);
    await assert.rejects(
      store.applyOpcAlipayTradeResult({
        reference: created.reference,
        sellerId: "2088000000000001",
        tradeNo: "2026072822001000000000000001",
        tradeStatus: "TRADE_SUCCESS",
        amount: { currency: "CNY", minorUnits: 198_001, decimal: "1980.01" },
        source: "notify",
      }),
      /金额.*不一致/,
    );
    await assert.rejects(
      store.applyOpcAlipayTradeResult({
        reference: created.reference,
        sellerId: "2088000000000002",
        tradeNo: "2026072822001000000000000001",
        tradeStatus: "TRADE_SUCCESS",
        amount: { currency: "CNY", minorUnits: 198_000, decimal: "1980.00" },
        source: "query",
      }),
      /商户 PID.*不一致/,
    );
    assert.equal((await store.listAdminOpcOrders())[0].status, "paid");
    await assert.rejects(store.updateOpcOrderStatus(created.id, "cancelled"), /不能从 paid/);
    await store.updateOpcOrderStatus(created.id, "completed");
    assert.equal((await store.listAdminOpcOrders())[0].status, "completed");
    await store.updateOpcOrderStatus(created.id, "refunded");
    const refunded = (await store.listAdminOpcOrders())[0];
    assert.equal(refunded.status, "refunded");
    assert.ok(refunded.completedAt);
    assert.ok(refunded.refundedAt);

    const latePayment = await store.createOpcOrder({
      ...input,
      idempotencyKey: "9894c180-e710-43ff-a5b3-63eb45b29125",
      quotedPrice: "人民币 6,800 元/年",
    });
    await store.updateOpcOrderStatus(latePayment.id, "cancelled");
    await store.applyOpcAlipayTradeResult({
      reference: latePayment.reference,
      sellerId: "2088000000000001",
      tradeNo: "2026072822001000000000000002",
      tradeStatus: "TRADE_SUCCESS",
      amount: { currency: "CNY", minorUnits: 680_000, decimal: "6800.00" },
      source: "notify",
    });
    const recovered = (await store.listAdminOpcOrders()).find(
      (value: { id: string; status: string; cancelledAt: string | null }) => value.id === latePayment.id,
    );
    assert.equal(recovered?.status, "paid");
    assert.equal(recovered?.cancelledAt, null);
  } finally {
    if (previousDataDir === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDir;
    if (previousKeys === undefined) delete process.env.VAULT2077_DATA_KEYS;
    else process.env.VAULT2077_DATA_KEYS = previousKeys;
    if (previousActiveKey === undefined) delete process.env.VAULT2077_DATA_ACTIVE_KEY_ID;
    else process.env.VAULT2077_DATA_ACTIVE_KEY_ID = previousActiveKey;
    await rm(root, { recursive: true, force: true });
  }
});

test("OPC order migration preserves legacy annual-price orders", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-opc-legacy-orders-"));
  const previousDataDir = process.env.VAULT2077_DATA_DIR;
  process.env.VAULT2077_DATA_DIR = root;
  try {
    await writeFile(path.join(root, "opc-orders.json"), JSON.stringify({
      version: 1,
      orders: [{
        id: "2ac61029-716d-4405-84a3-1e9ee9ee7efb",
        reference: "OPC-20260728-A1B2C3D4E5F6",
        idempotencyHash: "a".repeat(64),
        serviceKind: "specialty",
        serviceSlug: "annual-tax-service",
        serviceCode: "S-02-01",
        serviceName: "年度财税服务",
        serviceRevision: "SKU.01",
        quotedPrice: "人民币 6,800 元/年",
        contactEncrypted: null,
        status: "awaiting_payment",
        createdAt: "2026-07-28T00:00:00.000Z",
        updatedAt: "2026-07-28T00:00:00.000Z",
        paidAt: null,
        cancelledAt: null,
        refundedAt: null,
        completedAt: null,
        contactDeletedAt: null,
      }],
    }), "utf8");
    const store = await import(`../lib/opc-order-store.ts?legacy=${Date.now()}`);
    const orders = await store.listAdminOpcOrders();
    assert.equal(orders.length, 1);
    assert.deepEqual(orders[0].payment.amount, {
      currency: "CNY",
      minorUnits: 680_000,
      decimal: "6800.00",
    });
  } finally {
    if (previousDataDir === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDir;
    await rm(root, { recursive: true, force: true });
  }
});
