import assert from "node:assert/strict";
import test from "node:test";
import {
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
    { batch: batch("batch:failed"), payloadHash: "a".repeat(64), rawPayload: "{}", attempt: 1 },
    { batch: batch("batch:succeeded"), payloadHash: "b".repeat(64), rawPayload: "{}", attempt: 1 },
  ];
  const completed: string[] = [];
  const failed: string[] = [];
  const inbox: AcquisitionWorkerInbox = {
    async claimNext() {
      return queue.shift() ?? null;
    },
    async complete(batchId) {
      completed.push(batchId);
    },
    async fail(batchId) {
      failed.push(batchId);
    },
    async stats() {
      return { pending: 0, processing: 0, succeeded: completed.length, failed: failed.length };
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
  assert.deepEqual(failed, ["batch:failed"]);
  assert.equal(result.processed[0].result.information, 3);
  assert.equal(result.failed[0].error, "model unavailable");
  assert.deepEqual(result.queue, { pending: 0, processing: 0, succeeded: 1, failed: 1 });
});

test("worker does not retry the same failed batch again during one run", async () => {
  const failedWork = {
    batch: batch("batch:failed-once"),
    payloadHash: "c".repeat(64),
    rawPayload: "{}",
    attempt: 1,
  };
  let attempts = 0;
  const inbox: AcquisitionWorkerInbox = {
    async claimNext(excluded = new Set()) {
      return excluded.has(failedWork.batch.batchId) ? null : failedWork;
    },
    async complete() {},
    async fail() {},
    async stats() {
      return { pending: 0, processing: 0, succeeded: 0, failed: 1 };
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
