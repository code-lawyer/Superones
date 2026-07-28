import assert from "node:assert/strict";
import test from "node:test";
import {
  opcOrderingAvailable,
  readOpcPaymentConfiguration,
} from "../lib/opc-payment-config.ts";

test("OPC payment configuration accepts only a real bounded public image asset", async () => {
  assert.equal(readOpcPaymentConfiguration({
    VAULT2077_OPC_ALIPAY_QR_PATH: "https://example.com/qr.svg",
    VAULT2077_OPC_ALIPAY_PAYEE: "真实收款方",
  }), null);

  assert.equal(await opcOrderingAvailable({
    VAULT2077_OPC_ALIPAY_QR_PATH: "/opc/missing-payment-code.png",
    VAULT2077_OPC_ALIPAY_PAYEE: "真实收款方",
  }), false);

  assert.equal(await opcOrderingAvailable({
    VAULT2077_OPC_ALIPAY_QR_PATH: "/opc/ranger-portraits-v1.webp",
    VAULT2077_OPC_ALIPAY_PAYEE: "本地测试收款方",
  }), true);
});
