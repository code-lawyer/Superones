import assert from "node:assert/strict";
import test from "node:test";
import {
  AcquisitionQuarantineError,
  createAcquisitionWorker,
  type AcquisitionWorkerInbox,
} from "../lib/acquisition-worker.ts";
import type { AcquisitionBatch } from "../lib/acquisition-contract.ts";
import type { AcquisitionWorkItem } from "../lib/acquisition-inbox.ts";

function batch(id: string): AcquisitionBatch {
  return {
    schemaVersion: 1,
    batchId: id,
    runId: `run:${id}`,
    lane: "information",
    runMode: "incremental",
    scheduleId: "schedule:test:information",
    windowFrom: "2026-07-24T00:00:00.000Z",
    windowUntil: "2026-07-24T01:00:00.000Z",
    registryRevision: "sources:test",
    collectedFrom: "2026-07-24T00:00:00.000Z",
    collectedUntil: "2026-07-24T01:00:00.000Z",
    collectedAt: "2026-07-24T01:00:00.000Z",
    records: [],
    sourceReports: [],
  };
}

test("worker continues after one batch fails and reports queue health", async () => {
  const queue: AcquisitionWorkItem[] = [
    { batch: batch("batch:failed"), payloadHash: "a".repeat(64), rawPayload: "{}", attempt: 1, claimToken: "claim-failed" },
    { batch: batch("batch:succeeded"), payloadHash: "b".repeat(64), rawPayload: "{}", attempt: 1, claimToken: "claim-succeeded" },
  ];
  const completed: string[] = [];
  const failed: Array<{ batchId: string; disposition?: string }> = [];
  const inbox: AcquisitionWorkerInbox = {
    async claimNext() {
      return queue.shift() ?? null;
    },
    async complete(batchId) {
      completed.push(batchId);
    },
    async fail(batchId, _claimToken, _error, disposition) {
      failed.push({ batchId, disposition });
      return disposition === "quarantined" ? "quarantined" : "retryable";
    },
    async stats() {
      return {
        received: 0,
        processing: 0,
        processed: completed.length,
        retryable: failed.filter((item) => item.disposition !== "quarantined").length,
        quarantined: failed.filter((item) => item.disposition === "quarantined").length,
      };
    },
  };
  const worker = createAcquisitionWorker({
    inbox,
    async processBatch(value) {
      if (value.batchId === "batch:failed") throw new Error("model unavailable");
      return { information: 3 };
    },
  });

  const result = await worker.run(10);
  assert.deepEqual(completed, ["batch:succeeded"]);
  assert.deepEqual(failed, [{ batchId: "batch:failed", disposition: "retryable" }]);
  assert.equal(result.processed[0].result.information, 3);
  assert.equal(result.failed[0].error, "model unavailable");
  assert.deepEqual(result.queue, {
    received: 0,
    processing: 0,
    processed: 1,
    retryable: 1,
    quarantined: 0,
  });
});

test("worker does not retry the same failed batch again during one run", async () => {
  const failedWork = {
    batch: batch("batch:failed-once"),
    payloadHash: "c".repeat(64),
    rawPayload: "{}",
    attempt: 1,
    claimToken: "claim-failed-once",
  };
  let attempts = 0;
  const inbox: AcquisitionWorkerInbox = {
    async claimNext(excluded = new Set()) {
      return excluded.has(failedWork.batch.batchId) ? null : failedWork;
    },
    async complete() {},
    async fail() {
      return "retryable";
    },
    async stats() {
      return { received: 0, processing: 0, processed: 0, retryable: 1, quarantined: 0 };
    },
  };
  const worker = createAcquisitionWorker({
    inbox,
    async processBatch() {
      attempts += 1;
      throw new Error("still unavailable");
    },
  });

  const result = await worker.run(50);
  assert.equal(attempts, 1);
  assert.equal(result.failed.length, 1);
});

test("worker quarantines deterministic processing failures without retrying", async () => {
  const work = {
    batch: batch("batch:invalid-record"),
    payloadHash: "d".repeat(64),
    rawPayload: "{}",
    attempt: 1,
    claimToken: "claim-invalid",
  };
  const dispositions: string[] = [];
  const inbox: AcquisitionWorkerInbox = {
    async claimNext(excluded = new Set()) {
      return excluded.has(work.batch.batchId) ? null : work;
    },
    async complete() {},
    async fail(_batchId, _claimToken, _error, disposition) {
      dispositions.push(disposition ?? "retryable");
      return disposition === "quarantined" ? "quarantined" : "retryable";
    },
    async stats() {
      return { received: 0, processing: 0, processed: 0, retryable: 0, quarantined: 1 };
    },
  };
  const worker = createAcquisitionWorker({
    inbox,
    async processBatch() {
      throw new AcquisitionQuarantineError("unsupported record");
    },
  });
  const result = await worker.run();
  assert.deepEqual(dispositions, ["quarantined"]);
  assert.equal(result.failed[0].status, "quarantined");
});
