import assert from "node:assert/strict";
import { test } from "node:test";
import { handleOpcEsignCallback } from "../lib/opc-esign-callback.ts";

for (const [name, environment] of [
  ["disabled", { NODE_ENV: "production", VAULT2077_OPC_ESIGN_ENABLED: "false" }],
  ["not explicitly enabled", { NODE_ENV: "development" }],
] as const) test(`${name} OPC e-sign callback fails closed before consuming the request body`, async () => {
  let bodyConsumed = false;
  const request = {
    headers: new Headers(),
    async text() {
      bodyConsumed = true;
      throw new Error("disabled callback must not read its body");
    },
  } as unknown as Request;
  const response = await handleOpcEsignCallback(request, {
    verify: () => { throw new Error("disabled callback must not verify"); },
    record: async () => { throw new Error("disabled callback must not record"); },
    reconcile: async () => { throw new Error("disabled callback must not reconcile"); },
    defer: () => { throw new Error("disabled callback must not defer"); },
  }, environment);

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(await response.text(), "");
  assert.equal(bodyConsumed, false);
});

test("enabled OPC e-sign callback stops an oversized chunked body before verification", async () => {
  let cancelled = false;
  let verified = false;
  const chunk = new Uint8Array(64 * 1024);
  const request = new Request("http://localhost/api/opc/esign/callback", {
    method: "POST",
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    }),
    duplex: "half",
  } as RequestInit);
  assert.equal(request.headers.get("content-length"), null);

  const response = await handleOpcEsignCallback(request, {
    verify: () => {
      verified = true;
      return {};
    },
    record: async () => { throw new Error("oversized callback must not record"); },
    reconcile: async () => { throw new Error("oversized callback must not reconcile"); },
    defer: () => { throw new Error("oversized callback must not defer"); },
  }, {
    NODE_ENV: "development",
    VAULT2077_OPC_ESIGN_ENABLED: "true",
  });

  assert.equal(response.status, 413);
  assert.equal(await response.text(), "too large");
  assert.equal(verified, false);
  assert.equal(cancelled, true);
});

test("enabled OPC e-sign callback does not misclassify verifier range errors as oversized bodies", async () => {
  const request = new Request("http://localhost/api/opc/esign/callback", {
    method: "POST",
    body: "{}",
  });
  const originalConsoleError = console.error;
  console.error = () => undefined;
  try {
    const response = await handleOpcEsignCallback(request, {
      verify: () => { throw new RangeError("invalid signature field"); },
      record: async () => { throw new Error("rejected callback must not record"); },
      reconcile: async () => { throw new Error("rejected callback must not reconcile"); },
      defer: () => { throw new Error("rejected callback must not defer"); },
    }, {
      NODE_ENV: "development",
      VAULT2077_OPC_ESIGN_ENABLED: "true",
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { code: "401", msg: "rejected" });
  } finally {
    console.error = originalConsoleError;
  }
});
