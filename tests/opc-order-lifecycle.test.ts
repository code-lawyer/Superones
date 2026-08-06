import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const dataKeyring = JSON.stringify({ test: "d".repeat(40) });
const resumeKeyring = JSON.stringify({ test: "r".repeat(40) });
const agreementText = `OPC 在线订单及纸质合同预付款协议\n${"协议正文。".repeat(80)}`;
const agreementSha256 = createHash("sha256").update(agreementText).digest("hex");

test("paper checkout starts a fixed-amount awaiting-payment order", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-opc-lifecycle-"));
  const previousEnvironment = {
    dataDir: process.env.VAULT2077_DATA_DIR,
    dataKeys: process.env.VAULT2077_DATA_KEYS,
    dataActiveKey: process.env.VAULT2077_DATA_ACTIVE_KEY_ID,
    resumeKeys: process.env.VAULT2077_OPC_RESUME_TOKEN_KEYS,
    resumeActiveKey: process.env.VAULT2077_OPC_RESUME_TOKEN_ACTIVE_KEY_ID,
  };
  process.env.VAULT2077_DATA_DIR = root;
  process.env.VAULT2077_DATA_KEYS = dataKeyring;
  process.env.VAULT2077_DATA_ACTIVE_KEY_ID = "test";
  process.env.VAULT2077_OPC_RESUME_TOKEN_KEYS = resumeKeyring;
  process.env.VAULT2077_OPC_RESUME_TOKEN_ACTIVE_KEY_ID = "test";
  try {
    const { createOpcOrderLifecycle } = await import(`../lib/opc-order-lifecycle.ts?test=${Date.now()}`);
    const lifecycle = createOpcOrderLifecycle({
      payments: {
        async createSession(order: { reference: string; amount: { decimal: string } }) {
          return {
            url: `https://openapi.alipay.com/gateway.do?out_trade_no=${order.reference}`,
            channel: "page" as const,
            appId: "2026000000000001",
            sellerId: "2088000000000001",
            amount: order.amount,
          };
        },
      },
    });

    const checkoutInput = {
      idempotencyKey: "4aa750f8-32f9-4a5b-b826-a67f87a03f5a",
      signatureMethod: "paper" as const,
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
        email: "buyer@example.com",
        wechat: "",
        note: "",
      },
      signer: {
        type: "individual",
        name: "测试联系人",
        phone: "13800138000",
        organizationName: "",
        organizationCreditCode: "",
        legalRepresentativeName: "",
      },
      delivery: {
        recipientName: "测试联系人",
        phone: "13800138000",
        province: "上海市",
        city: "上海市",
        district: "浦东新区",
        addressLine: "测试路 1 号",
      },
      agreement: {
        version: "opc-prepayment-v1",
        title: "OPC 在线订单及纸质合同预付款协议",
        text: agreementText,
        sha256: agreementSha256,
        acceptedAt: "2026-08-05T12:00:00.000Z",
      },
      paymentChannel: "page" as const,
    };
    const checkout = await lifecycle.createCheckout(checkoutInput);
    const recoveredCheckout = await lifecycle.createCheckout({
      ...checkoutInput,
      agreement: {
        ...checkoutInput.agreement,
        acceptedAt: "2026-08-05T12:00:01.000Z",
      },
    });

    assert.deepEqual({
      status: checkout.order.status,
      signatureMethod: checkout.order.signatureMethod,
      amount: checkout.order.paymentAmount,
      paymentUrl: checkout.paymentUrl,
      recoveredReference: recoveredCheckout.order.reference,
      recoveredResumeToken: recoveredCheckout.order.resumeToken,
    }, {
      status: "awaiting_payment",
      signatureMethod: "paper",
      amount: { currency: "CNY", minorUnits: 198_000, decimal: "1980.00" },
      paymentUrl: `https://openapi.alipay.com/gateway.do?out_trade_no=${checkout.order.reference}`,
      recoveredReference: checkout.order.reference,
      recoveredResumeToken: checkout.order.resumeToken,
    });
  } finally {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore("VAULT2077_DATA_DIR", previousEnvironment.dataDir);
    restore("VAULT2077_DATA_KEYS", previousEnvironment.dataKeys);
    restore("VAULT2077_DATA_ACTIVE_KEY_ID", previousEnvironment.dataActiveKey);
    restore("VAULT2077_OPC_RESUME_TOKEN_KEYS", previousEnvironment.resumeKeys);
    restore("VAULT2077_OPC_RESUME_TOKEN_ACTIVE_KEY_ID", previousEnvironment.resumeActiveKey);
    await rm(root, { recursive: true, force: true });
  }
});

