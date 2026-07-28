import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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

    await store.updateOpcOrderStatus(created.id, "paid");
    assert.equal((await store.listAdminOpcOrders())[0].status, "paid");
    await assert.rejects(store.updateOpcOrderStatus(created.id, "cancelled"), /不能从 paid/);
    await store.updateOpcOrderStatus(created.id, "completed");
    assert.equal((await store.listAdminOpcOrders())[0].status, "completed");
    await store.updateOpcOrderStatus(created.id, "refunded");
    const refunded = (await store.listAdminOpcOrders())[0];
    assert.equal(refunded.status, "refunded");
    assert.ok(refunded.completedAt);
    assert.ok(refunded.refundedAt);
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
