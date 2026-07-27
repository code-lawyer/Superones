import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { deliverAcquisitionBatch } from "../lib/acquisition-delivery.ts";
import { payloadHash, signingInput } from "../lib/batch-signing.ts";

test("delivery retries transient failures with the same body and a versioned signature", async () => {
  const requests: Array<{ body: string; headers: Headers }> = [];
  const responses = [
    new Response("temporary", { status: 503 }),
    new Response(JSON.stringify({ accepted: true }), {
      status: 202,
      headers: { "content-type": "application/json" },
    }),
  ];
  const rawPayload = JSON.stringify({ batchId: "batch:retry" });
  const secret = "delivery-secret-value-that-is-long-enough";
  const waits: number[] = [];
  const receipt = await deliverAcquisitionBatch({
    url: "https://ingest.example.test/api/internal/acquisition",
    keyId: "2026-07",
    secret,
    batch: { batchId: "batch:retry" },
    rawPayload,
    baseDelayMs: 10,
    now: () => 1_785_000_000_000,
    wait: async (milliseconds) => { waits.push(milliseconds); },
    fetcher: async (_url, init) => {
      requests.push({ body: String(init?.body), headers: new Headers(init?.headers) });
      return responses.shift() ?? new Response("unexpected", { status: 500 });
    },
  });

  assert.equal(receipt.attempt, 2);
  assert.deepEqual(waits, [10]);
  assert.equal(requests.length, 2);
  assert.ok(requests.every((request) => request.body === rawPayload));
  const headers = requests[0].headers;
  assert.equal(headers.get("x-vault2077-key-id"), "2026-07");
  const timestamp = headers.get("x-vault2077-timestamp") ?? "";
  const expected = createHmac("sha256", secret)
    .update(signingInput(timestamp, "batch:retry", payloadHash(rawPayload)))
    .digest("base64url");
  assert.equal(headers.get("x-vault2077-signature"), `sha256=${expected}`);
});

test("delivery does not retry deterministic authentication failures", async () => {
  let calls = 0;
  await assert.rejects(
    deliverAcquisitionBatch({
      url: "https://ingest.example.test/api/internal/acquisition",
      keyId: "current",
      secret: "delivery-secret-value-that-is-long-enough",
      batch: { batchId: "batch:unauthorized" },
      rawPayload: "{}",
      wait: async () => undefined,
      fetcher: async () => {
        calls += 1;
        return new Response("unauthorized", { status: 401 });
      },
    }),
    /HTTP 401/,
  );
  assert.equal(calls, 1);
});