test("verified payment creates one receipt and one notification event", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-opc-paid-lifecycle-"));
  const previousEnvironment = {
    dataDir: process.env.VAULT2077_DATA_DIR,
    dataKeys: process.env.VAULT2077_DATA_KEYS,
    dataActiveKey: process.env.VAULT2077_DATA_ACTIVE_KEY_ID,
    resumeKeys: process.env.VAULT2077_OPC_RESUME_TOKEN_KEYS,
    resumeActiveKey: process.env.VAULT2077_OPC_RESUME_TOKEN_ACTIVE_KEY_ID,
  };
  process.env.VAULT2077_DATA_DIR = root;
  process.env.VAULT2077_DATA_KEYS = dataKeyring;
  process.env.VAULT2077_DATA_ACTIVE_KEY_ID = "test";
  process.env.VAULT2077_OPC_RESUME_TOKEN_KEYS = resumeKeyring;
  process.env.VAULT2077_OPC_RESUME_TOKEN_ACTIVE_KEY_ID = "test";
  try {
    const { createOpcOrderLifecycle } = await import(`../lib/opc-order-lifecycle.ts?paid=${Date.now()}`);
    const lifecycle = createOpcOrderLifecycle({
      payments: {
        async createSession(order: { reference: string; amount: { decimal: string } }) {
          return {
            url: `https://openapi.alipay.com/gateway.do?out_trade_no=${order.reference}`,
            channel: "page" as const,
            appId: "2026000000000001",
            sellerId: "2088000000000001",
            amount: order.amount,
          };
        },
      },
    });
    const checkout = await lifecycle.createCheckout({
      idempotencyKey: "786b3525-e5cd-44ce-9e1c-2418672329e3",
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
      contact: { name: "测试联系人", phone: "13800138000", email: "buyer@example.com", wechat: "", note: "" },
      signer: {
        type: "organization",
        name: "测试联系人",
        phone: "13800138000",
        organizationName: "上海测试科技有限公司",
        organizationCreditCode: "91310000TEST000001",
        legalRepresentativeName: "测试法人",
      },
      delivery: {
        recipientName: "测试联系人",
        phone: "13800138000",
        province: "上海市",
        city: "上海市",
        district: "浦东新区",
        addressLine: "测试路 1 号",
      },
      agreement: { version: "opc-prepayment-v1", title: "OPC 在线订单及纸质合同预付款协议", text: agreementText, sha256: agreementSha256, acceptedAt: "2026-08-05T12:00:00.000Z" },
      paymentChannel: "page",
    });
    const evidence = {
      reference: checkout.order.reference,
      appId: "2026000000000001",
      sellerId: "2088000000000001",
      tradeNo: "2026080522001000000000000001",
      tradeStatus: "TRADE_SUCCESS" as const,
      amount: { currency: "CNY" as const, minorUnits: 198_000, decimal: "1980.00" },
      source: "notify" as const,
    };

    assert.equal(await lifecycle.claimPublicPaymentQuery({ reference: checkout.order.reference }), true);
    assert.equal(await lifecycle.claimPublicPaymentQuery({ reference: checkout.order.reference }), false);

    await lifecycle.applyPaymentEvidence(evidence);
    await lifecycle.applyPaymentEvidence(evidence);
    const receipt = await lifecycle.readPaymentReceipt({
      reference: checkout.order.reference,
      resumeToken: checkout.order.resumeToken,
    });
    const dossier = await lifecycle.readAdminOrderDossier({ id: checkout.order.id });
    const capturedPaidAt = dossier.timestamps.paidAt;

    assert.deepEqual({
      status: dossier.status,
      receiptNumber: receipt.receiptNumber,
      operatorName: receipt.operator.name,
      operatorCreditCode: receipt.operator.creditCode,
      customerName: receipt.customer.organizationName,
      amount: receipt.payment.amount.decimal,
      notificationEvents: dossier.notifications.length,
    }, {
      status: "paid_pending_contract",
      receiptNumber: `V2077-PAY-${checkout.order.reference.slice(4)}`,
      operatorName: "上海睿诚明达咨询管理有限公司",
      operatorCreditCode: "91310000MAC3G0M33G",
      customerName: "上海测试科技有限公司",
      amount: "1980.00",
      notificationEvents: 1,
    });

    await assert.rejects(
      lifecycle.approvePaperContract({ id: checkout.order.id, expectedUpdatedAt: "2000-01-01T00:00:00.000Z" }),
      /订单状态已经变化/,
    );
    const approved = await lifecycle.approvePaperContract({
      id: checkout.order.id,
      expectedUpdatedAt: dossier.timestamps.updatedAt,
    });
    const approvedDossier = await lifecycle.readAdminOrderDossier({ id: checkout.order.id });
    const completed = await lifecycle.completeOrder({ id: checkout.order.id });
    const receiptAfterCompletion = await lifecycle.readPaymentReceipt({
      reference: checkout.order.reference,
      resumeToken: checkout.order.resumeToken,
    });
    assert.deepEqual({
      approvedStatus: approved.status,
      completedStatus: completed.status,
      immutableReceiptHash: receiptAfterCompletion.snapshotSha256,
      paidAtWasPreserved: approvedDossier.timestamps.paidAt === capturedPaidAt,
      paperContractApprovedAt: approvedDossier.timestamps.paperContractApprovedAt,
    }, {
      approvedStatus: "paid",
      completedStatus: "completed",
      immutableReceiptHash: receipt.snapshotSha256,
      paidAtWasPreserved: true,
      paperContractApprovedAt: approvedDossier.timestamps.updatedAt,
    });
  } finally {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore("VAULT2077_DATA_DIR", previousEnvironment.dataDir);
    restore("VAULT2077_DATA_KEYS", previousEnvironment.dataKeys);
    restore("VAULT2077_DATA_ACTIVE_KEY_ID", previousEnvironment.dataActiveKey);
    restore("VAULT2077_OPC_RESUME_TOKEN_KEYS", previousEnvironment.resumeKeys);
    restore("VAULT2077_OPC_RESUME_TOKEN_ACTIVE_KEY_ID", previousEnvironment.resumeActiveKey);
    await rm(root, { recursive: true, force: true });
  }
});

