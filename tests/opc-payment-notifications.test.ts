import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

type NotificationSummary = {
  eventType: "order_created" | "payment_confirmed" | "refund_requested";
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
      contact: { name: "无邮箱联系人", phone: "13800138000", email: "", wechat: "", note: "", identityDocumentNumber: "11010519491231002X" },
      signer: { type: "individual", name: "无邮箱联系人", phone: "13800138000", organizationName: "", organizationCreditCode: "", legalRepresentativeName: "" },
      agreement: { version: "opc-offline-bank-transfer-v1", title: "OPC 服务订单及线下对公转账协议", text: agreementText, sha256: createHash("sha256").update(agreementText).digest("hex"), acceptedAt: "2026-08-11T12:00:00.000Z" },
      identityConsent: { version: "opc-contract-identity-consent-v1", acceptedAt: "2026-08-11T12:00:00.000Z" },
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
      contact: { name: "邮件联系人", phone: "13800138000", email: "buyer@example.com", wechat: "", note: "请电话联系", identityDocumentNumber: "11010519491231002X" },
      signer: { type: "individual", name: "邮件联系人", phone: "13800138000", organizationName: "", organizationCreditCode: "", legalRepresentativeName: "" },
      agreement: { version: "opc-offline-bank-transfer-v1", title: "OPC 服务订单及线下对公转账协议", text: agreementText, sha256: createHash("sha256").update(agreementText).digest("hex"), acceptedAt: "2026-08-11T12:00:00.000Z" },
      identityConsent: { version: "opc-contract-identity-consent-v1", acceptedAt: "2026-08-11T12:00:00.000Z" },
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
