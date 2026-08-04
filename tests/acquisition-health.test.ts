import assert from "node:assert/strict";
import test from "node:test";
import { acquisitionInboxHealth, acquisitionLaneFreshness } from "../lib/acquisition-health.ts";

test("information remains healthy during its intentional overnight pause", () => {
  const result = acquisitionLaneFreshness({
    lane: "information",
    lastSuccessfulAt: "2026-08-03T14:10:00.000Z",
    now: new Date("2026-08-03T22:00:00.000Z"),
  });

  assert.equal(result.status, "ok");
  assert.equal(result.expectedAt, "2026-08-03T14:05:00.000Z");
});

test("information degrades after the first morning deadline is missed", () => {
  const result = acquisitionLaneFreshness({
    lane: "information",
    lastSuccessfulAt: "2026-08-03T14:10:00.000Z",
    now: new Date("2026-08-04T02:00:00.000Z"),
  });

  assert.equal(result.status, "degraded");
  assert.equal(result.expectedAt, "2026-08-04T00:05:00.000Z");
});

test("each acquisition lane uses its own Beijing publication deadline", () => {
  const now = new Date("2026-08-04T04:30:00.000Z");
  const cases = [
    { lane: "roadside" as const, lastSuccessfulAt: "2026-08-04T02:56:00.000Z", expectedAt: "2026-08-04T02:55:00.000Z" },
    { lane: "sic" as const, lastSuccessfulAt: "2026-08-04T00:26:00.000Z", expectedAt: "2026-08-04T00:25:00.000Z" },
    { lane: "rankings" as const, lastSuccessfulAt: "2026-08-04T00:36:00.000Z", expectedAt: "2026-08-04T00:35:00.000Z" },
  ];

  for (const value of cases) {
    const result = acquisitionLaneFreshness({ ...value, now });
    assert.equal(result.status, "ok", value.lane);
    assert.equal(result.expectedAt, value.expectedAt, value.lane);
  }
});

test("a newly quarantined acquisition batch degrades business health with its identity", () => {
  const result = acquisitionInboxHealth({
    counts: { received: 0, processing: 0, processed: 20, retryable: 0, quarantined: 1 },
    oldestReceivedAt: null,
    oldestProcessingAt: null,
    oldestRetryableAt: null,
    latestQuarantine: {
      batchId: "batch:information:failed",
      lane: "information",
      at: "2026-08-04T04:20:00.000Z",
    },
  }, new Date("2026-08-04T04:30:00.000Z"));

  assert.equal(result.status, "degraded");
  assert.match(result.detail, /quarantined=1/);
  assert.match(result.detail, /batch:information:failed/);
});

test("retained historical quarantine evidence does not permanently degrade health", () => {
  const result = acquisitionInboxHealth({
    counts: { received: 0, processing: 0, processed: 20, retryable: 0, quarantined: 1 },
    oldestReceivedAt: null,
    oldestProcessingAt: null,
    oldestRetryableAt: null,
    latestQuarantine: {
      batchId: "batch:information:old-failure",
      lane: "information",
      at: "2026-08-03T04:20:00.000Z",
    },
  }, new Date("2026-08-04T04:30:00.000Z"));

  assert.equal(result.status, "ok");
  assert.match(result.detail, /batch:information:old-failure/);
});
