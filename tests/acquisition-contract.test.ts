import assert from "node:assert/strict";
import test from "node:test";
import {
  AcquisitionContractError,
  signingInput,
  validateAcquisitionBatch,
} from "../lib/acquisition-contract.ts";

function batch() {
  return {
    schemaVersion: 1,
    batchId: "batch:2026-07-24T000000Z:demo",
    runId: "run:2026-07-24T000000Z:demo",
    registryRevision: "sources:2026-07-24",
    collectedFrom: "2026-07-24T00:00:00.000Z",
    collectedUntil: "2026-07-24T01:00:00.000Z",
    collectedAt: "2026-07-24T01:01:00.000Z",
    records: [{
      schemaVersion: 1,
      kind: "publication",
      recordId: "paper:arxiv:2607.00001:v1",
      sourceId: "arxiv:cs-ai",
      externalId: "2607.00001v1",
      canonicalUrl: "https://arxiv.org/abs/2607.00001",
      observedAt: "2026-07-24T00:30:00.000Z",
      contentHash: "a".repeat(64),
      payload: {
        title: "A useful paper",
        authors: ["Example Author"],
        citations: 0,
      },
    }],
    sourceReports: [{
      sourceId: "arxiv:cs-ai",
      adapter: "arxiv",
      status: "succeeded",
      startedAt: "2026-07-24T00:00:02.000Z",
      completedAt: "2026-07-24T00:00:04.000Z",
      recordCount: 1,
    }],
  };
}

test("validates and normalizes a unified acquisition batch", () => {
  const result = validateAcquisitionBatch(batch());
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.records[0].kind, "publication");
  assert.equal(result.sourceReports[0].recordCount, 1);
  assert.equal(result.collectedAt, "2026-07-24T01:01:00.000Z");
});

test("requires every record source to have an exact source report count", () => {
  const value = batch();
  value.sourceReports[0].recordCount = 0;
  assert.throws(
    () => validateAcquisitionBatch(value),
    (error) => error instanceof AcquisitionContractError && error.code === "SOURCE_COUNT_MISMATCH",
  );
});

test("rejects duplicate record identities within a batch", () => {
  const value = batch();
  value.records.push(structuredClone(value.records[0]));
  value.sourceReports[0].recordCount = 2;
  assert.throws(() => validateAcquisitionBatch(value), /重复记录/);
});

test("rejects unsupported record kinds", () => {
  const value = batch();
  value.records[0].kind = "translated_summary";
  assert.throws(() => validateAcquisitionBatch(value), /kind/);
});

test("shared signature input remains stable for legacy and unified receivers", () => {
  assert.equal(signingInput("123", "batch-1", "deadbeef"), "123.batch-1.deadbeef");
});
