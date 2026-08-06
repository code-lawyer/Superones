import assert from "node:assert/strict";
import test from "node:test";
import { calculateOpcPaymentReceiptLayout } from "../lib/opc-payment-receipt-layout.ts";

test("payment receipt canvas grows so long service text cannot cover URL and ICP evidence", () => {
  const measureText = (text: string) => text.length * 29;
  const short = calculateOpcPaymentReceiptLayout(["短内容"], measureText);
  const long = calculateOpcPaymentReceiptLayout(["很长的服务范围与边界".repeat(120)], measureText);

  assert.equal(short.height, 1900);
  assert.ok(long.height > short.height);
  assert.ok(long.footerBottom <= long.height - 60);
});
