import assert from "node:assert/strict";
import test from "node:test";

import { opcOrderEntryAvailable } from "../lib/opc-order-availability.ts";
test("offline checkout availability uses an independent switch", () => {
  assert.equal(opcOrderEntryAvailable({ NODE_ENV: "development" }), true);
  assert.equal(opcOrderEntryAvailable({
    NODE_ENV: "development",
    VAULT2077_OPC_OFFLINE_PAYMENT_ENABLED: "true",
  }), true);
  assert.equal(opcOrderEntryAvailable({
    NODE_ENV: "development",
    VAULT2077_OPC_OFFLINE_PAYMENT_ENABLED: "false",
  }), false);
});

test("production never exposes ordering without configured providers", () => {
  assert.equal(opcOrderEntryAvailable({
    NODE_ENV: "production",
    VAULT2077_OPC_OFFLINE_PAYMENT_ENABLED: "false",
  }), false);
  assert.equal(opcOrderEntryAvailable({
    NODE_ENV: "production",
    VAULT2077_OPC_OFFLINE_PAYMENT_ENABLED: "true",
  }), true);
});
