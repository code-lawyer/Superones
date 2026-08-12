import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("paid bank order refund application is authorized, idempotent, encrypted, and emails only a safe admin summary", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-opc-refund-application-"));
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
    const checkout = await import(`../lib/opc-orders/checkout.ts?refund-application=${Date.now()}`);
    const payment = await import(`../lib/opc-orders/payment.ts?refund-application=${Date.now()}`);
    const refundApplication = await import(`../lib/opc-orders/refund-application.ts?refund-application=${Date.now()}`);
    const notifications = await import(`../lib/opc-payment-notifications.ts?refund-application=${Date.now()}`);
    const storeModule = await import(`../lib/opc-orders/internal-store.ts?refund-application=${Date.now()}`);
    const admin = await import(`../lib/opc-orders/admin.ts?refund-application=${Date.now()}`);
    const agreementText = `OPC 服务订单及线下对公转账协议\n${"协议正文。".repeat(80)}`;
    const order = await checkout.createOpcOrder({
      idempotencyKey: "92fdf64b-e06a-4451-85e4-27c08fe25ca2",
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
      contact: { name: "退款申请人", phone: "13800138000", email: "refund@example.com", wechat: "private-wechat", note: "敏感备注", identityDocumentNumber: "11010519491231002X" },
      signer: { type: "individual", name: "退款申请人", phone: "13800138000", organizationName: "", organizationCreditCode: "", legalRepresentativeName: "" },
      agreement: { version: "opc-offline-bank-transfer-v2", title: "OPC 服务订单及线下对公转账协议", text: agreementText, sha256: createHash("sha256").update(agreementText).digest("hex"), acceptedAt: "2026-08-11T12:00:00.000Z" },
      identityConsent: { version: "opc-contract-identity-consent-v1", acceptedAt: "2026-08-11T12:00:00.000Z" },
      offlinePaymentSnapshot: {
        revision: "offline-payment-2026-08-11-v2",
        account: { name: "上海睿诚明达咨询管理有限公司", bankName: "测试银行", branchName: "测试支行", accountNumber: "1234567890123456", cnapsCode: "" },
        agreementSha256: "a".repeat(64),
        contactQrSha256: "b".repeat(64),
      },
    });

    await assert.rejects(
      () => refundApplication.lookupOpcRefundApplication(order.reference, "x".repeat(43)),
      /订单号或订单凭证无效/,
    );
    await assert.rejects(
      () => refundApplication.requestOpcRefundApplication({ reference: order.reference, resumeToken: order.resumeToken!, reason: "尚未到账也不应创建退款申请" }),
      /尚未确认到账/,
    );

    const stored = (await storeModule.readOpcOrderStore()).orders[0];
    await payment.verifyOpcBankTransfer({
      id: stored.id,
      expectedUpdatedAt: stored.updatedAt,
      amountDecimal: "1980.00",
      bankTransactionId: "BANK-REFUND-APPLICATION-01",
      payerName: "退款申请人",
      paidAt: stored.createdAt,
    });
    const messages: Array<{ to: string; subject: string; text: string; messageId: string }> = [];
    const sender = { async send(message: { to: string; subject: string; text: string; messageId: string }) { messages.push(message); } };
    await notifications.processOpcPaymentNotifications({ sender, maximum: 20 });
    messages.length = 0;

    const reason = "项目尚未启动，希望客服核对后协助办理退款。";
    const first = await refundApplication.requestOpcRefundApplication({ reference: order.reference, resumeToken: order.resumeToken!, reason });
    const repeated = await refundApplication.requestOpcRefundApplication({ reference: order.reference, resumeToken: order.resumeToken!, reason: "" });
    assert.deepEqual(repeated.refundApplication, first.refundApplication);
    assert.equal(first.status, "paid");
    assert.deepEqual(Object.keys(first).sort(), [
      "actualRefundStatus",
      "paymentAmount",
      "paymentProvider",
      "reference",
      "refundApplication",
      "refundEligible",
      "serviceName",
      "status",
    ]);

    const storedAfter = (await storeModule.readOpcOrderStore()).orders[0];
    assert.equal(storedAfter.notifications.filter((event: { eventType: string }) => event.eventType === "refund_requested").length, 1);
    assert.ok(storedAfter.refundApplication?.reasonEncrypted);
    assert.doesNotMatch(JSON.stringify(storedAfter), new RegExp(reason));
    const fingerprintWithIdentity = storeModule.orderRequestFingerprint({
      signatureMethod: "online",
      paymentProvider: "bank_transfer",
      serviceKind: "specialty",
      serviceSlug: "single-commercial-contract-review",
      serviceCode: "S-01-01",
      serviceName: "单份商业合同审查包",
      serviceRevision: "SKU.01",
      quotedPrice: "人民币 1,980 元",
      contact: { name: "退款申请人", phone: "13800138000", email: "refund@example.com", wechat: "private-wechat", note: "敏感备注", identityDocumentNumber: "11010519491231002X" },
      signer: { type: "individual", name: "退款申请人", phone: "13800138000", organizationName: "", organizationCreditCode: "", legalRepresentativeName: "" },
    });
    const fingerprintWithDifferentIdentity = storeModule.orderRequestFingerprint({
      signatureMethod: "online",
      paymentProvider: "bank_transfer",
      serviceKind: "specialty",
      serviceSlug: "single-commercial-contract-review",
      serviceCode: "S-01-01",
      serviceName: "单份商业合同审查包",
      serviceRevision: "SKU.01",
      quotedPrice: "人民币 1,980 元",
      contact: { name: "退款申请人", phone: "13800138000", email: "refund@example.com", wechat: "private-wechat", note: "敏感备注", identityDocumentNumber: "110105194912310010" },
      signer: { type: "individual", name: "退款申请人", phone: "13800138000", organizationName: "", organizationCreditCode: "", legalRepresentativeName: "" },
    });
    assert.equal(fingerprintWithIdentity, fingerprintWithDifferentIdentity);

    const result = await notifications.processOpcPaymentNotifications({ sender, maximum: 5 });
    assert.deepEqual(result, { processed: 1, sent: 1, failed: 0 });
    assert.equal(messages.length, 1);
    assert.equal(messages[0].to, "lanzhouda@163.com");
    assert.match(messages[0].subject, /退款申请/);
    assert.match(messages[0].text, new RegExp(order.reference));
    assert.match(messages[0].text, /申请不代表已经退款/);
    assert.doesNotMatch(messages[0].text, /退款申请人|13800138000|11010519491231002X|refund@example\.com|private-wechat|敏感备注|项目尚未启动/);

    const dossier = await admin.getAdminOpcOrderSensitiveDossier(order.id);
    assert.equal(dossier.refundApplication?.reason, reason);
    assert.equal(dossier.contact.identityDocumentNumberMasked, "110105********002X");
    assert.doesNotMatch(JSON.stringify(dossier), /11010519491231002X/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("a verified Alipay payment exception remains eligible for a refund application", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-opc-refund-payment-exception-"));
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
    const checkout = await import(`../lib/opc-orders/checkout.ts?refund-payment-exception=${Date.now()}`);
    const payment = await import(`../lib/opc-orders/payment.ts?refund-payment-exception=${Date.now()}`);
    const refundApplication = await import(`../lib/opc-orders/refund-application.ts?refund-payment-exception=${Date.now()}`);
    const order = await checkout.createOpcOrder({
      idempotencyKey: "e3883935-1ad1-44af-bae7-22cf9f3d105f",
      signatureMethod: "electronic",
      paymentProvider: "alipay",
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
      contact: { name: "历史付款客户", phone: "13800138000", email: "legacy@example.com", wechat: "", note: "" },
      signer: { type: "individual", name: "历史付款客户", phone: "13800138000", organizationName: "", organizationCreditCode: "", legalRepresentativeName: "" },
    });
    await payment.applyOpcAlipayTradeResult({
      reference: order.reference,
      sellerId: "2088000000000001",
      appId: "2026000000000001",
      tradeNo: "2026081122001000000000000001",
      tradeStatus: "TRADE_SUCCESS",
      amount: { currency: "CNY", minorUnits: 198_000, decimal: "1980.00" },
      source: "notify",
    });

    const result = await refundApplication.requestOpcRefundApplication({
      reference: order.reference,
      resumeToken: order.resumeToken!,
      reason: "付款已经确认，但合同状态异常，请客服协助退款。",
    });
    assert.equal(result.status, "payment_exception");
    assert.equal(result.refundEligible, true);
    assert.equal(result.refundApplication?.status, "requested");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});
