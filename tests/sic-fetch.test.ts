import assert from "node:assert/strict";
import test from "node:test";
import { fetchTextBounded } from "../lib/sic-fetch.ts";

test("bounded fetch retries one transient upstream response", async () => {
  let calls = 0;
  const result = await fetchTextBounded("https://example.test/feed", {}, {
    attempts: 2,
    retryDelayMs: 0,
    fetcher: async () => {
      calls += 1;
      return calls === 1
        ? new Response("temporary", { status: 503 })
        : new Response("healthy", { status: 200 });
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.text, "healthy");
});

test("bounded fetch does not retry a permanent client error", async () => {
  let calls = 0;
  await assert.rejects(
    fetchTextBounded("https://example.test/missing", {}, {
      attempts: 2,
      retryDelayMs: 0,
      fetcher: async () => {
        calls += 1;
        return new Response("missing", { status: 404 });
      },
    }),
    /HTTP 404/,
  );
  assert.equal(calls, 1);
});

test("bounded fetch may retry a source-specific transient status", async () => {
  let calls = 0;
  const result = await fetchTextBounded("https://www.youtube.com/feeds/videos.xml", {}, {
    attempts: 2,
    retryDelayMs: 0,
    retryStatuses: [404],
    fetcher: async () => {
      calls += 1;
      return calls === 1
        ? new Response("temporarily missing", { status: 404 })
        : new Response("healthy", { status: 200 });
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.text, "healthy");
});
