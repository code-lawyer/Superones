import assert from "node:assert/strict";
import test from "node:test";

import { opcOrderEntryAvailable } from "../lib/opc-order-availability.ts";

test("local mock signing preview does not require real Alipay credentials", () => {
  assert.equal(opcOrderEntryAvailable({ NODE_ENV: "development" }), true);
});

test("production never exposes ordering without configured providers", () => {
  assert.equal(opcOrderEntryAvailable({
    NODE_ENV: "production",
    VAULT2077_OPC_ESIGN_ENABLED: "false",
    VAULT2077_OPC_PAYMENTS_ENABLED: "false",
  }), false);
});
