import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { payloadHash } from "../lib/acquisition-contract.ts";
import { createAcquisitionBatchProcessor } from "../lib/acquisition-processor.ts";
import { sicContentIdentityKey, sicContentProjectionDigest } from "../lib/sic-content-identity.ts";
import { retiredSicContentIdentityKeys } from "../lib/sic-content-store.ts";
import { requiresFullSicPublicationReconciliation } from "../lib/sic-publication-store.ts";
import {
  planSicPublicationRecovery,
  type SicRecoveryInboxRow,
} from "../lib/sic-recovery.ts";

function row(input: {
  batchId: string;
  runId: string;
  runMode: "bootstrap" | "incremental";
  collectedAt: string;
  status: "succeeded" | "partial" | "empty" | "failed";
  ids: string[];
}): SicRecoveryInboxRow {
  const rawPayload = JSON.stringify({
    schemaVersion: 1,
    batchId: input.batchId,
    runId: input.runId,
    lane: "sic",
    runMode: input.runMode,
    scheduleId: "schedule:test:sic",
    windowFrom: input.collectedAt,
    windowUntil: input.collectedAt,
    registryRevision: "sources:test",
    collectedFrom: input.collectedAt,
    collectedUntil: input.collectedAt,
    collectedAt: input.collectedAt,
    records: input.ids.map((id) => ({
      schemaVersion: 1,
      kind: "publication",
      recordId: `record:${id}`,
      sourceId: "course-source",
      externalId: id,
      canonicalUrl: `https://example.com/courses/${id}`,
      observedAt: input.collectedAt,
      contentHash: createHash("sha256").update(id).digest("hex"),
      payload: {
        group: "courses",
        canonicalId: id,
        sourceName: "Course source",
        publisher: "Publisher",
        title: id,
        summary: id,
        sourceMaterial: id,
      },
    })),
    sourceReports: [{
      sourceId: "course-source",
      adapter: "official_api",
      status: input.status,
      startedAt: input.collectedAt,
      completedAt: input.collectedAt,
      recordCount: input.ids.length,
    }],
  });
  return {
    batchId: input.batchId,
    payloadHash: payloadHash(rawPayload),
    rawPayload,
    status: "processed",
  };
}

test("SiC recovery keeps a bootstrap publication through a later empty incremental", () => {
  const plan = planSicPublicationRecovery([
    row({
      batchId: "batch:bootstrap",
      runId: "run:bootstrap",
      runMode: "bootstrap",
      collectedAt: "2026-08-01T00:00:00.000Z",
      status: "succeeded",
      ids: ["course-a"],
    }),
    row({
      batchId: "batch:empty",
      runId: "run:empty",
      runMode: "incremental",
      collectedAt: "2026-08-02T00:00:00.000Z",
      status: "empty",
      ids: [],
    }),
  ]);
  assert.equal(plan.projectedRawCounts.courses, 1);
  assert.equal(plan.projectedSourceCount, 1);
});

test("SiC recovery unions a partial incremental with the previous successful source", () => {
  const plan = planSicPublicationRecovery([
    row({
      batchId: "batch:bootstrap",
      runId: "run:bootstrap",
      runMode: "bootstrap",
      collectedAt: "2026-08-01T00:00:00.000Z",
      status: "succeeded",
      ids: ["course-a"],
    }),
    row({
      batchId: "batch:partial",
      runId: "run:partial",
      runMode: "incremental",
      collectedAt: "2026-08-02T00:00:00.000Z",
      status: "partial",
      ids: ["course-b"],
    }),
  ]);
  assert.equal(plan.projectedRawCounts.courses, 2);
});

test("SiC recovery starts from the latest processed bootstrap and verifies inbox integrity", () => {
  const old = row({
    batchId: "batch:old",
    runId: "run:old",
    runMode: "bootstrap",
    collectedAt: "2026-07-01T00:00:00.000Z",
    status: "succeeded",
    ids: ["old"],
  });
  const current = row({
    batchId: "batch:current",
    runId: "run:current",
    runMode: "bootstrap",
    collectedAt: "2026-08-01T00:00:00.000Z",
    status: "succeeded",
    ids: ["current"],
  });
  assert.equal(planSicPublicationRecovery([old, current]).baselineRunId, "run:current");
  assert.throws(
    () => planSicPublicationRecovery([{ ...current, payloadHash: "0".repeat(64) }]),
    /正文摘要不匹配/,
  );
});

test("SiC recovery includes every shard from the latest bootstrap run", () => {
  const firstShard = row({
    batchId: "batch:current:1",
    runId: "run:current",
    runMode: "bootstrap",
    collectedAt: "2026-08-01T00:00:00.000Z",
    status: "succeeded",
    ids: ["course-a"],
  });
  const secondShard = row({
    batchId: "batch:current:2",
    runId: "run:current",
    runMode: "bootstrap",
    collectedAt: "2026-08-01T00:01:00.000Z",
    status: "succeeded",
    ids: ["course-b"],
  });
  const plan = planSicPublicationRecovery([firstShard, secondShard]);
  assert.equal(plan.batches.length, 1);
  assert.equal(plan.batches[0]?.batch.sourceReports[0]?.recordCount, 2);
  assert.equal(plan.projectedRawCounts.courses, 2);
});

