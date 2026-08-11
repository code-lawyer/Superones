import assert from "node:assert/strict";
import test from "node:test";
import { readBoundedJsonBody } from "../lib/bounded-json-body.ts";

function chunkedRequest(chunks: Uint8Array[]) {
  return new Request("https://vault2077.test/api/opc/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

test("bounded JSON body accepts a multi-chunk request within the byte limit", async () => {
  const encoder = new TextEncoder();
  const body = await readBoundedJsonBody(chunkedRequest([
    encoder.encode('{"name":"'),
    encoder.encode("测试"),
    encoder.encode('"}'),
  ]), 64);
  assert.deepEqual(body, { name: "测试" });
});

test("bounded JSON body rejects chunked input before buffering beyond the limit", async () => {
  const encoder = new TextEncoder();
  await assert.rejects(
    () => readBoundedJsonBody(chunkedRequest([
      encoder.encode('{"note":"'),
      encoder.encode("x".repeat(32)),
      encoder.encode('"}'),
    ]), 24),
    (error: unknown) => error instanceof RangeError && /超过大小限制/.test(error.message),
  );
});

test("bounded JSON body rejects malformed JSON", async () => {
  const encoder = new TextEncoder();
  await assert.rejects(
    () => readBoundedJsonBody(chunkedRequest([encoder.encode("{not-json")]), 64),
    (error: unknown) => error instanceof SyntaxError && /不是有效 JSON/.test(error.message),
  );
});
