import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

type NotificationSummary = {
  eventType: "order_created" | "payment_confirmed";
  audience: "administrator" | "customer";
  status: string;
};

test("offline checkout requires a deliverable customer email", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-opc-required-email-"));
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
    const { createOpcOrder } = await import(`../lib/opc-orders/checkout.ts?required-email=${Date.now()}`);
    const agreementText = `OPC 服务订单及线下对公转账协议\n${"协议正文。".repeat(80)}`;
    await assert.rejects(() => createOpcOrder({
      idempotencyKey: "b936dfd4-c827-42fc-8ae2-af742363fa3b",
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
      contact: { name: "无邮箱联系人", phone: "13800138000", email: "", wechat: "", note: "" },
      signer: { type: "individual", name: "无邮箱联系人", phone: "13800138000", organizationName: "", organizationCreditCode: "", legalRepresentativeName: "" },
      agreement: { version: "opc-offline-bank-transfer-v1", title: "OPC 服务订单及线下对公转账协议", text: agreementText, sha256: createHash("sha256").update(agreementText).digest("hex"), acceptedAt: "2026-08-11T12:00:00.000Z" },
      offlinePaymentSnapshot: {
        revision: "offline-payment-2026-08-11-v1",
        account: { name: "上海睿诚明达咨询管理有限公司", bankName: "测试银行", branchName: "测试支行", accountNumber: "1234567890123456", cnapsCode: "" },
        agreementSha256: "a".repeat(64),
        contactQrSha256: "b".repeat(64),
      },
    }), /有效邮箱/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("offline checkout asynchronously emails the customer and alerts the administrator exactly once", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-opc-order-email-"));
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
    const { createOpcOrder } = await import(`../lib/opc-orders/checkout.ts?order-email=${Date.now()}`);
    const { getAdminOpcOrderDossier } = await import(`../lib/opc-orders/admin.ts?order-email=${Date.now()}`);
    const { processOpcPaymentNotifications } = await import(`../lib/opc-payment-notifications.ts?order-email=${Date.now()}`);
    const agreementText = `OPC 服务订单及线下对公转账协议\n${"协议正文。".repeat(80)}`;
    const order = await createOpcOrder({
      idempotencyKey: "2e8e7f7d-cac8-4ea1-bbac-8e0389294a33",
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
      contact: { name: "邮件联系人", phone: "13800138000", email: "buyer@example.com", wechat: "", note: "请电话联系" },
      signer: { type: "individual", name: "邮件联系人", phone: "13800138000", organizationName: "", organizationCreditCode: "", legalRepresentativeName: "" },
      agreement: { version: "opc-offline-bank-transfer-v1", title: "OPC 服务订单及线下对公转账协议", text: agreementText, sha256: createHash("sha256").update(agreementText).digest("hex"), acceptedAt: "2026-08-11T12:00:00.000Z" },
      offlinePaymentSnapshot: {
        revision: "offline-payment-2026-08-11-v1",
        account: { name: "上海睿诚明达咨询管理有限公司", bankName: "测试银行", branchName: "测试支行", accountNumber: "1234567890123456", cnapsCode: "" },
        agreementSha256: "a".repeat(64),
        contactQrSha256: "b".repeat(64),
      },
    });
    const messages: Array<{ to: string; subject: string; text: string; messageId: string }> = [];
    const sender = { async send(message: { to: string; subject: string; text: string; messageId: string }) { messages.push(message); } };

    const result = await processOpcPaymentNotifications({ sender, maximum: 5 });
    await processOpcPaymentNotifications({ sender, maximum: 5 });
    const dossier = await getAdminOpcOrderDossier(order.id);

    assert.deepEqual(result, { processed: 2, sent: 2, failed: 0 });
    assert.equal(messages.length, 2);
    const customer = messages.find((message) => message.to === "buyer@example.com");
    const administrator = messages.find((message) => message.to === "lanzhouda@163.com");
    assert.ok(customer);
    assert.ok(administrator);
    assert.match(customer.subject, /订单已创建/);
    assert.match(customer.text, new RegExp(`${order.reference}.*`, "s"));
    assert.match(customer.text, /1980\.00/);
    assert.match(customer.text, new RegExp(`https://superones\\.top/opc/payment/return\\?order=${order.reference}`));
    assert.doesNotMatch(customer.text, /admin\.superones\.top/);
    assert.match(administrator.subject, /新订单/);
    assert.match(administrator.text, /https:\/\/admin\.superones\.top\/admin#opc-order-OPC-/);
    assert.doesNotMatch(administrator.text, /13800138000|buyer@example\.com|邮件联系人|请电话联系|1234567890123456/);
    assert.match(customer.messageId, /^<order-created-customer-[0-9a-f-]+@superones\.top>$/);
    assert.match(administrator.messageId, /^<order-created-administrator-[0-9a-f-]+@superones\.top>$/);
    assert.deepEqual(dossier.notifications.map((notification: NotificationSummary) => [notification.eventType, notification.audience, notification.status]), [
      ["order_created", "administrator", "sent"],
      ["order_created", "customer", "sent"],
    ]);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("verified payment asynchronously emails the customer and administrator exactly once", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-opc-email-"));
  const previous = {
    dataDir: process.env.VAULT2077_DATA_DIR,
    dataKeys: process.env.VAULT2077_DATA_KEYS,
    dataActiveKey: process.env.VAULT2077_DATA_ACTIVE_KEY_ID,
    resumeKeys: process.env.VAULT2077_OPC_RESUME_TOKEN_KEYS,
    resumeActiveKey: process.env.VAULT2077_OPC_RESUME_TOKEN_ACTIVE_KEY_ID,
  };
  process.env.VAULT2077_DATA_DIR = root;
  process.env.VAULT2077_DATA_KEYS = JSON.stringify({ test: "d".repeat(40) });
  process.env.VAULT2077_DATA_ACTIVE_KEY_ID = "test";
  process.env.VAULT2077_OPC_RESUME_TOKEN_KEYS = JSON.stringify({ test: "r".repeat(40) });
  process.env.VAULT2077_OPC_RESUME_TOKEN_ACTIVE_KEY_ID = "test";
  try {
    const { createOpcOrderLifecycle } = await import(`../lib/opc-order-lifecycle.ts?email=${Date.now()}`);
    const { processOpcPaymentNotifications } = await import(`../lib/opc-payment-notifications.ts?email=${Date.now()}`);
    const lifecycle = createOpcOrderLifecycle({
      payments: {
        async createSession(order: { reference: string; amount: { decimal: string } }) {
          return { url: `https://openapi.alipay.com/gateway.do?out_trade_no=${order.reference}`, channel: "page" as const, appId: "2026000000000001", sellerId: "2088000000000001", amount: order.amount };
        },
      },
    });
    const agreementText = `OPC 在线订单及纸质合同预付款协议\n${"协议正文。".repeat(80)}`;
    const checkout = await lifecycle.createCheckout({
      idempotencyKey: "040231ac-3d3a-45b4-a1c9-e07e66d11278",
      signatureMethod: "paper",
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
      contact: { name: "邮件联系人", phone: "13800138000", email: "buyer@example.com", wechat: "", note: "" },
      signer: { type: "individual", name: "邮件联系人", phone: "13800138000", organizationName: "", organizationCreditCode: "", legalRepresentativeName: "" },
      delivery: { recipientName: "邮件联系人", phone: "13800138000", province: "上海市", city: "上海市", district: "浦东新区", addressLine: "测试路 3 号" },
      agreement: { version: "opc-paper-prepayment-v1", title: "OPC 在线订单及纸质合同预付款协议", text: agreementText, sha256: createHash("sha256").update(agreementText).digest("hex"), acceptedAt: "2026-08-05T12:00:00.000Z" },
      paymentChannel: "page",
    });
    await lifecycle.applyPaymentEvidence({ reference: checkout.order.reference, appId: "2026000000000001", sellerId: "2088000000000001", tradeNo: "2026080522001000000000000003", tradeStatus: "TRADE_SUCCESS", amount: { currency: "CNY", minorUnits: 198_000, decimal: "1980.00" }, source: "notify" });

    const messages: Array<{ to: string; subject: string; text: string; messageId: string }> = [];
    const sender = { async send(message: { to: string; subject: string; text: string; messageId: string }) { messages.push(message); } };
    const result = await processOpcPaymentNotifications({ sender, maximum: 5 });
    await processOpcPaymentNotifications({ sender, maximum: 5 });
    const dossier = await lifecycle.readAdminOrderDossier({ id: checkout.order.id });

    assert.equal(messages.length, 2);
    const customer = messages.find((message) => message.to === "buyer@example.com");
    const administrator = messages.find((message) => message.to === "lanzhouda@163.com");
    assert.ok(customer);
    assert.ok(administrator);
    assert.match(customer.subject, /OPC.*付款/);
    assert.match(customer.text, /1980\.00/);
    assert.match(customer.text, /支付宝交易号/);
    assert.match(customer.text, /https:\/\/superones\.top\/opc\/payment\/return\?order=OPC-/);
    assert.doesNotMatch(customer.text, /admin\.superones\.top|测试路 3 号/);
    assert.match(administrator.subject, /OPC.*付款/);
    assert.match(administrator.text, /1980\.00/);
    assert.match(administrator.text, /支付宝交易号/);
    assert.doesNotMatch(administrator.text, /13800138000|buyer@example\.com|测试路 3 号|邮件联系人/);
    assert.match(administrator.text, /https:\/\/admin\.superones\.top\/admin#opc-order-OPC-/);
    assert.match(administrator.messageId, /^<payment-confirmed-[0-9a-f-]+@superones\.top>$/);
    assert.match(customer.messageId, /^<payment-confirmed-customer-[0-9a-f-]+@superones\.top>$/);
    assert.deepEqual(result, { processed: 2, sent: 2, failed: 0 });
    assert.deepEqual(dossier.notifications.map((notification: NotificationSummary) => [notification.audience, notification.status]), [
      ["administrator", "sent"],
      ["customer", "sent"],
    ]);
  } finally {
    const restore = (name: string, value: string | undefined) => value === undefined ? delete process.env[name] : void (process.env[name] = value);
    restore("VAULT2077_DATA_DIR", previous.dataDir);
    restore("VAULT2077_DATA_KEYS", previous.dataKeys);
    restore("VAULT2077_DATA_ACTIVE_KEY_ID", previous.dataActiveKey);
    restore("VAULT2077_OPC_RESUME_TOKEN_KEYS", previous.resumeKeys);
    restore("VAULT2077_OPC_RESUME_TOKEN_ACTIVE_KEY_ID", previous.resumeActiveKey);
    await rm(root, { recursive: true, force: true });
  }
});
