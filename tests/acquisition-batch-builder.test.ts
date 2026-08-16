import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSicAcquisitionBatches,
  buildVaultAcquisitionBatches,
  packAcquisitionGroups,
  type AcquisitionBuildContext,
} from "../lib/acquisition-batch-builder.ts";
import type { SicRawCollection } from "../lib/sic-collector.ts";
import type { InboundContentBatch } from "../lib/content-contract.ts";
import { SOURCE_ROLES } from "../lib/types.ts";

const context: AcquisitionBuildContext = {
  runId: "run:full-source-test",
  lane: "information",
  runMode: "incremental",
  scheduleId: "schedule:test:information",
  windowFrom: "2026-07-24T00:00:00.000Z",
  windowUntil: "2026-07-24T01:00:00.000Z",
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
  assert.equal(batches[0].schemaVersion, 2);
  assert.deepEqual(
    batches[0].sourceRegistry?.sources.map((source) => source.sourceId),
    ["source-one", "source-three", "source-two"],
  );
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

test("SiC acquisition packets preserve the Hugging Face weekly ranking fields", () => {
  const collection: SicRawCollection = {
    version: 1,
    collectedAt: context.collectedAt,
    items: [{
      id: "paper-1",
      sourceId: "hugging-face-daily-papers",
      group: "papers",
      sourceName: "Hugging Face Weekly Papers",
      publisher: "Hugging Face",
      title: "Ranked paper",
      summary: "Paper abstract.",
      sourceMaterial: "Paper abstract.",
      url: "https://arxiv.org/abs/2607.00001",
      publishedAt: "2026-07-30T00:00:00.000Z",
      collectedAt: context.collectedAt,
      canonicalId: "arxiv:2607.00001",
      discoveryUrl: "https://huggingface.co/papers/2607.00001",
      rankingWeek: "2026-W31",
      weeklyRank: 1,
      weeklyUpvotes: 40,
      provenanceStatus: "verified",
    }],
    reports: [{
      sourceId: "hugging-face-daily-papers",
      status: "success",
      collectedAt: context.collectedAt,
      itemCount: 1,
    }],
  };
  const batches = buildSicAcquisitionBatches({
    context: { ...context, lane: "sic", scheduleId: "schedule:test:sic" },
    collection,
    adapterBySource: new Map([["hugging-face-daily-papers", "official-api"]]),
  });
  assert.equal(batches[0].records[0].payload.rankingWeek, "2026-W31");
  assert.equal(batches[0].records[0].payload.weeklyRank, 1);
  assert.equal(batches[0].records[0].payload.weeklyUpvotes, 40);
});

test("SiC refuses to split one authoritative source snapshot across batches", () => {
  const collectedAt = context.collectedAt;
  const items = ["one", "two"].map((id) => ({
    id,
    sourceId: "course-source",
    group: "courses" as const,
    sourceName: "Course source",
    publisher: "Publisher",
    title: id,
    summary: id,
    sourceMaterial: id,
    url: `https://example.com/${id}`,
    publishedAt: null,
    collectedAt,
  }));
  assert.throws(() => buildSicAcquisitionBatches({
    context: { ...context, lane: "sic", scheduleId: "schedule:test:sic" },
    collection: {
      version: 1,
      collectedAt,
      items,
      reports: [{ sourceId: "course-source", status: "success", collectedAt, itemCount: 2 }],
    },
    adapterBySource: new Map([["course-source", "official-api"]]),
    maxRecords: 1,
  }), /拒绝拆分权威来源快照/);
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

test("roadside lane keeps a personal post canonical without promoting its external citation", () => {
  const topic = packet();
  topic.information[0] = {
    ...topic.information[0],
    sourceChannelId: "personal-source",
    discoveryPath: "https://person.example.com/posts/42",
    discoveryPaths: ["https://person.example.com/posts/42"],
    originalPublisher: "Example Person",
    originalUrl: "https://person.example.com/posts/42",
    externalUrl: "https://company.example.com/news/original",
    contentGroup: "roadside",
    itemKind: "personal_post",
    provenanceRole: "canonical",
    provenanceStatus: "verified",
    sourceStream: "roadside",
  };
  const batches = buildVaultAcquisitionBatches({
    context: {
      ...context,
      lane: "roadside",
      scheduleId: "schedule:test:roadside",
    },
    packets: [topic],
    outcomes: [{ sourceId: "personal-source", status: "success" }],
    connectorBySource: new Map([["personal-source", "rss"]]),
    sourceStreamBySource: new Map([["personal-source", "roadside"]]),
    lane: "roadside",
  });
  assert.equal(batches.flatMap((batch) => batch.records).length, 1);
  assert.equal(batches[0].records[0].payload.contentGroup, "roadside");
  assert.equal(batches[0].records[0].payload.externalUrl, "https://company.example.com/news/original");
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

test("packer quarantines one sensitive public record while delivering safe siblings", () => {
  const records = [
    {
      schemaVersion: 1 as const,
      kind: "information" as const,
      recordId: "information:safe",
      sourceId: "source-sensitive",
      externalId: "safe",
      canonicalUrl: "https://example.com/safe",
      observedAt: context.collectedAt,
      contentHash: "d".repeat(64),
      payload: { originalContent: "Ordinary public documentation." },
    },
    {
      schemaVersion: 1 as const,
      kind: "information" as const,
      recordId: "information:unsafe",
      sourceId: "source-sensitive",
      externalId: "unsafe",
      canonicalUrl: "https://example.com/unsafe",
      observedAt: context.collectedAt,
      contentHash: "e".repeat(64),
      payload: { originalContent: "postgresql://reader:password@example.com/database" },
    },
  ];
  const [batch] = packAcquisitionGroups(context, [{
    report: {
      sourceId: "source-sensitive",
      adapter: "rss",
      status: "succeeded",
      startedAt: context.collectedFrom,
      completedAt: context.collectedUntil,
      recordCount: records.length,
    },
    records,
  }], "acquisition:sensitive");

  assert.deepEqual(batch.records.map((record) => record.recordId), ["information:safe"]);
  assert.equal(batch.sourceReports[0].status, "partial");
  assert.equal(batch.sourceReports[0].recordCount, 1);
  assert.equal(batch.sourceReports[0].errorCode, "SENSITIVE_RECORDS_QUARANTINED");
  assert.match(batch.sourceReports[0].errorMessage ?? "", /1 条记录/);
  assert.doesNotMatch(JSON.stringify(batch), /reader:password/);
});
