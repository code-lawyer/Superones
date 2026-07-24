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
  const result = await processor(mixedBatch(), { payloadHash: "c".repeat(64), attempt: 1 });
  assert.deepEqual(result, {
    information: 1,
    publications: 1,
    profiles: 0,
    repositories: 0,
    rankings: 0,
  });
  assert.equal(calls.length, 2);
  assert.equal(requireNoQuarantine, true);
  const content = calls[0].value as { information: Array<{ originalTitle: string }> };
  assert.equal(content.information[0].originalTitle, "A material event");
  const publications = calls[1].value as { items: Array<{ sourceMaterial?: string }> };
  assert.equal(publications.items[0].sourceMaterial, "Full source material collected overseas.");
});

test("processor persists every ranking provider without invoking the LLM", async () => {
  const providers: string[] = [];
  const value = mixedBatch();
  value.records = [
    {
      ...value.records[0],
      kind: "ranking_observation",
      recordId: "ranking:hugging-face",
      payload: {
        provider: "hugging_face",
        items: [{ id: "model-1", name: "owner/model-1", downloadsAllTime: 100 }],
      },
    },
    {
      ...value.records[0],
      kind: "ranking_observation",
      recordId: "ranking:github-trending",
      sourceId: "github-trending",
      payload: {
        provider: "github_trending",
        items: [{
          owner: "owner",
          repo: "repo",
          stars: 10,
          delta24: 2,
          delta7: 5,
          description: "Repository",
          license: "MIT",
        }],
      },
    },
    {
      ...value.records[0],
      kind: "ranking_observation",
      recordId: "ranking:skills",
      sourceId: "skills",
      payload: {
        provider: "skills",
        selected: [{ id: "owner/skill", name: "Skill", value: 10, href: "https://skills.sh/owner/skill" }],
        totals: [{ id: "owner/skill", name: "Skill", value: 10, total: 10, href: "https://skills.sh/owner/skill" }],
      },
    },
  ];
  value.sourceReports = [
    { ...value.sourceReports[0], recordCount: 1 },
    { ...value.sourceReports[0], sourceId: "github-trending", recordCount: 1 },
    { ...value.sourceReports[0], sourceId: "skills", recordCount: 1 },
  ];
  const processor = createAcquisitionBatchProcessor({
    async persistOfficialRankings(input) {
      providers.push("official");
      return {
        capturedAt: input.capturedAt,
        huggingFace: input.huggingFace?.length ?? 0,
        openRouter: input.openRouter?.length ?? 0,
      };
    },
    async persistGithubRankings(input) {
      providers.push("github");
      return {
        capturedAt: input.capturedAt,
        trending: input.trending?.items.length ?? 0,
        daily: input.daily?.items.length ?? 0,
        weekly: input.weekly?.items.length ?? 0,
      };
    },
    async persistExtensionRankings(input) {
      providers.push("extensions");
      return {
        capturedAt: input.capturedAt,
        skills: input.skills?.selected.length ?? 0,
        mcps: input.mcps?.selected.length ?? 0,
      };
    },
  });
  const result = await processor(value, { payloadHash: "d".repeat(64), attempt: 1 });
  assert.deepEqual(providers, ["official", "github", "extensions"]);
  assert.equal(result.rankings, 3);
});

test("processor fails visibly when a record kind has no domestic adapter", async () => {
  const value = mixedBatch();
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
