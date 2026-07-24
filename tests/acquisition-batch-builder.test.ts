import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVaultAcquisitionBatches,
  packAcquisitionGroups,
  type AcquisitionBuildContext,
} from "../lib/acquisition-batch-builder.ts";
import type { InboundContentBatch } from "../lib/content-contract.ts";
import { SOURCE_ROLES } from "../lib/types.ts";

const context: AcquisitionBuildContext = {
  runId: "run:full-source-test",
  registryRevision: "source-bundle:test",
  collectedFrom: "2026-07-24T00:00:00.000Z",
  collectedUntil: "2026-07-24T01:00:00.000Z",
  collectedAt: "2026-07-24T01:01:00.000Z",
};

function packet(): InboundContentBatch {
  return {
    version: 2,
    batchId: "legacy:packet:1",
    sourceBundleRevision: context.registryRevision,
    collectedFrom: context.collectedFrom,
    collectedUntil: context.collectedUntil,
    generatedAt: context.collectedAt,
    information: [{
      idempotencyKey: "source-one:item-one",
      sourceChannelId: "source-one",
      discoveryPath: "approved-feed:source-one",
      originalPublisher: "Source One",
      sourceRole: SOURCE_ROLES[0],
      originalUrl: "https://example.com/item-one",
      fetchedAt: context.collectedAt,
      originalLanguage: "en",
      originalTitle: "Item one",
      originalContent: "Original content.",
      contentCompleteness: "fulltext",
      contentHash: "a".repeat(64),
    }],
    repositories: [],
  };
}

test("Vault adapter preserves success, empty, and failed source reports", () => {
  const batches = buildVaultAcquisitionBatches({
    context,
    packets: [packet()],
    outcomes: [
      { sourceId: "source-one", status: "success" },
      { sourceId: "source-two", status: "empty" },
      { sourceId: "source-three", status: "failure", error: "upstream unavailable" },
    ],
    connectorBySource: new Map([
      ["source-one", "rss"],
      ["source-two", "rss"],
      ["source-three", "github-releases"],
    ]),
  });
  assert.equal(batches.length, 1);
  assert.equal(batches[0].records.length, 1);
  assert.deepEqual(
    Object.fromEntries(batches[0].sourceReports.map((report) => [report.sourceId, report.status])),
    {
      "source-one": "succeeded",
      "source-three": "failed",
      "source-two": "empty",
    },
  );
});

test("Vault adapter removes exact duplicates repeated across legacy packets", () => {
  const duplicate = structuredClone(packet());
  duplicate.batchId = "legacy:packet:2";
  const batches = buildVaultAcquisitionBatches({
    context,
    packets: [packet(), duplicate],
    outcomes: [{ sourceId: "source-one", status: "success" }],
    connectorBySource: new Map([["source-one", "rss"]]),
  });
  assert.equal(batches.reduce((sum, batch) => sum + batch.records.length, 0), 1);
  assert.equal(batches[0].sourceReports[0].recordCount, 1);
});

test("packer splits source groups before the record limit", () => {
  const groups = Array.from({ length: 6 }, (_, sourceIndex) => ({
    report: {
      sourceId: `source-${sourceIndex}`,
      adapter: "test",
      status: "succeeded" as const,
      startedAt: context.collectedFrom,
      completedAt: context.collectedUntil,
      recordCount: 100,
    },
    records: Array.from({ length: 100 }, (_, recordIndex) => ({
      schemaVersion: 1,
      kind: "information" as const,
      recordId: `information:${sourceIndex}:${recordIndex}`,
      sourceId: `source-${sourceIndex}`,
      externalId: `${sourceIndex}:${recordIndex}`,
      canonicalUrl: `https://example.com/${sourceIndex}/${recordIndex}`,
      observedAt: context.collectedAt,
      contentHash: "b".repeat(64),
      payload: { value: recordIndex },
    })),
  }));
  const batches = packAcquisitionGroups(context, groups, "acquisition:test");
  assert.equal(batches.length, 2);
  assert.ok(batches.every((batch) => batch.records.length <= 500));
  assert.equal(batches.reduce((sum, batch) => sum + batch.records.length, 0), 600);
  assert.equal(batches.reduce((sum, batch) => sum + batch.sourceReports.length, 0), 6);
});

test("packer honors a narrower downstream record limit", () => {
  const groups = Array.from({ length: 5 }, (_, sourceIndex) => ({
    report: {
      sourceId: `narrow-${sourceIndex}`,
      adapter: "test",
      status: "succeeded" as const,
      startedAt: context.collectedFrom,
      completedAt: context.collectedUntil,
      recordCount: 60,
    },
    records: Array.from({ length: 60 }, (_, recordIndex) => ({
      schemaVersion: 1,
      kind: "information" as const,
      recordId: `narrow:${sourceIndex}:${recordIndex}`,
      sourceId: `narrow-${sourceIndex}`,
      externalId: `${sourceIndex}:${recordIndex}`,
      canonicalUrl: `https://example.com/narrow/${sourceIndex}/${recordIndex}`,
      observedAt: context.collectedAt,
      contentHash: "c".repeat(64),
      payload: { value: recordIndex },
    })),
  }));

  const batches = packAcquisitionGroups(context, groups, "acquisition:narrow", { maxRecords: 200 });
  assert.deepEqual(batches.map((batch) => batch.records.length), [180, 120]);
});
