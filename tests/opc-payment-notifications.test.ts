import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("payment notification worker sends exactly one administrator email", async () => {
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

    assert.equal(messages.length, 1);
    assert.equal(messages[0].to, "lanzhouda@163.com");
    assert.match(messages[0].subject, /OPC.*付款/);
    assert.match(messages[0].text, /1980\.00/);
    assert.match(messages[0].text, /支付宝交易号/);
    assert.doesNotMatch(messages[0].text, /13800138000|buyer@example\.com|测试路 3 号|邮件联系人/);
    assert.match(messages[0].text, /https:\/\/admin\.superones\.top\/admin#opc-order-OPC-/);
    assert.match(messages[0].messageId, /^<payment-confirmed-[0-9a-f-]+@superones\.top>$/);
    assert.deepEqual(result, { processed: 1, sent: 1, failed: 0 });
    assert.equal(dossier.notifications[0].status, "sent");
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
