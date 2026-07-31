import assert from "node:assert/strict";
import test from "node:test";
import {
  createAcquisitionBatchProcessor,
} from "../lib/acquisition-processor.ts";
import type { AcquisitionBatch } from "../lib/acquisition-contract.ts";
import { SOURCE_ROLES } from "../lib/types.ts";

function mixedBatch(): AcquisitionBatch {
  return {
    schemaVersion: 1,
    batchId: "batch:mixed:processor",
    runId: "run:mixed:processor",
    lane: "information",
    runMode: "incremental",
    scheduleId: "schedule:test:information",
    windowFrom: "2026-07-24T00:00:00.000Z",
    windowUntil: "2026-07-24T01:00:00.000Z",
    registryRevision: "sources:test",
    collectedFrom: "2026-07-24T00:00:00.000Z",
    collectedUntil: "2026-07-24T01:00:00.000Z",
    collectedAt: "2026-07-24T01:00:00.000Z",
    records: [
      {
        schemaVersion: 1,
        kind: "information",
        recordId: "information:test:1",
        sourceId: "vault-source",
        externalId: "story-1",
        canonicalUrl: "https://example.com/story",
        observedAt: "2026-07-24T00:30:00.000Z",
        contentHash: "a".repeat(64),
        payload: {
          discoveryPath: "approved-feed:vault-source",
          originalPublisher: "Example Publisher",
          sourceRole: SOURCE_ROLES[0],
          originalLanguage: "en",
          originalTitle: "A material event",
          originalContent: "Original source material.",
          contentCompleteness: "fulltext",
        },
      },
      {
        schemaVersion: 1,
        kind: "publication",
        recordId: "publication:test:1",
        sourceId: "sic-source",
        externalId: "publication-1",
        canonicalUrl: "https://example.org/paper",
        observedAt: "2026-07-24T00:40:00.000Z",
        contentHash: "b".repeat(64),
        payload: {
          group: "papers",
          sourceName: "Paper Source",
          publisher: "Paper Publisher",
          title: "A useful paper",
          summary: "Source summary.",
          sourceMaterial: "Full source material collected overseas.",
          publishedAt: "2026-07-23T10:00:00.000Z",
          canonicalId: "arxiv:2607.00001",
          discoveryUrl: "https://huggingface.co/papers/2607.00001",
          provenanceStatus: "verified",
        },
      },
    ],
    sourceReports: [
      {
        sourceId: "vault-source",
        adapter: "rss",
        status: "succeeded",
        startedAt: "2026-07-24T00:00:00.000Z",
        completedAt: "2026-07-24T00:00:10.000Z",
        recordCount: 1,
      },
      {
        sourceId: "sic-source",
        adapter: "official-rss",
        status: "succeeded",
        startedAt: "2026-07-24T00:00:00.000Z",
        completedAt: "2026-07-24T00:00:10.000Z",
        recordCount: 1,
      },
    ],
  };
}

test("processor routes information and publications through domestic adapters", async () => {
  const calls: Array<{ kind: string; value: unknown; hash?: string }> = [];
  let requireNoQuarantine = false;
  const processor = createAcquisitionBatchProcessor({
    async processContent(value, hash, options) {
      requireNoQuarantine = options?.requireNoQuarantine === true;
      calls.push({ kind: "content", value, hash });
    },
    async processPublications(value, fetcher) {
      calls.push({ kind: "publications", value });
      await assert.rejects(fetcher("https://example.com"), /禁止回源/);
    },
  });
  const information = mixedBatch();
  information.records = [information.records[0]];
  information.sourceReports = [information.sourceReports[0]];
  const sic = mixedBatch();
  sic.batchId = "batch:sic:processor";
  sic.lane = "sic";
  sic.scheduleId = "schedule:test:sic";
  sic.records = [sic.records[1]];
  sic.sourceReports = [sic.sourceReports[1]];
  const informationResult = await processor(information, { payloadHash: "c".repeat(64), attempt: 1 });
  const sicResult = await processor(sic, { payloadHash: "f".repeat(64), attempt: 1 });
  assert.deepEqual(informationResult, {
    information: 1,
    publications: 0,
    profiles: 0,
    repositories: 0,
    rankings: 0,
  });
  assert.equal(sicResult.publications, 1);
  assert.equal(calls.length, 2);
  assert.equal(requireNoQuarantine, false);
  const content = calls[0].value as { information: Array<{ originalTitle: string }> };
  assert.equal(content.information[0].originalTitle, "A material event");
  const publications = calls[1].value as {
    items: Array<{
      sourceMaterial?: string;
      canonicalId?: string;
      discoveryUrl?: string;
      provenanceStatus?: string;
    }>;
  };
  assert.equal(publications.items[0].sourceMaterial, "Full source material collected overseas.");
  assert.equal(publications.items[0].canonicalId, "arxiv:2607.00001");
  assert.equal(publications.items[0].discoveryUrl, "https://huggingface.co/papers/2607.00001");
  assert.equal(publications.items[0].provenanceStatus, "verified");
});

