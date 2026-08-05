import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
      servicePeriod: "5 个工作日",
      serviceOutcome: "审查意见",
      serviceScope: "审查一份合同",
      serviceBoundary: "不含诉讼代理",
      contact: {
        name: "测试联系人",
        phone: "13800138000",
        email: "",
        wechat: "vault-test",
        note: "希望本周开始。",
      },
      signer: {
        type: "individual" as const,
        name: "测试联系人",
        phone: "13800138000",
        organizationName: "",
        organizationCreditCode: "",
        legalRepresentativeName: "",
      },
    };
    const created = await store.createOpcOrder(input);
    const repeated = await store.createOpcOrder(input);
    assert.equal(repeated.id, created.id);
    assert.equal(repeated.reference, created.reference);
    const storedJson = await readFile(path.join(root, "opc-orders.json"), "utf8");
    assert.equal(storedJson.includes(created.resumeToken), false);
    assert.equal(storedJson.includes("resumeTokenEncrypted"), false);
    await assert.rejects(
      store.createOpcOrder({
        ...input,
        contact: { ...input.contact, phone: "13900139000" },
      }),
      store.OpcOrderIdempotencyConflictError,
    );

    const orders = await store.listAdminOpcOrders();
    assert.equal(orders.length, 1);
    assert.equal("contact" in orders[0], false);
    assert.equal("signer" in orders[0], false);
    assert.equal(orders[0].contactAvailable, true);
    assert.equal(orders[0].status, "awaiting_signature");
    assert.equal(orders[0].payment.amount.decimal, "1980.00");

    const claim = await store.claimOpcSignaturePreparation(created.reference, created.resumeToken);
    assert.equal(claim.claimed, true);
    await store.bindOpcSignatureFlow(created.reference, created.resumeToken, claim.claimId!, {
      provider: "mock",
      flowId: `mock-${created.reference}`,
      fileId: `mock-file-${created.reference}`,
      templateId: "mock-individual",
      templateVersion: "test",
    });
    await store.applyOpcSignatureStatus(created.reference, created.resumeToken, "completed");
    await store.recordOpcSignatureCallback(`mock-${created.reference}`, "c".repeat(64));
    const firstNotifiedAt = (await store.listAdminOpcOrders())[0].signature.notifiedAt;
    await store.recordOpcSignatureCallback(`mock-${created.reference}`, "c".repeat(64));
    assert.equal((await store.listAdminOpcOrders())[0].signature.notifiedAt, firstNotifiedAt);
    const archiveClaim = await store.claimOpcSignatureArchive(`mock-${created.reference}`);
    assert.equal(archiveClaim.claimed, true);
    assert.equal((await store.claimOpcSignatureArchive(`mock-${created.reference}`)).claimed, false);
    await store.completeOpcSignatureArchive(`mock-${created.reference}`, archiveClaim.claimId!, {
      objectKey: `opc-contracts/2026/${created.reference}/${"a".repeat(64)}.pdf`,
      manifestKey: `opc-contracts/2026/${created.reference}/${"a".repeat(64)}.json`,
      sha256: "a".repeat(64), sizeBytes: 100, verifiedAt: new Date().toISOString(),
      archivedAt: new Date().toISOString(), retainUntil: "2036-08-02T00:00:00.000Z", evidence: [],
    });

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
    const lateClaim = await store.claimOpcSignaturePreparation(latePayment.reference, latePayment.resumeToken);
    assert.equal(lateClaim.claimed, true);
    await store.bindOpcSignatureFlow(latePayment.reference, latePayment.resumeToken, lateClaim.claimId!, {
      provider: "mock",
      flowId: `mock-${latePayment.reference}`,
      fileId: `mock-file-${latePayment.reference}`,
      templateId: "mock-individual",
      templateVersion: "test",
    });
    await store.applyOpcSignatureStatus(latePayment.reference, latePayment.resumeToken, "completed");
    const lateArchiveClaim = await store.claimOpcSignatureArchive(`mock-${latePayment.reference}`);
    assert.equal(lateArchiveClaim.claimed, true);
    await store.completeOpcSignatureArchive(`mock-${latePayment.reference}`, lateArchiveClaim.claimId!, {
      objectKey: `opc-contracts/2026/${latePayment.reference}/${"b".repeat(64)}.pdf`,
      manifestKey: `opc-contracts/2026/${latePayment.reference}/${"b".repeat(64)}.json`,
      sha256: "b".repeat(64), sizeBytes: 100, verifiedAt: new Date().toISOString(),
      archivedAt: new Date().toISOString(), retainUntil: "2036-08-02T00:00:00.000Z", evidence: [],
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

    const unsigned = await store.createOpcOrder({
      ...input,
      idempotencyKey: "6be82ad0-28d6-49ed-8615-6f38be8a4bd3",
    });
    await store.applyOpcAlipayTradeResult({
      reference: unsigned.reference,
      sellerId: "2088000000000001",
      tradeNo: "2026072822001000000000000003",
      tradeStatus: "TRADE_SUCCESS",
      amount: { currency: "CNY", minorUnits: 198_000, decimal: "1980.00" },
      source: "notify",
    });
    const anomaly = (await store.listAdminOpcOrders()).find((value: { id: string }) => value.id === unsigned.id);
    assert.equal(anomaly?.status, "payment_exception");
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