test("full refund stays pending until the provider confirms the entire amount", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-opc-refund-lifecycle-"));
  const previousEnvironment = {
    dataDir: process.env.VAULT2077_DATA_DIR,
    dataKeys: process.env.VAULT2077_DATA_KEYS,
    dataActiveKey: process.env.VAULT2077_DATA_ACTIVE_KEY_ID,
    resumeKeys: process.env.VAULT2077_OPC_RESUME_TOKEN_KEYS,
    resumeActiveKey: process.env.VAULT2077_OPC_RESUME_TOKEN_ACTIVE_KEY_ID,
  };
  process.env.VAULT2077_DATA_DIR = root;
  process.env.VAULT2077_DATA_KEYS = dataKeyring;
  process.env.VAULT2077_DATA_ACTIVE_KEY_ID = "test";
  process.env.VAULT2077_OPC_RESUME_TOKEN_KEYS = resumeKeyring;
  process.env.VAULT2077_OPC_RESUME_TOKEN_ACTIVE_KEY_ID = "test";
  try {
    const { createOpcOrderLifecycle } = await import(`../lib/opc-order-lifecycle.ts?refund=${Date.now()}`);
    let providerCalls = 0;
    let queryCalls = 0;
    const lifecycle = createOpcOrderLifecycle({
      payments: {
        async createSession(order: { reference: string; amount: { decimal: string } }) {
          return {
            url: `https://openapi.alipay.com/gateway.do?out_trade_no=${order.reference}`,
            channel: "page" as const,
            appId: "2026000000000001",
            sellerId: "2088000000000001",
            amount: order.amount,
          };
        },
      },
      refunds: {
        async refundFull(order: { reference: string; refundRequestNo: string; amount: { decimal: string } }) {
          providerCalls += 1;
          return {
            status: "processing" as const,
            reference: order.reference,
            refundRequestNo: order.refundRequestNo,
            amount: order.amount,
          };
        },
        async queryFull(order: { reference: string; refundRequestNo: string; amount: { decimal: string } }) {
          queryCalls += 1;
          return {
            status: queryCalls >= 2 ? "succeeded" as const : "processing" as const,
            reference: order.reference,
            refundRequestNo: order.refundRequestNo,
            amount: order.amount,
          };
        },
      },
    });
    const checkout = await lifecycle.createCheckout({
      idempotencyKey: "855088e4-f416-4e36-b4e0-edaff019d0ab",
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
      contact: { name: "退款联系人", phone: "13800138000", email: "refund@example.com", wechat: "", note: "" },
      signer: { type: "individual", name: "退款联系人", phone: "13800138000", organizationName: "", organizationCreditCode: "", legalRepresentativeName: "" },
      delivery: { recipientName: "退款联系人", phone: "13800138000", province: "上海市", city: "上海市", district: "浦东新区", addressLine: "测试路 2 号" },
      agreement: { version: "opc-prepayment-v1", title: "OPC 在线订单及纸质合同预付款协议", text: agreementText, sha256: agreementSha256, acceptedAt: "2026-08-05T12:00:00.000Z" },
      paymentChannel: "page",
    });
    await lifecycle.applyPaymentEvidence({
      reference: checkout.order.reference,
      appId: "2026000000000001",
      sellerId: "2088000000000001",
      tradeNo: "2026080522001000000000000002",
      tradeStatus: "TRADE_SUCCESS",
      amount: { currency: "CNY", minorUnits: 198_000, decimal: "1980.00" },
      source: "notify",
    });

    const refunded = await lifecycle.refundFullAmount({ id: checkout.order.id, reason: "用户不同意纸质合同" });
    const repeated = await lifecycle.refundFullAmount({ id: checkout.order.id, reason: "用户不同意纸质合同" });
    assert.deepEqual({
      status: refunded.status,
      repeatedStatus: repeated.status,
      providerCalls,
      queryCalls,
    }, {
      status: "refund_pending",
      repeatedStatus: "refunded",
      providerCalls: 1,
      queryCalls: 2,
    });
  } finally {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore("VAULT2077_DATA_DIR", previousEnvironment.dataDir);
    restore("VAULT2077_DATA_KEYS", previousEnvironment.dataKeys);
    restore("VAULT2077_DATA_ACTIVE_KEY_ID", previousEnvironment.dataActiveKey);
    restore("VAULT2077_OPC_RESUME_TOKEN_KEYS", previousEnvironment.resumeKeys);
    restore("VAULT2077_OPC_RESUME_TOKEN_ACTIVE_KEY_ID", previousEnvironment.resumeActiveKey);
    await rm(root, { recursive: true, force: true });
  }
});