test("one malformed information record downgrades its source without blocking valid records", async () => {
  const value = mixedBatch();
  const invalid = structuredClone(value.records[0]);
  invalid.recordId = "information:test:invalid";
  invalid.externalId = "story-invalid";
  invalid.canonicalUrl = "https://example.com/invalid";
  invalid.contentHash = "c".repeat(64);
  delete invalid.payload.originalTitle;
  value.records = [value.records[0], invalid];
  value.sourceReports = [{ ...value.sourceReports[0], recordCount: 2 }];
  let received = 0;
  let reportStatus = "";
  const processor = createAcquisitionBatchProcessor({
    async processContent(content, _hash, options) {
      received = (content as { information: unknown[] }).information.length;
      reportStatus = options?.snapshot?.sourceReports[0]?.status ?? "";
    },
  });
  const result = await processor(value, { payloadHash: "9".repeat(64), attempt: 1 });
  assert.equal(received, 1);
  assert.equal(reportStatus, "partial");
  assert.equal(result.information, 1);
});

test("one malformed SiC publication does not block the valid source snapshot", async () => {
  const value = mixedBatch();
  value.batchId = "batch:sic:partial";
  value.lane = "sic";
  value.scheduleId = "schedule:test:sic";
  const valid = value.records[1];
  const invalid = structuredClone(valid);
  invalid.recordId = "publication:test:invalid";
  invalid.externalId = "publication-invalid";
  invalid.canonicalUrl = "https://example.org/invalid";
  invalid.contentHash = "c".repeat(64);
  delete invalid.payload.title;
  value.records = [valid, invalid];
  value.sourceReports = [{ ...value.sourceReports[1], recordCount: 2 }];
  let itemCount = 0;
  let reportStatus = "";
  const processor = createAcquisitionBatchProcessor({
    async processPublications(content) {
      const packet = content as { items: unknown[]; reports: Array<{ status: string }> };
      itemCount = packet.items.length;
      reportStatus = packet.reports[0]?.status ?? "";
    },
  });
  const result = await processor(value, { payloadHash: "8".repeat(64), attempt: 1 });
  assert.equal(itemCount, 1);
  assert.equal(reportStatus, "partial");
  assert.equal(result.publications, 1);
});

test("processor persists every ranking provider without invoking the LLM", async () => {
  const providers: string[] = [];
  const value = mixedBatch();
  value.lane = "rankings";
  value.scheduleId = "schedule:test:rankings";
  const sourceUrl = "https://github.com/trending?since=daily";
  value.records = [{
    ...value.records[0],
    kind: "ranking_observation",
    recordId: "ranking:github:today",
    payload: {
      id: "github:today",
      provider: "github",
      providerView: "today",
      title: "GitHub 今日趋势",
      eyebrow: "GITHUB / OFFICIAL",
      providerMetric: "GitHub today",
      sourceUrl,
      items: [{
        id: "owner/repo",
        name: "owner/repo",
        provider: "github",
        providerView: "today",
        providerRank: 1,
        providerMetric: "Stars today",
        value: 10,
        capturedAt: "2026-07-24T00:30:00.000Z",
        sourceUrl,
        itemUrl: "https://github.com/owner/repo",
      }],
    },
  }];
  value.sourceReports = [{ ...value.sourceReports[0], sourceId: "github:today", recordCount: 1 }];
  const processor = createAcquisitionBatchProcessor({
    async persistDirectRankings(boards) {
      providers.push(...boards.map((board) => `${board.provider}:${board.providerView}`));
    },
  });
  const result = await processor(value, { payloadHash: "d".repeat(64), attempt: 1 });
  assert.deepEqual(providers, ["github:today"]);
  assert.equal(result.rankings, 1);
});

test("processor fails visibly when a record kind has no domestic adapter", async () => {
  const value = mixedBatch();
  value.lane = "sic";
  value.scheduleId = "schedule:test:sic";
  value.records = [{
    ...value.records[0],
    kind: "entity_profile",
    recordId: "profile:test:1",
  }];
  value.sourceReports = [{ ...value.sourceReports[0], recordCount: 1 }];
  const processor = createAcquisitionBatchProcessor();
  await assert.rejects(
    processor(value, { payloadHash: "d".repeat(64), attempt: 1 }),
    /尚未覆盖/,
  );
});

test("an unsupported SiC profile does not block a valid publication in the same batch", async () => {
  const value = mixedBatch();
  value.batchId = "batch:sic:profile-isolation";
  value.lane = "sic";
  value.scheduleId = "schedule:test:sic";
  const publication = value.records[1];
  value.records = [publication, {
    ...value.records[0],
    kind: "entity_profile",
    recordId: "profile:test:isolated",
    sourceId: "profile-source",
  }];
  value.sourceReports = [
    value.sourceReports[1],
    { ...value.sourceReports[0], sourceId: "profile-source", recordCount: 1 },
  ];
  let writes = 0;
  const processor = createAcquisitionBatchProcessor({
    async processPublications() {
      writes += 1;
    },
  });
  const result = await processor(value, { payloadHash: "7".repeat(64), attempt: 1 });
  assert.equal(writes, 1);
  assert.equal(result.publications, 1);
  assert.equal(result.profiles, 0);
});

test("processor rejects an unsupported mixed batch before any write", async () => {
  const value = mixedBatch();
  value.records.push({
    ...value.records[0],
    kind: "entity_profile",
    recordId: "profile:test:1",
  });
  let writes = 0;
  const processor = createAcquisitionBatchProcessor({
    async processContent() {
      writes += 1;
    },
    async processPublications() {
      writes += 1;
    },
  });

  await assert.rejects(
    processor(value, { payloadHash: "e".repeat(64), attempt: 1 }),
    /不得携带/,
  );
  assert.equal(writes, 0);
});
