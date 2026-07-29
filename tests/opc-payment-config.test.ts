import assert from "node:assert/strict";
import { createSign } from "node:crypto";
import test from "node:test";
import {
  catalogPriceToAlipayAmount,
  createOpcAlipayPaymentUrl,
  opcOrderingAvailable,
  readOpcAlipayConfiguration,
  verifyOpcAlipayNotification,
} from "../lib/opc-payment-config.ts";
import {
  testAlipayNotificationPrivateKey,
  validTestAlipayEnvironment,
} from "./alipay-test-environment.ts";

test("OPC Alipay configuration accepts only official gateways and valid RSA keys", () => {
  assert.equal(readOpcAlipayConfiguration({
    ...validTestAlipayEnvironment(),
    VAULT2077_ALIPAY_GATEWAY: "https://example.com/gateway.do",
  }), null);
  assert.equal(opcOrderingAvailable(validTestAlipayEnvironment()), true);
  assert.equal(readOpcAlipayConfiguration({
    ...validTestAlipayEnvironment(),
    NODE_ENV: "production",
    VAULT2077_ALIPAY_GATEWAY: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
  }), null);
});

test("OPC Alipay checkout uses the official page-pay link and server-owned amount", () => {
  const configuration = readOpcAlipayConfiguration(validTestAlipayEnvironment());
  assert.ok(configuration);
  const paymentUrl = createOpcAlipayPaymentUrl({
    reference: "OPC-20260728-ABCDEF123456",
    serviceCode: "OPC/LEGAL/001",
    serviceName: "单份商业合同审查包",
    serviceRevision: "SKU.01",
    paymentAmount: {
      currency: "CNY",
      minorUnits: 198_000,
      decimal: "1980.00",
    },
  }, "page", configuration);
  const parsed = new URL(paymentUrl);
  const bizContent = JSON.parse(parsed.searchParams.get("biz_content") ?? "{}") as Record<string, string>;

  assert.equal(parsed.hostname, "openapi.alipay.com");
  assert.equal(parsed.searchParams.get("method"), "alipay.trade.page.pay");
  assert.equal(bizContent.out_trade_no, "OPC-20260728-ABCDEF123456");
  assert.equal(bizContent.total_amount, "1980.00");
  assert.equal(bizContent.seller_id, configuration.sellerId);
  assert.equal(parsed.searchParams.get("notify_url"), "https://vault2077.test/api/opc/alipay/notify");
  assert.deepEqual(catalogPriceToAlipayAmount("人民币 12,800 元"), {
    currency: "CNY",
    minorUnits: 1_280_000,
    decimal: "12800.00",
  });
  assert.deepEqual(catalogPriceToAlipayAmount("人民币 6,800 元/年"), {
    currency: "CNY",
    minorUnits: 680_000,
    decimal: "6800.00",
  });
});

test("OPC accepts a correctly signed Alipay success notification", () => {
  const configuration = readOpcAlipayConfiguration(validTestAlipayEnvironment());
  assert.ok(configuration);
  const notification: Record<string, string> = {
    app_id: configuration.appId,
    seller_id: configuration.sellerId,
    out_trade_no: "OPC-20260728-ABCDEF123456",
    trade_no: "2026072822001000000000000001",
    trade_status: "TRADE_SUCCESS",
    total_amount: "1980.00",
    sign_type: "RSA2",
  };
  const signContent = Object.keys(notification)
    .sort()
    .map((key) => `${key}=${notification[key]}`)
    .join("&");
  notification.sign = createSign("RSA-SHA256")
    .update(signContent, "utf8")
    .sign(testAlipayNotificationPrivateKey, "base64");

  assert.deepEqual(verifyOpcAlipayNotification(notification, configuration), {
    reference: notification.out_trade_no,
    sellerId: notification.seller_id,
    tradeNo: notification.trade_no,
    tradeStatus: "TRADE_SUCCESS",
    amount: {
      currency: "CNY",
      minorUnits: 198_000,
      decimal: "1980.00",
    },
  });
  assert.throws(
    () => verifyOpcAlipayNotification({ ...notification, total_amount: "1.00" }, configuration),
    /验签失败/,
  );
});