test("SiC recovery replays a coalesced historical run through the real processor contract", async () => {
  const plan = planSicPublicationRecovery([
    row({
      batchId: "batch:current:1",
      runId: "run:current",
      runMode: "bootstrap",
      collectedAt: "2026-08-01T00:00:00.000Z",
      status: "succeeded",
      ids: ["course-a"],
    }),
    row({
      batchId: "batch:current:2",
      runId: "run:current",
      runMode: "bootstrap",
      collectedAt: "2026-08-01T00:00:00.000Z",
      status: "succeeded",
      ids: ["course-b"],
    }),
  ]);
  let packet: unknown;
  const processor = createAcquisitionBatchProcessor({
    processPublications: async (value) => {
      packet = value;
      return {};
    },
  });
  await processor(plan.batches[0]!.batch, { payloadHash: plan.batches[0]!.payloadHash, attempt: 1 });
  const replayed = packet as {
    items: Array<{ id: string }>;
    reports: Array<{ status: string; itemCount: number }>;
  };
  assert.equal(replayed.items.length, 2);
  assert.deepEqual(replayed.reports, [{
    sourceId: "course-source",
    status: "success",
    collectedAt: "2026-08-01T00:00:00.000Z",
    itemCount: 2,
    error: undefined,
  }]);
});

test("SiC recovery treats mixed historical shards from one source run as partial", () => {
  const baseline = row({
    batchId: "batch:baseline",
    runId: "run:baseline",
    runMode: "bootstrap",
    collectedAt: "2026-08-01T00:00:00.000Z",
    status: "succeeded",
    ids: ["course-old"],
  });
  const succeededShard = row({
    batchId: "batch:mixed:1",
    runId: "run:mixed",
    runMode: "incremental",
    collectedAt: "2026-08-02T00:00:00.000Z",
    status: "succeeded",
    ids: ["course-new"],
  });
  const failedShard = row({
    batchId: "batch:mixed:2",
    runId: "run:mixed",
    runMode: "incremental",
    collectedAt: "2026-08-02T00:01:00.000Z",
    status: "failed",
    ids: [],
  });
  const plan = planSicPublicationRecovery([baseline, succeededShard, failedShard]);
  assert.equal(plan.projectedRawCounts.courses, 2);
  assert.deepEqual(
    plan.batches.slice(1).map(({ batch }) => batch.sourceReports[0]?.status),
    ["partial"],
  );
  assert.deepEqual(
    plan.batches.slice(1).map(({ batch }) => batch.sourceReports[0]?.recordCount),
    [1],
  );
});

test("SiC recovery keeps an empty and failed historical shard run failed", () => {
  const baseline = row({
    batchId: "batch:baseline",
    runId: "run:baseline",
    runMode: "bootstrap",
    collectedAt: "2026-08-01T00:00:00.000Z",
    status: "succeeded",
    ids: ["course-old"],
  });
  const emptyShard = row({
    batchId: "batch:no-result:1",
    runId: "run:no-result",
    runMode: "incremental",
    collectedAt: "2026-08-02T00:00:00.000Z",
    status: "empty",
    ids: [],
  });
  const failedShard = row({
    batchId: "batch:no-result:2",
    runId: "run:no-result",
    runMode: "incremental",
    collectedAt: "2026-08-02T00:01:00.000Z",
    status: "failed",
    ids: [],
  });
  const plan = planSicPublicationRecovery([baseline, emptyShard, failedShard]);
  assert.equal(plan.projectedRawCounts.courses, 1);
  assert.deepEqual(
    plan.batches.slice(1).map(({ batch }) => batch.sourceReports[0]?.status),
    ["failed"],
  );
  assert.deepEqual(
    plan.batches.slice(1).map(({ batch }) => batch.sourceReports[0]?.recordCount),
    [0],
  );
});

test("SiC projection digest matches PostgreSQL JSON serialization of optional fields", () => {
  const base = {
    id: "course",
    sourceId: "course-source",
    group: "courses" as const,
    sourceName: "Course source",
    publisher: "Publisher",
    title: "Course",
    summary: "Summary",
    url: "https://example.com/course",
    publishedAt: null,
    collectedAt: "2026-08-15T00:00:00.000Z",
  };
  assert.equal(
    sicContentProjectionDigest([{ ...base, translatedTitle: undefined }]),
    sicContentProjectionDigest([base]),
  );
});

test("SiC normalized storage fully reconciles on first migration and old-release drift", () => {
  assert.equal(requiresFullSicPublicationReconciliation({
    existingProjectionDigest: null,
    existingActiveProjectionDigest: sicContentProjectionDigest([]),
    previousProjectionDigest: "legacy",
  }), true);
  assert.equal(requiresFullSicPublicationReconciliation({
    existingProjectionDigest: "normalized-before-rollback",
    existingActiveProjectionDigest: "normalized-before-rollback",
    previousProjectionDigest: "legacy-after-rollback",
  }), true);
  assert.equal(requiresFullSicPublicationReconciliation({
    existingProjectionDigest: "aligned",
    existingActiveProjectionDigest: "aligned",
    previousProjectionDigest: "aligned",
  }), false);
  assert.equal(requiresFullSicPublicationReconciliation({
    existingProjectionDigest: "aligned",
    existingActiveProjectionDigest: "normalized-row-drift",
    previousProjectionDigest: "aligned",
  }), true);
});

test("SiC incremental synchronization retires identities evicted by the publication cap", () => {
  const item = (id: string) => ({
    id,
    sourceId: "course-source",
    group: "courses" as const,
    sourceName: "Course source",
    publisher: "Publisher",
    title: id,
    summary: id,
    url: `https://example.com/courses/${id}`,
    publishedAt: null,
    collectedAt: "2026-08-15T00:00:00.000Z",
  });
  assert.deepEqual(
    retiredSicContentIdentityKeys([item("old"), item("kept")], [item("kept"), item("new")]),
    [sicContentIdentityKey(item("old"))],
  );
});
