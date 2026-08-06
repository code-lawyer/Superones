import assert from "node:assert/strict";
import test from "node:test";

import { opcOrderEntryAvailable } from "../lib/opc-order-availability.ts";
import { validTestAlipayEnvironment } from "./alipay-test-environment.ts";

test("paper checkout availability depends on Alipay, not electronic signing", () => {
  assert.equal(opcOrderEntryAvailable({ NODE_ENV: "development" }), false);
  assert.equal(opcOrderEntryAvailable({
    NODE_ENV: "development",
    VAULT2077_OPC_PAPER_CHECKOUT_ENABLED: "true",
    VAULT2077_OPC_PAYMENTS_ENABLED: "true",
    ...validTestAlipayEnvironment(),
  }), true);
});

test("production never exposes ordering without configured providers", () => {
  assert.equal(opcOrderEntryAvailable({
    NODE_ENV: "production",
    VAULT2077_OPC_ESIGN_ENABLED: "false",
    VAULT2077_OPC_PAPER_CHECKOUT_ENABLED: "false",
    VAULT2077_OPC_PAYMENTS_ENABLED: "false",
  }), false);
});
